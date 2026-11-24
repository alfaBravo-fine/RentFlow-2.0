import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePack, usePackStore } from '../../countries/usePack';
import { AVAILABLE_PACKS } from '../../countries/resolver';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Globe,
  AlertCircle,
  Wrench,
  Percent,
  Check,
  CheckCircle2,
  Play,
  Cloud,
  RefreshCw,
  Upload,
  ShieldCheck,
} from '../../components/icons';
import { useToast } from '../../components/toast/ToastContext';
import { databaseService } from '../../db/DatabaseService';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import { useAuthStore } from '../../stores/authStore';
import { useAuth } from '../auth/AuthProvider';
import { pushToGoogleDrive } from '../../lib/googleDriveService';
import { parseMajorToMinor, minorToMajorNumber } from '../../lib/money';
import {
  tauriGetAutostartEnabled,
  tauriSetAutostartEnabled,
} from '../../lib/tauri/bridge';
import { START_TOUR_EVENT } from '../../hooks/useAppTour';

export const SettingsGeneral: React.FC = () => {
  const navigate = useNavigate();
  const pack = usePack();
  const setCountryCode = usePackStore((s) => s.setCountryCode);
  const { showToast } = useToast();

  // Mode & Cloud Linking State
  const appMode = useAuthStore((s) => s.appMode);
  const setAppMode = useAuthStore((s) => s.setAppMode);
  const user = useAuthStore((s) => s.user);
  const { loginWithGoogle, isAuthenticating } = useAuth();
  const [isUploadPromptOpen, setIsUploadPromptOpen] = useState(false);
  const [isUploadingFirstSnapshot, setIsUploadingFirstSnapshot] = useState(false);

  // Launch at Windows Startup state
  const launchAtStartup = useAppSettingsStore((s) => s.launchAtStartup);
  const setLaunchAtStartup = useAppSettingsStore((s) => s.setLaunchAtStartup);
  const [isUpdatingStartup, setIsUpdatingStartup] = useState(false);

  // Sync actual OS autostart status from Tauri desktop backend
  useEffect(() => {
    let active = true;
    tauriGetAutostartEnabled()
      .then((enabled) => {
        if (active) {
          setLaunchAtStartup(enabled);
        }
      })
      .catch((err) => {
        console.warn('[SettingsGeneral] Could not query autostart status:', err);
      });
    return () => {
      active = false;
    };
  }, [setLaunchAtStartup]);

  const handleLinkGoogleDrive = async () => {
    await loginWithGoogle();
    const authState = useAuthStore.getState();
    if (authState.isAuthenticated && authState.user) {
      setAppMode('cloud');
      setIsUploadPromptOpen(true);
      showToast({
        type: 'success',
        message: `Connected ${authState.user.email}. Cloud backup features are now active.`,
      });
    }
  };

  const handleUploadFirstSnapshot = async () => {
    const activeUser = useAuthStore.getState().user;
    if (!activeUser?.sub) return;
    setIsUploadingFirstSnapshot(true);
    try {
      const res = await pushToGoogleDrive(activeUser.sub);
      setIsUploadPromptOpen(false);
      showToast({
        type: 'success',
        message: `Uploaded initial snapshot (${res.filename || 'RentFlow Backup'}) to Google Drive.`,
      });
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Could not upload initial snapshot to Google Drive.';
      showToast({ type: 'error', message: msg });
    } finally {
      setIsUploadingFirstSnapshot(false);
    }
  };

  const handleToggleStartup = async () => {
    const nextState = !launchAtStartup;
    setIsUpdatingStartup(true);
    try {
      const confirmedState = await tauriSetAutostartEnabled(nextState);
      setLaunchAtStartup(confirmedState);
      void databaseService.saveSetting('launchAtStartup', confirmedState);
      showToast({
        type: 'success',
        message: confirmedState
          ? 'RentFlow will launch automatically on Windows startup.'
          : 'Windows startup launch disabled.',
      });
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Failed to update Windows startup setting.';
      showToast({ type: 'error', message: msg });
    } finally {
      setIsUpdatingStartup(false);
    }
  };

  // Agency Commission
  const agencyCommissionStored = useAppSettingsStore((s) => s.agencyCommissionPct);
  const setAgencyCommissionPct = useAppSettingsStore((s) => s.setAgencyCommissionPct);
  const [agencyCommission, setAgencyCommission] = useState<number>(agencyCommissionStored);

  // Maintenance Approval Threshold
  const thresholdMinorStored = useAppSettingsStore((s) => s.maintenanceApprovalThresholdMinor);
  const setMaintenanceApprovalThresholdMinor = useAppSettingsStore(
    (s) => s.setMaintenanceApprovalThresholdMinor
  );
  const [maintenanceThresholdMajor, setMaintenanceThresholdMajor] = useState<number>(() => {
    if (thresholdMinorStored > 0) {
      return minorToMajorNumber(thresholdMinorStored, pack);
    }
    return pack.currency.code === 'PKR' || pack.currency.code === 'INR' ? 5000 : 500;
  });

  const handlePackChange = (newCode: string) => {
    setCountryCode(newCode);
    void databaseService.saveSetting('countryCode', newCode);
    showToast({
      type: 'success',
      message: `Active country pack changed to ${newCode}. Currency and legal rules updated.`,
    });
  };

  const handleSaveCommission = (e: React.FormEvent) => {
    e.preventDefault();
    setAgencyCommissionPct(agencyCommission);
    void databaseService.saveSetting('agencyCommissionPct', agencyCommission);
    showToast({
      type: 'success',
      message: `Agency management commission rate set to ${agencyCommission}%.`,
    });
  };

  const handleSaveMaintenanceThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    const minorValue = parseMajorToMinor(maintenanceThresholdMajor, pack);
    setMaintenanceApprovalThresholdMinor(minorValue);
    void databaseService.saveSetting('maintenanceApprovalThresholdMinor', minorValue);
    showToast({
      type: 'success',
      message: `Maintenance approval threshold set to ${pack.currency.symbol} ${maintenanceThresholdMajor.toLocaleString()}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Storage & Cloud Mode Upgrade Card */}
      <Card className="space-y-4">
        <CardHeader className="mb-1">
          <div>
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-[var(--accent)]" />
              <CardTitle>Google Drive Cloud Backup</CardTitle>
            </div>
            <CardDescription>
              {appMode === 'cloud' && user
                ? 'Encrypted cloud backup and versioned snapshot history are active.'
                : 'Currently running in Offline & Private mode. Link your Google account to enable encrypted backups.'}
            </CardDescription>
          </div>
          <span className="text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">
            {appMode === 'cloud' && user ? 'Cloud Mode' : 'Offline Mode'}
          </span>
        </CardHeader>

        {appMode === 'local' || !user ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[var(--border-subtle)]">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Upgrade to Encrypted Cloud Backup
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed max-w-xl">
                Sign in with Google to unlock automatic backups to your visible{' '}
                <code className="font-mono">RentFlow Backups</code> folder and restore snapshots across devices.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleLinkGoogleDrive()}
              disabled={isAuthenticating}
              className="shrink-0 gap-2 whitespace-nowrap cursor-pointer"
            >
              {isAuthenticating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Linking Google...</span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Link Google Drive</span>
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Linked Account:{' '}
                <strong className="text-[var(--text-primary)]">{user.email}</strong>
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate('/sync')}
              className="shrink-0 whitespace-nowrap"
            >
              Manage Snapshots
            </Button>
          </div>
        )}
      </Card>

      {/* System & Desktop Startup Preferences */}
      <Card className="space-y-4">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-[var(--accent)]" />
              <CardTitle>Desktop Startup Preferences</CardTitle>
            </div>
            <CardDescription>
              Control how RentFlow integrates with your Windows desktop session.
            </CardDescription>
          </div>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {launchAtStartup ? 'Enabled' : 'Disabled'}
          </span>
        </CardHeader>

        <div className="flex items-center justify-between gap-4 pt-3 border-t border-[var(--border-subtle)]">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Launch RentFlow on Windows Startup
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed max-w-xl">
              Automatically starts RentFlow in the background when you sign in to Windows so rent reminders,
              lease expiration alerts, and encrypted Drive sync stay ready.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleStartup()}
            disabled={isUpdatingStartup}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring disabled:opacity-60 ${
              launchAtStartup ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
            }`}
            role="switch"
            aria-checked={launchAtStartup}
            aria-label="Launch RentFlow on Windows Startup"
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                launchAtStartup ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 pt-3 border-t border-[var(--border-subtle)]">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Interactive Onboarding Walkthrough
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed max-w-xl">
              Replay the guided step-by-step tour covering properties, units, tenants, leases, invoicing,
              maintenance, and themes.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => window.dispatchEvent(new CustomEvent(START_TOUR_EVENT))}
            className="shrink-0"
          >
            Restart Tour
          </Button>
        </div>
      </Card>

      {/* Active Jurisdiction Pack */}
      <Card className="space-y-4">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[var(--accent)]" />
              <CardTitle>Country Pack Jurisdiction</CardTitle>
            </div>
            <CardDescription>
              Regional tenancy compliance rules, tax exemptions, and currency formatting.
            </CardDescription>
          </div>
          <span className="text-xs font-medium text-[var(--accent)] whitespace-nowrap">
            {pack.name} · {pack.code}
          </span>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          The selected Country Pack sets local tenancy compliance laws, deposit interest rules, late fee caps,
          and currency formatting. Historical invoices and payments remain frozen with their original currency.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Active Jurisdiction
            </label>
            <select
              value={pack.code}
              onChange={(e) => handlePackChange(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus-ring cursor-pointer"
            >
              {AVAILABLE_PACKS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.flag} {p.name} ({p.code}) — {p.currency.code}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] text-xs space-y-1">
            <div className="text-[var(--text-secondary)]">Currency &amp; Units</div>
            <div className="font-semibold text-[var(--text-primary)] tabular-nums">
              {pack.currency.code} ({pack.currency.symbol}) · {pack.areaUnit.toUpperCase()}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] tabular-nums">
              Decimals: {pack.currency.minorUnits} · Date: {pack.dateFormat}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] text-xs space-y-1">
            <div className="text-[var(--text-secondary)]">Legal &amp; Tenancy Rules</div>
            <div className="font-semibold text-[var(--text-primary)] tabular-nums">
              Deposit Max: {pack.deposit.maxMonths ? `${pack.deposit.maxMonths} mo` : 'No Cap'}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] tabular-nums">
              Notice: {pack.noticePeriods.rentIncreaseDays}d · Interest:{' '}
              {pack.deposit.interestRequired ? 'Required' : 'None'}
            </div>
          </div>
        </div>

        {pack.lateFee.islamicFinanceMode && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Islamic Finance Tenancy Mode Active:</strong> Late fees cannot accrue interest. Any late
              penalty collections must be allocated to designated charitable distributions.
            </div>
          </div>
        )}
      </Card>

      {/* Petty Cash & Maintenance Approval Threshold */}
      <Card className="space-y-4">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-[var(--accent)]" />
              <CardTitle>Maintenance Approval Threshold</CardTitle>
            </div>
            <CardDescription>
              Require admin approval when repair costs exceed this amount.
            </CardDescription>
          </div>
          <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
            {pack.currency.symbol} {maintenanceThresholdMajor.toLocaleString()}
          </span>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Any maintenance work order where estimated or actual cost exceeds this limit requires explicit Admin
          Approval before it can be closed or converted into an operating expense.
        </p>

        <form onSubmit={handleSaveMaintenanceThreshold} className="flex flex-wrap items-center gap-3 max-w-md">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-2.5 text-xs text-[var(--text-secondary)] font-mono">
              {pack.currency.symbol}
            </span>
            <Input
              type="number"
              step="1"
              min="0"
              value={maintenanceThresholdMajor}
              onChange={(e) => setMaintenanceThresholdMajor(parseFloat(e.target.value) || 0)}
              className="pl-8 h-9 text-xs font-mono tabular-nums"
            />
          </div>
          <Button type="submit" size="sm" variant="primary">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Save Threshold</span>
          </Button>
        </form>
      </Card>

      {/* Agency Management Commission */}
      <Card className="space-y-4">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-[var(--accent)]" />
              <CardTitle>Agency Management Commission</CardTitle>
            </div>
            <CardDescription>
              Default fee deducted from gross rent before owner disbursement.
            </CardDescription>
          </div>
          <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
            {agencyCommission}%
          </span>
        </CardHeader>

        <form onSubmit={handleSaveCommission} className="flex items-center gap-3 max-w-sm">
          <div className="relative flex-1">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={agencyCommission}
              onChange={(e) => setAgencyCommission(parseFloat(e.target.value) || 0)}
              className="pr-8 h-9 text-xs font-mono tabular-nums"
            />
            <span className="absolute right-3 top-2.5 text-xs text-[var(--text-secondary)]">%</span>
          </div>
          <Button type="submit" size="sm" variant="primary">
            <Check className="w-3.5 h-3.5" />
            <span>Save Rate</span>
          </Button>
        </form>
      </Card>

      {/* Prompt to Upload First Snapshot after linking Google Drive */}
      <Modal
        isOpen={isUploadPromptOpen}
        onClose={() => {
          if (!isUploadingFirstSnapshot) {
            setIsUploadPromptOpen(false);
          }
        }}
        title="Upload Current Database to Google Drive?"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Your Google account is now linked. Would you like to upload your existing local SQLite database as your
            first encrypted snapshot in your <code className="font-mono">RentFlow Backups</code> folder?
          </p>
          <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploadingFirstSnapshot}
              onClick={() => setIsUploadPromptOpen(false)}
            >
              Skip for Now
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isUploadingFirstSnapshot}
              onClick={() => void handleUploadFirstSnapshot()}
              className="gap-1.5 whitespace-nowrap"
            >
              {isUploadingFirstSnapshot ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Uploading Snapshot...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload First Snapshot</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
