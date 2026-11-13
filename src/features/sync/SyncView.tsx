import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useDriveSync } from '../../hooks/useDriveSync';
import { syncEngine } from '../../lib/sync';
import { db } from '../../db/client';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  RefreshCw,
  Download,
  Upload,
  ShieldCheck,
  CheckCircle,
  FileSpreadsheet,
  Database,
  Lock,
  Folder,
  AlertCircle,
} from '../../components/icons';

export const SyncView: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const { syncState, lastSyncedAt, syncError, syncNow, restoreFromDrive, isRestoring } = useDriveSync();
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isManualRestoring, setIsManualRestoring] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const pendingCount = syncEngine.getPendingCount();

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    setStatusMsg('Encrypting full database snapshot + settings + themes with AES-256-GCM and uploading RentFlow_FullBackup.enc to drive.appdata...');
    try {
      await syncNow();
      setStatusMsg('Successfully synchronized RentFlow_FullBackup.enc to Google Drive (drive.appdata)');
    } catch (err: any) {
      setStatusMsg(err.message || 'Sync failed');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleRestoreFromDrive = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to restore from Google Drive? This will pull RentFlow_FullBackup.enc, decrypt all records, wipe current local data, and restore all properties, units, tenants, leases, invoices, payments, expenses, settings, and themes.'
    );
    if (!confirmed) return;

    setIsManualRestoring(true);
    setStatusMsg('Downloading RentFlow_FullBackup.enc from Google Drive, decrypting AES-256-GCM, and restoring all database tables, themes, and settings...');
    try {
      const res = await restoreFromDrive();
      if (res && res.restored) {
        setStatusMsg(`Successfully restored full portfolio (${res.totalRecords || 0} records across tables), custom themes, and settings from Google Drive!`);
      } else {
        setStatusMsg(res?.message || 'Restore completed (no backup found or already up to date).');
      }
    } catch (err: any) {
      setStatusMsg(`Restore error: ${err.message || 'Failed to restore from Google Drive'}`);
    } finally {
      setIsManualRestoring(false);
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
  };

  const handleExportAllDataCSV = () => {
    const tenants = db.getTable('tenants');
    const leases = db.getTable('leases');
    const invoices = db.getTable('invoices');
    const maintenance = db.getTable('maintenance_requests');

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
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Google Drive Encrypted Sync Hub
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Zero-Knowledge AES-256-GCM Cloud Redundancy &bull; Hidden <code className="font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">drive.appdata</code> Storage
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
            onClick={handleRestoreFromDrive}
            disabled={isManualSyncing || isManualRestoring || isRestoring || syncState === 'syncing'}
            className="gap-2 border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent-subtle)]/30"
          >
            <Download className={`w-3.5 h-3.5 ${isManualRestoring || isRestoring ? 'animate-bounce' : ''}`} />
            <span>{isManualRestoring || isRestoring ? 'Restoring from Drive...' : 'Restore from Drive'}</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleManualSync}
            disabled={isManualSyncing || isManualRestoring || isRestoring || syncState === 'syncing'}
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing || syncState === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{isManualSyncing || syncState === 'syncing' ? 'Syncing...' : 'Sync Now to Google Drive'}</span>
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
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Google Drive Sync Engine</h3>
              <Badge
                variant={
                  syncState === 'synced'
                    ? 'success'
                    : syncState === 'syncing' || syncState === 'pending'
                    ? 'info'
                    : syncState === 'error'
                    ? 'danger'
                    : 'neutral'
                }
              >
                {syncState === 'synced'
                  ? 'All Changes Synced'
                  : syncState === 'syncing'
                  ? 'Syncing to Drive...'
                  : syncState === 'pending'
                  ? 'Write Detected (Sync in 5s)'
                  : 'Idle'}
              </Badge>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Connected Account: <strong className="text-[var(--text-primary)]">{user?.email || 'Authenticated'}</strong> &bull;
              Last Synced: <span className="font-mono">{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Just now'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Key derived from Google ID: <code className="font-mono text-[11px]">{user?.sub?.slice(0, 8)}...</code></span>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="space-y-4 rounded-2xl">
          <CardHeader>
            <CardTitle>Cloud Drive Redundancy</CardTitle>
            <Badge variant="success">drive.appdata Scope</Badge>
          </CardHeader>
          <div className="space-y-2 text-xs text-[var(--text-secondary)]">
            <p><strong>Storage Space:</strong> Hidden <code className="bg-[var(--bg-base)] px-1 rounded">appDataFolder</code></p>
            <p><strong>Cipher:</strong> AES-256-GCM Authenticated</p>
            <p><strong>Auto-Trigger:</strong> 5s Debounce after DB writes</p>
            <p><strong>Local Queue:</strong> {pendingCount} recorded mutations</p>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <Button
              variant="outline"
              className="w-full justify-center text-xs"
              onClick={handleManualSync}
              disabled={isManualSyncing || isManualRestoring || isRestoring || syncState === 'syncing'}
            >
              Force Immediate Cloud Push
            </Button>
            <Button
              variant="outline"
              className="w-full justify-center text-xs border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent-subtle)]/30 gap-1.5"
              onClick={handleRestoreFromDrive}
              disabled={isManualSyncing || isManualRestoring || isRestoring || syncState === 'syncing'}
            >
              <Download className={`w-3.5 h-3.5 ${isManualRestoring || isRestoring ? 'animate-bounce' : ''}`} />
              <span>Restore Portfolio from Drive</span>
            </Button>
          </div>
        </Card>

        <Card className="space-y-4 rounded-2xl">
          <CardHeader>
            <CardTitle>Offline Encrypted Backup</CardTitle>
            <Badge variant="neutral">Zero-Knowledge</Badge>
          </CardHeader>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Export a standalone encrypted <code className="bg-[var(--bg-base)] px-1 rounded">.enc.json</code> payload to your local drive or offline flash drive.
          </p>
          <Button variant="outline" className="w-full gap-2" onClick={handleExportLocalBackup}>
            <Download className="w-4 h-4 text-[var(--accent)]" />
            <span>Download Encrypted Snapshot</span>
          </Button>
        </Card>

        <Card className="space-y-4 rounded-2xl">
          <CardHeader>
            <CardTitle>Portfolio Data Export</CardTitle>
            <Badge variant="info">Full Relational Export</Badge>
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
    </div>
  );
};
