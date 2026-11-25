import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useDriveSync } from '../../hooks/useDriveSync';
import { syncEngine } from '../../lib/sync';
import { db } from '../../db/client';
import { BackupManifestEntry, ChangeHistoryEntry } from '../../lib/tauri/bridge';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  formatChangeSummary,
  formatSnapshotSummary,
  RestoreModal,
} from '../../components/RestoreModal';
import { useToast } from '../../components/toast/ToastContext';
import {
  RefreshCw,
  Download,
  ShieldCheck,
  CheckCircle,
  FileSpreadsheet,
  Folder,
  AlertCircle,
  Calendar,
  Database,
  Cloud,
  History,
  RotateCcw,
} from '../../components/icons';

export const SyncView: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const appMode = useAuthStore((s) => s.appMode);
  const user = useAuthStore((s) => s.user);
  const {
    syncState,
    lastSyncedAt,
    syncError,
    syncNow,
    getGroupedBackupList,
    restoreFromSnapshot,
    revertChangeSnapshot,
    isRestoring,
  } = useDriveSync();

  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [historyTab, setHistoryTab] = useState<'full' | 'changes'>('full');
  const [fullBackups, setFullBackups] = useState<BackupManifestEntry[]>([]);
  const [changeHistory, setChangeHistory] = useState<ChangeHistoryEntry[]>([]);
  const [changesSinceFull, setChangesSinceFull] = useState(0);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [confirmFullEntry, setConfirmFullEntry] = useState<BackupManifestEntry | null>(null);
  const [confirmChangeEntry, setConfirmChangeEntry] = useState<ChangeHistoryEntry | null>(null);
  const [actingFilename, setActingFilename] = useState<string | null>(null);

  const pendingCount = syncEngine.getPendingCount();

  const loadGroupedBackups = useCallback(async () => {
    if (appMode !== 'cloud' || !user) return;
    setIsLoadingSnapshots(true);
    setSnapshotsError(null);
    try {
      const grouped = await getGroupedBackupList();
      setFullBackups(Array.isArray(grouped.full_backups) ? grouped.full_backups : []);
      setChangeHistory(Array.isArray(grouped.change_history) ? grouped.change_history : []);
      setChangesSinceFull(grouped.changes_since_full_backup ?? 0);
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message ||
            "Could not load grouped backups from 'RentFlow Grouped Backups' in Google Drive.";
      setSnapshotsError(msg);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [appMode, user, getGroupedBackupList]);

  useEffect(() => {
    if (appMode === 'cloud' && user) {
      void loadGroupedBackups();
    }
  }, [appMode, user, loadGroupedBackups]);

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    setStatusMsg(
      "Compiling encrypted full backup and uploading to 'RentFlow Grouped Backups' in Google Drive..."
    );
    try {
      const res = await syncNow();
      setStatusMsg(
        res?.filename
          ? `Saved full session backup ${res.filename} to 'RentFlow Grouped Backups'.`
          : "Successfully synchronized grouped full backup to 'RentFlow Grouped Backups'."
      );
      await loadGroupedBackups();
    } catch (err: any) {
      setStatusMsg(err.message || 'Sync failed');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleInlineRestoreFull = async (entry: BackupManifestEntry) => {
    setActingFilename(entry.filename);
    try {
      const res = await restoreFromSnapshot(entry.filename);
      if (res.restored) {
        setConfirmFullEntry(null);
        showToast({
          type: 'success',
          message: `Restored ${res.totalRecords} records from ${entry.filename}. Reloading RentFlow...`,
        });
        window.location.reload();
      } else {
        setSnapshotsError(res.message || 'Selected full backup did not contain restorable records.');
      }
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Failed to restore selected backup.';
      setSnapshotsError(msg);
      showToast({ type: 'error', message: msg });
    } finally {
      setActingFilename(null);
    }
  };

  const handleInlineRevertChange = async (entry: ChangeHistoryEntry) => {
    setActingFilename(entry.filename);
    try {
      const res = await revertChangeSnapshot(entry.filename);
      if (res.restored) {
        setConfirmChangeEntry(null);
        showToast({
          type: 'success',
          message: res.message || `Reverted ${entry.filename}`,
        });
        setStatusMsg(res.message || `Reverted single change ${entry.filename}.`);
        await loadGroupedBackups();
      } else {
        setSnapshotsError(res.message || 'Could not revert this change snapshot.');
      }
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Failed to revert selected change.';
      setSnapshotsError(msg);
      showToast({ type: 'error', message: msg });
    } finally {
      setActingFilename(null);
    }
  };

  const handleExportLocalBackup = async () => {
    const encrypted = await syncEngine.exportEncryptedSnapshot();
    const blob = new Blob([JSON.stringify(encrypted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentflow_backup_${new Date().toISOString().slice(0, 10)}.enc.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllDataCSV = () => {
    const tenants = db.getTable('tenants');
    const leases = db.getTable('leases');
    const invoices = db.getTable('invoices');

    let csv = `EXPORT DATE,${new Date().toISOString()}\n\n`;

    csv += `TENANTS DIRECTORY\nID,Name,Email,Phone,ID Type,ID Number\n`;
    tenants.forEach((t: any) => {
      csv += `"${t.id}","${t.name}","${t.email}","${t.phone}","${t.id_type}","${t.id_number}"\n`;
    });

    csv += `\nLEASES\nID,Unit ID,Tenant ID,Rent Minor,Deposit Minor,Status\n`;
    leases.forEach((l: any) => {
      csv += `"${l.id}","${l.unit_id}","${l.tenant_id}",${l.rent_minor},${l.deposit_minor},"${l.status}"\n`;
    });

    csv += `\nINVOICES & RENT ROLL\nID,Lease ID,Due Date,Total Minor,Paid Minor,Status\n`;
    invoices.forEach((i: any) => {
      csv += `"${i.id}","${i.lease_id}","${i.due_date}",${i.total_minor},${i.amount_paid_minor},"${i.status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentflow_all_records_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (appMode !== 'cloud') {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card className="p-8 text-center space-y-4 rounded-2xl">
          <div className="w-12 h-12 rounded-2xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center justify-center mx-auto">
            <Cloud className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Cloud Backup Not Linked
            </h2>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
              RentFlow is currently running in Offline &amp; Private mode. Link your Google Drive in General Settings to enable automatic grouped cloud backups.
            </p>
          </div>
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => navigate('/settings/general')}
            >
              Open General Settings
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Drive Sync &amp; Backup
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Smart Grouped Sync (AES-256-GCM) &bull; Visible{' '}
            <code className="font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
              RentFlow Grouped Backups
            </code>{' '}
            Folder
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleExportAllDataCSV} className="gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsRestoreModalOpen(true);
            }}
            disabled={isManualSyncing || isRestoring || syncState === 'syncing'}
            className="gap-2 border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent-subtle)]/30"
          >
            <Download className={`w-3.5 h-3.5 ${isRestoring ? 'animate-bounce' : ''}`} />
            <span>{isRestoring ? 'Restoring...' : 'Restore from Drive'}</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleManualSync}
            disabled={isManualSyncing || isRestoring || syncState === 'syncing'}
            className="gap-2"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isManualSyncing || syncState === 'syncing' ? 'animate-spin' : ''
              }`}
            />
            <span>
              {isManualSyncing || syncState === 'syncing'
                ? 'Syncing...'
                : 'Compile Full Backup Now'}
            </span>
          </Button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{statusMsg}</span>
        </div>
      )}

      {syncError && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      {/* Sync Status Banner */}
      <Card className="p-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
            <Folder className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Smart Grouped Sync Engine
              </h3>
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {syncState === 'synced'
                  ? '· Synced automatically'
                  : syncState === 'syncing'
                  ? '· Syncing to Drive...'
                  : syncState === 'pending'
                  ? '· Change Queued (Syncing in 500ms)'
                  : '· Automatic Background Sync Active'}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
              Connected Account:{' '}
              <strong className="text-[var(--text-primary)]">
                {user?.email || 'Authenticated'}
              </strong>{' '}
              &bull; Last Synced:{' '}
              <span className="font-mono">
                {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Ready'}
              </span>
              {' · '}
              <span>{changesSinceFull}/10 changes since last Full Backup</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Encryption key bound to Google ID:{' '}
            <code className="font-mono text-[11px]">{user?.sub?.slice(0, 8)}...</code>
          </span>
        </div>
      </Card>

      {/* Two-Tab Smart Grouped Backup History Directly Inside Sync Tab */}
      <Card className="space-y-4 rounded-2xl">
        <CardHeader className="mb-1">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-[var(--accent)]" />
            <div>
              <CardTitle>Grouped Backups &amp; Change History</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Restore a full session backup from <code className="font-mono">RentFlow Grouped Backups</code> or revert an individual change.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void loadGroupedBackups();
            }}
            disabled={isLoadingSnapshots || Boolean(actingFilename)}
            className="gap-1.5 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSnapshots ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </CardHeader>

        <div
          role="tablist"
          aria-label="Backup view"
          className="grid grid-cols-2 max-w-md p-1 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={historyTab === 'full'}
            onClick={() => setHistoryTab('full')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              historyTab === 'full'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Full Backups ({fullBackups.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={historyTab === 'changes'}
            onClick={() => setHistoryTab('changes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              historyTab === 'changes'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Change History ({changeHistory.length})</span>
          </button>
        </div>

        {snapshotsError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{snapshotsError}</span>
          </div>
        )}

        {isLoadingSnapshots ? (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-2.5">
            <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent)]" />
            <p className="text-xs text-[var(--text-secondary)]">
              Loading grouped backup manifest from Google Drive...
            </p>
          </div>
        ) : historyTab === 'full' ? (
          fullBackups.length === 0 ? (
            <div className="py-8 px-4 text-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface-sunken)] space-y-2">
              <Cloud className="w-6 h-6 mx-auto text-[var(--text-subtle)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                No full session backups uploaded yet
              </p>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                Full Backups (FULL_BACKUP_YYYY-MM-DD.enc) are compiled automatically every 24 hours or every 10 small changes.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-surface-sunken)]/40">
              {fullBackups.map((entry, idx) => {
                const summaryLabel = formatSnapshotSummary(entry);
                const isThisRestoring = actingFilename === entry.filename;

                return (
                  <div
                    key={`${entry.filename}-${idx}`}
                    className="p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-base)] transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                          {summaryLabel}
                        </span>
                        {idx === 0 && (
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            · Latest
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                        <span className="font-mono truncate">{entry.filename}</span>
                        {typeof entry.record_count === 'number' && (
                          <span className="inline-flex items-center gap-1">
                            <Database className="w-3 h-3" />
                            <span>{entry.record_count} records</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmFullEntry(entry)}
                      disabled={Boolean(actingFilename) || isManualSyncing || isRestoring}
                      className="gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
                    >
                      <Download className={`w-3.5 h-3.5 ${isThisRestoring ? 'animate-bounce' : ''}`} />
                      <span>{isThisRestoring ? 'Restoring...' : 'Restore'}</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          )
        ) : changeHistory.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface-sunken)] space-y-2">
            <History className="w-6 h-6 mx-auto text-[var(--text-subtle)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              No individual changes recorded yet
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
              Adding, editing, or deleting a Property, Tenant, Lease, or Invoice automatically uploads an encrypted change file (last 20 kept).
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-surface-sunken)]/40">
            {changeHistory.map((entry, idx) => {
              const summaryLabel = formatChangeSummary(entry);
              const isThisReverting = actingFilename === entry.filename;

              return (
                <div
                  key={`${entry.filename}-${idx}`}
                  className="p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-base)] transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RotateCcw className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                        {summaryLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                      <span className="font-mono truncate">{entry.filename}</span>
                      <span>· {entry.table}</span>
                      <span>· {entry.size}</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmChangeEntry(entry)}
                    disabled={Boolean(actingFilename) || isManualSyncing || isRestoring}
                    className="gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isThisReverting ? 'animate-spin' : ''}`} />
                    <span>{isThisReverting ? 'Reverting...' : 'Revert Change'}</span>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="space-y-4 rounded-2xl">
          <CardHeader>
            <CardTitle>Smart Grouped Sync</CardTitle>
            <span className="text-xs font-medium text-emerald-600">Google Drive</span>
          </CardHeader>
          <div className="space-y-2 text-xs text-[var(--text-secondary)] tabular-nums">
            <p>
              <strong>Drive Folder:</strong> Visible{' '}
              <code className="bg-[var(--bg-base)] px-1 rounded">RentFlow Grouped Backups</code>
            </p>
            <p>
              <strong>Small Changes:</strong> Last 20 saved on every edit
            </p>
            <p>
              <strong>Full Backups:</strong> Every 10 changes or 24 hours
            </p>
            <p>
              <strong>Pending Changes:</strong> {pendingCount} queued updates
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full justify-center text-xs"
            onClick={handleManualSync}
            disabled={isManualSyncing || isRestoring || syncState === 'syncing'}
          >
            Compile Full Backup Now
          </Button>
        </Card>

        <Card className="space-y-4 rounded-2xl">
          <CardHeader>
            <CardTitle>Offline Encrypted Backup</CardTitle>
            <span className="text-xs font-medium text-[var(--text-secondary)]">AES-256-GCM</span>
          </CardHeader>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Export a standalone encrypted{' '}
            <code className="bg-[var(--bg-base)] px-1 rounded">.enc.json</code> payload to your local drive or external storage.
          </p>
          <Button variant="outline" className="w-full gap-2" onClick={handleExportLocalBackup}>
            <Download className="w-4 h-4 text-[var(--accent)]" />
            <span>Download Encrypted Snapshot</span>
          </Button>
        </Card>

        <Card className="space-y-4 rounded-2xl">
          <CardHeader>
            <CardTitle>Portfolio Data Export</CardTitle>
            <span className="text-xs font-medium text-[var(--accent)]">CSV Archive</span>
          </CardHeader>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Export all tenants, leases, deposits, maintenance records, and rent invoices into a unified CSV archive.
          </p>
          <Button variant="outline" className="w-full gap-2" onClick={handleExportAllDataCSV}>
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export All Records (CSV)</span>
          </Button>
        </Card>
      </div>

      {/* Full Backup Restore Confirmation Modal */}
      <Modal
        isOpen={Boolean(confirmFullEntry)}
        onClose={() => !actingFilename && setConfirmFullEntry(null)}
        title="Restore Full Backup?"
        description="Replaces your current local portfolio data with the selected full session backup."
        maxWidth="md"
      >
        {confirmFullEntry && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
              <p className="font-semibold">{formatSnapshotSummary(confirmFullEntry)}</p>
              <p className="font-mono text-[11px] opacity-90">{confirmFullEntry.filename}</p>
              <p className="text-[11px] opacity-90 leading-relaxed pt-1">
                RentFlow will download and decrypt this full backup, replace your local portfolio data, and reload the application.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmFullEntry(null)}
                disabled={Boolean(actingFilename)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handleInlineRestoreFull(confirmFullEntry)}
                disabled={Boolean(actingFilename)}
                className="gap-1.5"
              >
                {actingFilename ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Confirm Restore</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Single Change Revert Confirmation Modal */}
      <Modal
        isOpen={Boolean(confirmChangeEntry)}
        onClose={() => !actingFilename && setConfirmChangeEntry(null)}
        title="Revert This Change?"
        description="Reverts only this specific record change without disturbing any other data."
        maxWidth="md"
      >
        {confirmChangeEntry && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
              <p className="font-semibold">{formatChangeSummary(confirmChangeEntry)}</p>
              <p className="font-mono text-[11px] opacity-90">{confirmChangeEntry.filename}</p>
              <p className="text-[11px] opacity-90 leading-relaxed pt-1">
                RentFlow will decrypt this change snapshot and undo only this recorded change in{' '}
                <strong>{confirmChangeEntry.table.replace(/_/g, ' ')}</strong>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmChangeEntry(null)}
                disabled={Boolean(actingFilename)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handleInlineRevertChange(confirmChangeEntry)}
                disabled={Boolean(actingFilename)}
                className="gap-1.5"
              >
                {actingFilename ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Reverting...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Confirm Revert</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <RestoreModal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        onRestored={(res) => {
          setStatusMsg(
            res.message ||
              `Successfully restored ${res.totalRecords || 0} records from ${res.filename || ''}.`
          );
          void loadGroupedBackups();
        }}
      />
    </div>
  );
};
