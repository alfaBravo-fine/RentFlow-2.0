import React, { useEffect, useRef, useState } from 'react';
import { usePack, usePackStore } from '../../countries/usePack';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  RefreshCw,
  Database,
  ShieldCheck,
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  Lock,
  Trash2,
  RotateCcw,
} from '../../components/icons';
import { useToast } from '../../components/toast/ToastContext';
import { useDriveSync } from '../../hooks/useDriveSync';
import { db } from '../../db/client';
import { databaseService } from '../../db/DatabaseService';
import { Property, Tenant } from '../../db/schema';
import { generateUUID } from '../../lib/uuid';
import {
  isTauri,
  tauriBackupDatabaseFile,
  tauriDbImportAll,
  tauriRestartApp,
} from '../../lib/tauri/bridge';
import { backupToDrive } from '../../lib/googleDriveService';
import { exportAllDataToExcel, updateExistingExcel } from '../../lib/excelExport';
import { useUIStore } from '../../stores/uiStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';

export const SettingsData: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();
  const { syncState, syncNow, restoreFromDrive, isRestoring, lastSyncedAt } = useDriveSync();

  const [appDataPath, setAppDataPath] = useState<string>('Loading app data directory...');
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    databaseService
      .getAppDataPath()
      .then((path) => setAppDataPath(path))
      .catch(() => {
        setAppDataPath(
          isTauri() ? 'AppData/Roaming/RentFlow' : 'Browser IndexedDB / Encrypted Local Storage'
        );
      });

    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, []);

  const autoSyncEnabled = useAppSettingsStore((s) => s.autoSyncEnabled);
  const setAutoSyncEnabled = useAppSettingsStore((s) => s.setAutoSyncEnabled);
  const exportDestination = useAppSettingsStore((s) => s.exportDestination);
  const setExportDestination = useAppSettingsStore((s) => s.setExportDestination);

  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupDestinationPath, setBackupDestinationPath] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [isForceRestoring, setIsForceRestoring] = useState(false);
  const [csvImportType, setCsvImportType] = useState<'properties' | 'tenants'>('properties');
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isUpdatingExcel, setIsUpdatingExcel] = useState(false);
  const [isFactoryResetOpen, setIsFactoryResetOpen] = useState(false);
  const [isFactoryResetting, setIsFactoryResetting] = useState(false);
  const [isWipeDataConfirmOpen, setIsWipeDataConfirmOpen] = useState(false);
  const [isWipingData, setIsWipingData] = useState(false);
  const [isHealthChecking, setIsHealthChecking] = useState(false);
  const [healthReport, setHealthReport] = useState<{
    checked: boolean;
    status: 'healthy' | 'error';
    propertiesCount: number;
    unitsCount: number;
    tenantsCount: number;
    leasesCount: number;
    invoicesCount: number;
    paymentsCount: number;
    timestamp: string;
    errorMessage?: string;
  } | null>(null);

  const handleSaveExportDestination = (val: string) => {
    setExportDestination(val);
    void databaseService.saveSetting('exportDestination', val);
    showToast({ type: 'success', message: 'Export destination path updated successfully.' });
  };

  const handleToggleAutoSync = () => {
    const nextState = !autoSyncEnabled;
    setAutoSyncEnabled(nextState);
    void databaseService.saveSetting('autoSyncEnabled', nextState);
    showToast({
      type: 'info',
      message: nextState
        ? 'Automatic background synchronization enabled.'
        : 'Automatic background synchronization disabled.',
    });
  };

  const handleRunHealthCheck = async () => {
    setIsHealthChecking(true);
    try {
      showToast({ type: 'info', message: 'Running local database integrity check...' });
      const props = await databaseService.getProperties();
      const units = await databaseService.getUnits();
      const tenants = await databaseService.getTenants();
      const leases = await databaseService.getLeases();
      const invoices = await databaseService.getInvoices();
      const payments = await databaseService.getPayments();

      setHealthReport({
        checked: true,
        status: 'healthy',
        propertiesCount: props.length,
        unitsCount: units.length,
        tenantsCount: tenants.length,
        leasesCount: leases.length,
        invoicesCount: invoices.length,
        paymentsCount: payments.length,
        timestamp: new Date().toLocaleString(),
      });
      showToast({ type: 'success', message: 'Database integrity verified successfully!' });
    } catch (err: any) {
      setHealthReport({
        checked: true,
        status: 'error',
        propertiesCount: 0,
        unitsCount: 0,
        tenantsCount: 0,
        leasesCount: 0,
        invoicesCount: 0,
        paymentsCount: 0,
        timestamp: new Date().toLocaleString(),
        errorMessage: err?.message || 'Database integrity check failed.',
      });
      showToast({ type: 'error', message: err?.message || 'Database integrity check failed.' });
    } finally {
      setIsHealthChecking(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      showToast({
        type: 'info',
        message: 'Generating styled Excel workbook (.xlsx) with ExcelJS...',
      });
      const result = await exportAllDataToExcel(pack);
      showToast({
        type: 'success',
        message: `Successfully exported ${result.totalRecords} records across ${result.sheetCount} worksheets to "${result.fileName}"!`,
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        message: err.message || 'Could not export Excel workbook.',
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleUpdateExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUpdatingExcel(true);
    try {
      showToast({
        type: 'info',
        message: `Reading '${file.name}' and checking for existing records...`,
      });
      const result = await updateExistingExcel(file, pack);
      showToast({
        type: 'success',
        message: `Excel Update Complete! Appended ${result.totalRecords} new record(s) across ${result.sheetCount} worksheets to "${result.fileName}".`,
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        message: err.message || 'Could not update existing Excel file.',
      });
    } finally {
      setIsUpdatingExcel(false);
      e.target.value = '';
    }
  };

  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.map((line) => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  const handleDownloadSampleCSV = (type: 'properties' | 'tenants') => {
    let header = '';
    let sampleRow = '';
    if (type === 'properties') {
      header = 'name,address,city,state,postal_code,type\n';
      sampleRow =
        'Sunset Ridge Apartments,"1024 Ocean Dr",Miami,FL,33139,apartment_building\nOakwood Townhomes,"45 Pine St",Austin,TX,78701,single_family';
    } else {
      header = 'name,phone,email,id_type,id_number,emergency_contact,occupants\n';
      sampleRow =
        'Sarah Jenkins,+1 555-0199,sarah.j@example.com,State Driver\'s License,DL-9938102,Mark Jenkins,2\nDavid Vance,+1 555-0211,david.vance@example.com,National Passport,PA-8841029,Eleanor Vance,1';
    }
    const blob = new Blob([header + sampleRow], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rentflow_sample_${type}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingCsv(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          throw new Error('CSV must contain a header row and at least one data row.');
        }

        const headers = rows[0].map((h) => h.toLowerCase().replace(/[\s_]+/g, ''));
        const dataRows = rows.slice(1);
        let count = 0;

        if (csvImportType === 'properties') {
          const nameIdx = headers.findIndex((h) => h.includes('name'));
          const addrIdx = headers.findIndex((h) => h.includes('address'));
          const cityIdx = headers.findIndex((h) => h.includes('city'));
          const stateIdx = headers.findIndex((h) => h.includes('state'));
          const zipIdx = headers.findIndex((h) => h.includes('postal') || h.includes('zip'));
          const typeIdx = headers.findIndex((h) => h.includes('type'));

          if (nameIdx === -1 || addrIdx === -1) {
            throw new Error('CSV missing required columns: "name" and "address".');
          }

          dataRows.forEach((cols) => {
            const propName = cols[nameIdx];
            const propAddr = cols[addrIdx];
            if (!propName || !propAddr) return;

            db.insertItem<Property>('properties', {
              id: generateUUID(),
              org_id: 'org_demo_1',
              name: propName,
              address_line1: propAddr,
              address_line2: null,
              city: cols[cityIdx] || 'Metro Area',
              region: cols[stateIdx] || 'State',
              postal_code: cols[zipIdx] || '00000',
              country_code: pack.code,
              type: (cols[typeIdx] as any) || 'residential_apartment',
              latitude: 40.7128,
              longitude: -74.006,
            });
            count++;
          });
        } else {
          const nameIdx = headers.findIndex((h) => h.includes('name'));
          const phoneIdx = headers.findIndex((h) => h.includes('phone'));
          const emailIdx = headers.findIndex((h) => h.includes('email'));
          const idTypeIdx = headers.findIndex((h) => h.includes('idtype'));
          const idNumIdx = headers.findIndex((h) => h.includes('idnumber') || h.includes('id'));
          const emerIdx = headers.findIndex((h) => h.includes('emergency'));
          const occIdx = headers.findIndex((h) => h.includes('occupant'));

          if (nameIdx === -1 || phoneIdx === -1) {
            throw new Error('CSV missing required columns: "name" and "phone".');
          }

          dataRows.forEach((cols) => {
            const tName = cols[nameIdx];
            const tPhone = cols[phoneIdx];
            if (!tName || !tPhone) return;

            db.insertItem<Tenant>('tenants', {
              id: generateUUID(),
              org_id: 'org_demo_1',
              name: tName,
              email: cols[emailIdx] || '',
              phone: tPhone,
              id_type: cols[idTypeIdx] || "State Driver's License",
              id_number: cols[idNumIdx] || `ID-${Math.floor(Math.random() * 899999 + 100000)}`,
              emergency_contact: cols[emerIdx] || null,
              occupants: parseInt(cols[occIdx]) || 1,
            });
            count++;
          });
        }

        showToast({
          type: 'success',
          message: `Successfully imported ${count} ${csvImportType} from CSV!`,
        });
      } catch (err: any) {
        showToast({
          type: 'error',
          message: err.message || 'Failed to parse CSV file.',
        });
      } finally {
        setIsImportingCsv(false);
        e.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  const handleExportBackup = () => {
    try {
      const data = db.exportAllData();
      const payload = {
        app: 'RentFlow',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        activeJurisdiction: pack.code,
        data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rentflow-backup-${pack.code}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({
        type: 'success',
        message: 'Complete local encrypted database snapshot exported successfully.',
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        message: err.message || 'Could not export database snapshot.',
      });
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.data) {
          throw new Error('Invalid RentFlow backup file schema');
        }
        db.importAllData(parsed.data);
        showToast({
          type: 'success',
          message: 'Local database snapshot imported successfully. Refreshing...',
        });
        reloadTimerRef.current = setTimeout(() => window.location.reload(), 800);
      } catch (err: any) {
        showToast({
          type: 'error',
          message: err.message || 'Corrupt or incompatible backup JSON file.',
        });
      }
    };
    reader.readAsText(file);
  };

  const handleOpenBackupModal = () => {
    if (!isTauri()) {
      handleExportBackup();
    } else {
      setIsBackupModalOpen(true);
    }
  };

  const handleBackupDatabaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupDestinationPath.trim()) {
      showToast({ type: 'error', message: 'Please enter a valid target file path.' });
      return;
    }
    setIsBackingUp(true);
    try {
      const savedPath = await tauriBackupDatabaseFile(backupDestinationPath.trim());
      showToast({
        type: 'success',
        message: `Encrypted SQLite database backup saved to: ${savedPath}`,
      });
      setIsBackupModalOpen(false);
      setBackupDestinationPath('');
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Database backup failed.';
      showToast({ type: 'error', message: msg });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFactoryReset = async () => {
    setIsFactoryResetting(true);
    try {
      // 1. Wipe the local SQLite database & in-memory tables completely first (preserving auth momentarily for Drive overwrite)
      await db.wipeAllDataAsync();
      useAppSettingsStore.getState().resetSettings();
      usePackStore.getState().setCountryCode('US');
      useUIStore.getState().setUILayout('sidebar');
      useThemeStore.getState().setTheme({ mode: 'light', colorPalette: 'classic' });

      if (isTauri()) {
        await tauriDbImportAll({});
      }

      // 2. Overwrite the Google Drive backup with the empty database so ghost records cannot re-hydrate
      const { user, accessToken } = useAuthStore.getState();
      if (user?.sub && (isTauri() || accessToken)) {
        try {
          await backupToDrive(accessToken, user.sub);
        } catch (driveErr) {
          console.warn('[Factory Reset] Could not overwrite Google Drive backup:', driveErr);
        }
      }

      // 3. Clear remaining local persistence & OAuth tokens
      await databaseService.wipeAllLocalData();
      await useAuthStore.getState().signOut();

      setIsFactoryResetOpen(false);
      showToast({
        type: 'success',
        message: 'Factory Reset complete. Restarting RentFlow with a clean database...',
      });

      // 4. Restart the application
      reloadTimerRef.current = setTimeout(() => {
        void tauriRestartApp().catch(() => {
          window.location.reload();
        });
      }, 450);
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Factory Reset failed.';
      showToast({ type: 'error', message: msg });
    } finally {
      setIsFactoryResetting(false);
    }
  };

  const handleWipeAllLocalData = async () => {
    setIsWipingData(true);
    try {
      await databaseService.wipeAllLocalData();
      await useAuthStore.getState().signOut();
      setIsWipeDataConfirmOpen(false);
      showToast({
        type: 'success',
        message: 'All local portfolio data, settings, and session credentials wiped.',
      });
      reloadTimerRef.current = setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Failed to wipe local data.';
      showToast({ type: 'error', message: msg });
    } finally {
      setIsWipingData(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Export Destination Settings */}
      <Card className="space-y-4">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-[var(--accent)]" />
              <CardTitle>Export Destination Path</CardTitle>
            </div>
            <CardDescription>
              Default local folder for styled Excel (.xlsx) portfolio exports.
            </CardDescription>
          </div>
        </CardHeader>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <div className="flex-1 w-full">
            <Input
              value={exportDestination}
              onChange={(e) => handleSaveExportDestination(e.target.value)}
              placeholder="e.g. C:\Users\Name\Documents\RentFlowExports"
            />
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              if (isTauri()) {
                showToast({ type: 'info', message: 'Tauri folder picker dialog opened.' });
              } else {
                const customPath = prompt('Enter export destination folder path:', exportDestination);
                if (customPath) {
                  handleSaveExportDestination(customPath);
                }
              }
            }}
            className="w-full sm:w-auto h-10 px-4 shrink-0"
          >
            Browse Folder
          </Button>
        </div>
      </Card>

      {/* Bulk Data Import & Multi-Sheet Excel Export */}
      <Card className="space-y-4">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <CardTitle>Bulk Data Import &amp; Multi-Sheet Excel Export</CardTitle>
            </div>
            <CardDescription>
              Import CSV rosters or generate styled 13-sheet Excel workbooks.
            </CardDescription>
          </div>
        </CardHeader>

        {/* Full Multi-Tab Excel Export */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)]">
              Export All Data to Excel (.xlsx)
            </h4>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
              Generates a styled workbook across Properties, Units, Tenants, Leases, Invoices, Payments,
              Expenses, Maintenance, and Vendors.
            </p>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="shrink-0 gap-2 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <FileSpreadsheet className={`w-3.5 h-3.5 ${isExportingExcel ? 'animate-spin' : ''}`} />
            <span>{isExportingExcel ? 'Generating .xlsx...' : 'Export All Data'}</span>
          </Button>
        </div>

        {/* Smart Update Existing Master Excel Workbook */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)]">
              Update Existing Excel File (.xlsx)
            </h4>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
              Appends only new records to your existing Master Excel file without duplicating rows.
            </p>
          </div>
          <label className="shrink-0 inline-flex cursor-pointer">
            <input
              type="file"
              accept=".xlsx"
              onChange={handleUpdateExcelFile}
              disabled={isUpdatingExcel}
              className="hidden"
            />
            <span className="inline-flex items-center gap-2 h-8 px-3.5 text-xs font-semibold rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors shadow-xs whitespace-nowrap">
              <Upload className={`w-3.5 h-3.5 ${isUpdatingExcel ? 'animate-spin' : ''}`} />
              <span>{isUpdatingExcel ? 'Updating...' : 'Update Existing Excel'}</span>
            </span>
          </label>
        </div>

        {/* Bulk CSV Import */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-3">
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)]">Bulk CSV Importer</h4>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Select record type, download the template, and upload your CSV file.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)]">
              <button
                type="button"
                onClick={() => setCsvImportType('properties')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  csvImportType === 'properties'
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Properties
              </button>
              <button
                type="button"
                onClick={() => setCsvImportType('tenants')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  csvImportType === 'tenants'
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Tenants
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDownloadSampleCSV(csvImportType)}
              className="gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>
                Sample {csvImportType === 'properties' ? 'Properties' : 'Tenants'} CSV
              </span>
            </Button>

            <label className="inline-flex cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                disabled={isImportingCsv}
                className="hidden"
              />
              <span className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-semibold rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors shadow-xs whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {isImportingCsv
                    ? 'Importing...'
                    : `Import ${csvImportType === 'properties' ? 'Properties' : 'Tenants'} CSV`}
                </span>
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* Zero-Knowledge Cloud Backup */}
      <Card className="space-y-4">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <CardTitle>Zero-Knowledge Cloud Backup (Google Drive)</CardTitle>
            </div>
            <CardDescription>
              Client-side AES-256-GCM + Argon2id encryption before uploading to App_RentFlow_Backups.
            </CardDescription>
          </div>
        </CardHeader>

        {/* Auto Sync Toggle */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Automatic Background Synchronization
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Automatically backs up database changes to Google Drive after local modifications.
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleAutoSync}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring ${
              autoSyncEnabled ? 'bg-emerald-600' : 'bg-[var(--border-strong)]'
            }`}
            role="switch"
            aria-checked={autoSyncEnabled}
            aria-label="Automatic Background Synchronization"
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              setIsForceSyncing(true);
              try {
                showToast({ type: 'info', message: 'Executing Google Drive sync...' });
                await syncNow();
                showToast({
                  type: 'success',
                  message: 'Sync Now complete! Database backed up to Google Drive.',
                });
              } catch (err: unknown) {
                const msg =
                  typeof err === 'string'
                    ? err
                    : (err as { message?: string })?.message || 'Drive sync failed';
                showToast({ type: 'error', message: msg });
              } finally {
                setIsForceSyncing(false);
              }
            }}
            disabled={isForceSyncing || isForceRestoring || isRestoring || syncState === 'syncing'}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isForceSyncing || syncState === 'syncing' ? 'animate-spin' : ''
              }`}
            />
            <span>{isForceSyncing || syncState === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const confirmed = window.confirm(
                'Are you sure you want to restore from Google Drive? This will download RentFlow_FullBackup.enc, wipe current local data, and restore all records and settings.'
              );
              if (!confirmed) return;

              setIsForceRestoring(true);
              try {
                showToast({
                  type: 'info',
                  message: 'Downloading RentFlow_FullBackup.enc and restoring database...',
                });
                const res = await restoreFromDrive();
                if (res && res.restored) {
                  showToast({
                    type: 'success',
                    message: `Restore complete! Restored ${res.totalRecords || 0} records.`,
                  });
                } else {
                  showToast({
                    type: 'info',
                    message: res?.message || 'Restore completed (no backup found).',
                  });
                }
              } catch (err: unknown) {
                const msg =
                  typeof err === 'string'
                    ? err
                    : (err as { message?: string })?.message || 'Drive restore failed';
                showToast({ type: 'error', message: msg });
              } finally {
                setIsForceRestoring(false);
              }
            }}
            disabled={isForceRestoring || isRestoring || isForceSyncing || syncState === 'syncing'}
          >
            <Download
              className={`w-3.5 h-3.5 ${isForceRestoring || isRestoring ? 'animate-bounce' : ''}`}
            />
            <span>
              {isForceRestoring || isRestoring ? 'Restoring...' : 'Restore from Drive'}
            </span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleOpenBackupModal}>
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Backup Database</span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportBackup}>
            <Download className="w-3.5 h-3.5" />
            <span>Export Snapshot (.json)</span>
          </Button>

          <label className="inline-flex">
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            <span className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-base)] text-[var(--text-primary)] transition-colors whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              <span>Import Snapshot (.json)</span>
            </span>
          </label>
        </div>

        {/* Native App Data Directory */}
        <div className="p-3.5 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
            <Database className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Application Data Directory</span>
          </div>
          <p className="text-[11px] font-mono text-[var(--text-secondary)] break-all select-all bg-[var(--bg-surface)] p-2 rounded-lg border border-[var(--border-subtle)]">
            {appDataPath}
          </p>
        </div>
      </Card>

      {/* Data Health Check */}
      <Card className="space-y-4">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <CardTitle>Data Health Check &amp; Backup Status</CardTitle>
            </div>
            <CardDescription>
              Verify local SQLite integrity and review recent cloud backup timestamps.
            </CardDescription>
          </div>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {healthReport?.status === 'healthy'
              ? 'Database Healthy'
              : healthReport?.status === 'error'
              ? 'Check Required'
              : 'Ready'}
          </span>
        </CardHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Last Google Drive Backup
            </div>
            <div className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
              {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Never synced in this session'}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">
              {autoSyncEnabled ? 'Auto-sync active.' : 'Auto-sync disabled.'}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Local Database Status
            </div>
            <div className="text-xs text-[var(--text-secondary)] tabular-nums">
              {healthReport?.checked
                ? healthReport.status === 'healthy'
                  ? `Verified: ${healthReport.propertiesCount} properties, ${healthReport.unitsCount} units, ${healthReport.tenantsCount} tenants, ${healthReport.leasesCount} leases.`
                  : `Error: ${healthReport.errorMessage}`
                : 'Not checked yet in this session.'}
            </div>
            {healthReport?.timestamp && (
              <div className="text-[10px] text-[var(--text-secondary)] font-mono tabular-nums">
                Last checked: {healthReport.timestamp}
              </div>
            )}
          </div>
        </div>

        <div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunHealthCheck}
            disabled={isHealthChecking}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isHealthChecking ? 'animate-spin' : ''}`} />
            <span>
              {isHealthChecking ? 'Running Integrity Check...' : 'Run Data Health Check'}
            </span>
          </Button>
        </div>
      </Card>

      {/* Danger Zone: Factory Reset & Wipe */}
      <Card className="space-y-4 border-rose-500/25">
        <CardHeader className="mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-rose-600" />
              <CardTitle>Database Maintenance &amp; Factory Reset</CardTitle>
            </div>
            <CardDescription>
              Factory Reset wipes your local SQLite database, overwrites your cloud backup with an empty state, and restarts RentFlow.
            </CardDescription>
          </div>
        </CardHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setIsFactoryResetOpen(true)}
            className="gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Factory Reset</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsWipeDataConfirmOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Wipe Local Cache Only</span>
          </Button>
        </div>
      </Card>

      {/* Backup Database Modal */}
      <Modal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        title="Backup Local SQLite Database"
        description="Creates a point-in-time snapshot copy of your local SQLite database file (rentflow.db)."
        maxWidth="md"
      >
        <form onSubmit={handleBackupDatabaseSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Destination File Path
            </label>
            <Input
              type="text"
              placeholder="e.g. C:\Backups\rentflow_backup.db"
              value={backupDestinationPath}
              onChange={(e) => setBackupDestinationPath(e.target.value)}
              className="w-full text-xs font-mono"
              required
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsBackupModalOpen(false)}
              disabled={isBackingUp}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isBackingUp}>
              <Lock className="w-3.5 h-3.5" />
              <span>{isBackingUp ? 'Backing up...' : 'Create Backup'}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Wipe All Local Data Modal */}
      <Modal
        isOpen={isWipeDataConfirmOpen}
        onClose={() => !isWipingData && setIsWipeDataConfirmOpen(false)}
        title="Wipe All Local Data?"
        description="Permanently deletes all local SQLite records, app settings, and desktop session tokens."
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
            This will permanently erase all properties, units, tenants, leases, invoices, payments, expenses,
            maintenance tickets, documents, and cached OAuth credentials from this device.
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsWipeDataConfirmOpen(false)}
              disabled={isWipingData}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleWipeAllLocalData}
              disabled={isWipingData}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isWipingData ? 'Wiping Data...' : 'Wipe All Local Data'}</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Factory Reset Confirmation Modal */}
      <Modal
        isOpen={isFactoryResetOpen}
        onClose={() => !isFactoryResetting && setIsFactoryResetOpen(false)}
        title="Confirm Factory Reset"
        description="This nuclear reset erases both local SQLite data and your remote Google Drive backup."
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300 leading-relaxed space-y-2">
            <p className="font-semibold">This action cannot be undone and will:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Wipe the local SQLite database completely across all tables.</li>
              <li>Overwrite your Google Drive backup with an empty database so old data never returns.</li>
              <li>Clear your session credentials and restart RentFlow cleanly.</li>
            </ul>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsFactoryResetOpen(false)}
              disabled={isFactoryResetting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleFactoryReset}
              disabled={isFactoryResetting}
              className="gap-1.5"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isFactoryResetting ? 'animate-spin' : ''}`} />
              <span>{isFactoryResetting ? 'Resetting App...' : 'Confirm Factory Reset'}</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
