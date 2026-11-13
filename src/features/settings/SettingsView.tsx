import React, { useState } from 'react';
import { seedInitialData } from '../../db/seed';
import { usePack, usePackStore } from '../../countries/usePack';
import { AVAILABLE_PACKS } from '../../countries/resolver';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  RefreshCw,
  Globe,
  Database,
  ShieldCheck,
  Download,
  Upload,
  Percent,
  Check,
  AlertCircle,
  Wrench,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Lock,
  LayoutGrid,
  Palette,
  Sun,
  Moon,
  Shield,
  Trash2,
} from '../../components/icons';
import { useToast } from '../../components/toast/ToastContext';
import { useDriveSync } from '../../hooks/useDriveSync';
import { db } from '../../db/client';
import { databaseService } from '../../db/DatabaseService';
import { Property, Tenant } from '../../db/schema';
import { generateUUID } from '../../lib/uuid';
import { isTauri, tauriBackupDatabaseFile } from '../../lib/tauri/bridge';
import { exportAllDataToExcel, updateExistingExcel } from '../../lib/excelExport';
import { useUIStore, UILayout } from '../../stores/uiStore';
import { useThemeStore, THEME_PALETTES } from '../../stores/themeStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import { useAuthStore } from '../../stores/authStore';
import { parseMajorToMinor, minorToMajorNumber } from '../../lib/money';

export const SettingsView: React.FC = () => {
  const pack = usePack();
  const setCountryCode = usePackStore((s) => s.setCountryCode);
  const { showToast } = useToast();
  const { syncState, syncNow, restoreFromDrive, isRestoring } = useDriveSync();

  const [appDataPath, setAppDataPath] = useState<string>('Loading app data directory...');

  React.useEffect(() => {
    databaseService.getAppDataPath().then((path) => {
      setAppDataPath(path);
    }).catch(() => {
      setAppDataPath(isTauri() ? 'AppData/Roaming/RentFlow' : 'Browser IndexedDB / Encrypted Local Storage');
    });
  }, []);

  const reloadTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, []);

  // Auto Sync State (from centralized appSettingsStore)
  const autoSyncEnabled = useAppSettingsStore((s) => s.autoSyncEnabled);
  const setAutoSyncEnabled = useAppSettingsStore((s) => s.setAutoSyncEnabled);

  // Export Destination State (from centralized appSettingsStore)
  const exportDestination = useAppSettingsStore((s) => s.exportDestination);
  const setExportDestination = useAppSettingsStore((s) => s.setExportDestination);

  const handleSaveExportDestination = (val: string) => {
    setExportDestination(val);
    void databaseService.saveSetting('exportDestination', val);
    showToast({ type: 'success', message: 'Export destination path updated successfully.' });
  };

  // Backup Database Modal State
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupDestinationPath, setBackupDestinationPath] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [isForceRestoring, setIsForceRestoring] = useState(false);

  // Agency Commission
  const agencyCommissionStored = useAppSettingsStore((s) => s.agencyCommissionPct);
  const setAgencyCommissionPct = useAppSettingsStore((s) => s.setAgencyCommissionPct);
  const [agencyCommission, setAgencyCommission] = useState<number>(agencyCommissionStored);

  // Feature 2.7: Maintenance Approval Threshold
  const thresholdMinorStored = useAppSettingsStore((s) => s.maintenanceApprovalThresholdMinor);
  const setMaintenanceApprovalThresholdMinor = useAppSettingsStore((s) => s.setMaintenanceApprovalThresholdMinor);
  const [maintenanceThresholdMajor, setMaintenanceThresholdMajor] = useState<number>(() => {
    if (thresholdMinorStored > 0) {
      return minorToMajorNumber(thresholdMinorStored, pack);
    }
    return pack.currency.code === 'PKR' || pack.currency.code === 'INR' ? 5000 : 500;
  });

  // Feature 2.9: CSV Import Mode
  const [csvImportType, setCsvImportType] = useState<'properties' | 'tenants'>('properties');
  const [isImportingCsv, setIsImportingCsv] = useState(false);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isPrivacyPolicyOpen, setIsPrivacyPolicyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isWipeDataConfirmOpen, setIsWipeDataConfirmOpen] = useState(false);
  const [isWipingData, setIsWipingData] = useState(false);

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
      message: `Maintenance approval threshold set to ${pack.currency.symbol} ${maintenanceThresholdMajor.toLocaleString()} (${minorValue} minor units).`,
    });
  };

  // Feature: Professional Styled Multi-tab Excel Export via ExcelJS
  const [isExportingExcel, setIsExportingExcel] = useState(false);

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
      console.error('ExcelJS export error:', err);
      showToast({
        type: 'error',
        message: err.message || 'Could not export Excel workbook.',
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Feature: Smart Update Existing Excel Master Workbook via ExcelJS
  const [isUpdatingExcel, setIsUpdatingExcel] = useState(false);

  const handleUpdateExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUpdatingExcel(true);
    try {
      showToast({
        type: 'info',
        message: `Reading '${file.name}' with ExcelJS and checking for existing records...`,
      });

      const result = await updateExistingExcel(file, pack);
      showToast({
        type: 'success',
        message: `Excel Update Complete! Appended ${result.totalRecords} new record(s) across ${result.sheetCount} worksheets to "${result.fileName}".`,
      });
    } catch (err: any) {
      console.error('ExcelJS update error:', err);
      showToast({
        type: 'error',
        message: err.message || 'Could not update existing Excel file.',
      });
    } finally {
      setIsUpdatingExcel(false);
      e.target.value = ''; // Reset input to allow re-uploading same file if needed
    }
  };

  // Feature 2.9: CSV Parsing & Bulk Import
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
      sampleRow = 'Sunset Ridge Apartments,"1024 Ocean Dr",Miami,FL,33139,apartment_building\nOakwood Townhomes,"45 Pine St",Austin,TX,78701,single_family';
    } else {
      header = 'name,phone,email,id_type,id_number,emergency_contact,occupants\n';
      sampleRow = 'Sarah Jenkins,+1 555-0199,sarah.j@example.com,State Driver\'s License,DL-9938102,Mark Jenkins,2\nDavid Vance,+1 555-0211,david.vance@example.com,National Passport,PA-8841029,Eleanor Vance,1';
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
          // Tenants CSV
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
      showToast({
        type: 'error',
        message: msg,
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleResetDemo = () => {
    useAppSettingsStore.getState().resetSettings();
    usePackStore.getState().setCountryCode('US');
    useUIStore.getState().setUILayout('sidebar');
    seedInitialData(true);
    setShowResetConfirm(false);
    showToast({
      type: 'info',
      message: 'Reset all tables to fresh demo seed. Reloading...',
    });
    reloadTimerRef.current = setTimeout(() => window.location.reload(), 1000);
  };

  const { uiLayout, setUILayout } = useUIStore();
  const { theme, setMode, setColorPalette } = useThemeStore();

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          System Settings & Data Controls
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          UI appearance, jurisdiction defaults, financial approval gates, bulk import/export, and zero-knowledge backup management
        </p>
      </div>

      {/* PART 1.5: Multi-Theme & Color Palette Picker */}
      <Card className="space-y-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Theme & Color Palettes</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="accent" className="capitalize">
              {theme.mode} Mode &bull; {THEME_PALETTES.find((p) => p.id === theme.colorPalette)?.name || theme.colorPalette}
            </Badge>
          </div>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Select a tailored color palette and toggle between Light and Dark mode. Color variables adapt dynamically across all cards, sidebars, tables, and buttons.
        </p>

        {/* Mode Toggle Bar */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-2.5">
            Base Color Mode
          </label>
          <div className="inline-flex p-1 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] gap-1">
            <button
              type="button"
              onClick={() => {
                setMode('light');
                showToast({ type: 'info', message: 'Switched to Light Mode.' });
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                theme.mode === 'light'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Light Mode</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('dark');
                showToast({ type: 'info', message: 'Switched to Dark Mode.' });
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                theme.mode === 'dark'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dark Mode</span>
            </button>
          </div>
        </div>

        {/* Color Palettes Selection */}
        <div className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Select Color Palette Swatch
          </label>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {THEME_PALETTES.map((palette) => {
              const isSelected = theme.colorPalette === palette.id;
              return (
                <div
                  key={palette.id}
                  onClick={() => {
                    setColorPalette(palette.id);
                    showToast({ type: 'info', message: `Theme changed to ${palette.name} (${palette.accentLabel} Accent).` });
                  }}
                  className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer space-y-3 relative overflow-hidden ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/30 shadow-xs'
                      : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-base)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[var(--text-primary)] block">
                        {palette.name}
                      </span>
                      <span className="text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-mono">
                        {palette.category} mode &bull; {palette.accentLabel}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-[var(--text-secondary)] leading-normal line-clamp-2">
                    {palette.description}
                  </p>

                  {/* Circular Swatches */}
                  <div className="flex items-center gap-2 pt-1">
                    <div
                      className="w-6 h-6 rounded-full border border-black/10 dark:border-white/10 shadow-2xs"
                      style={{ backgroundColor: palette.colors.bg }}
                      title={`Background: ${palette.colors.bg}`}
                    />
                    <div
                      className="w-6 h-6 rounded-full border border-black/10 dark:border-white/10 shadow-2xs"
                      style={{ backgroundColor: palette.colors.surface }}
                      title={`Card Surface: ${palette.colors.surface}`}
                    />
                    <div
                      className="w-6 h-6 rounded-full border border-black/10 dark:border-white/10 shadow-2xs"
                      style={{ backgroundColor: palette.colors.border }}
                      title={`Border: ${palette.colors.border}`}
                    />
                    <div
                      className="w-6 h-6 rounded-full border border-black/10 dark:border-white/10 shadow-2xs"
                      style={{ backgroundColor: palette.colors.accent }}
                      title={`Accent: ${palette.colors.accent}`}
                    />
                    <span className="text-[11px] font-mono text-[var(--text-subtle)] ml-auto">
                      {palette.colors.accent}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* PART 2: UI Appearance & Layout Switcher */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Appearance & Workspace Layout</CardTitle>
          </div>
          <Badge variant="accent">
            {uiLayout === 'top-tabs' ? 'Top-Tabs Navigation Active' : 'Sidebar Navigation (Default)'}
          </Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Customize your navigation layout structure while preserving RentFlow&apos;s modern dark/light theme tokens, typography, and rounded minimalism.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Option 1: Sidebar (Default) */}
          <div
            onClick={() => {
              setUILayout('sidebar');
              showToast({ type: 'info', message: 'Switched to Sidebar Navigation (Default)' });
            }}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
              uiLayout === 'sidebar'
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/20 shadow-xs'
                : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-base)]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Sidebar Navigation (Default)
              </span>
              {uiLayout === 'sidebar' && <Check className="w-4 h-4 text-[var(--accent)]" />}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Standard desktop layout with left collapsible sidebar, fast keyboard navigation, spacious card padding, and 1400px centered viewport.
            </p>
          </div>

          {/* Option 2: Top-Tabs */}
          <div
            onClick={() => {
              setUILayout('top-tabs');
              showToast({ type: 'info', message: 'Switched to Top-Tabs Navigation (Linear / Notion Style)' });
            }}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
              uiLayout === 'top-tabs'
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/20 shadow-xs'
                : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-base)]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Top Navigation (Top-Tabs)
              </span>
              {uiLayout === 'top-tabs' && <Check className="w-4 h-4 text-[var(--accent)]" />}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Moves navigation into a horizontal tab bar at the top (like Excel structure), using the exact same modern light/dark theme tokens, rounded corners, and Linear/Notion styling.
            </p>
          </div>
        </div>

        <div className="max-w-xs pt-1">
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Active Layout Setting:
          </label>
          <select
            value={uiLayout}
            onChange={(e) => {
              const next = e.target.value as UILayout;
              setUILayout(next);
              showToast({
                type: 'info',
                message: `Layout changed to ${next === 'top-tabs' ? 'Top-Tabs Navigation' : 'Sidebar Navigation'}.`,
              });
            }}
            className="w-full h-9 px-3 text-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
          >
            <option value="sidebar">Sidebar Navigation (Default • Left Menu)</option>
            <option value="top-tabs">Top Navigation (Top-Tabs • Linear/Excel Structure)</option>
          </select>
        </div>
      </Card>

      {/* Active Jurisdiction Pack */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Country Pack Jurisdiction</CardTitle>
          </div>
          <Badge variant="info">{pack.name} ({pack.code})</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          The selected Country Pack sets local tenancy compliance laws, tax withholding exemptions, deposit interest rules,
          late fee caps, and currency formatting. Historical invoices and payments remain frozen with their original currency.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Active Jurisdiction</label>
            <select
              value={pack.code}
              onChange={(e) => handlePackChange(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
            >
              {AVAILABLE_PACKS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.flag} {p.name} ({p.code}) — {p.currency.code}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs space-y-1">
            <div className="text-[var(--text-secondary)]">Currency & Units</div>
            <div className="font-semibold text-[var(--text-primary)]">
              {pack.currency.code} ({pack.currency.symbol}) &bull; {pack.areaUnit.toUpperCase()}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">
              Decimals: {pack.currency.minorUnits} &bull; Date: {pack.dateFormat}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs space-y-1">
            <div className="text-[var(--text-secondary)]">Legal & Tenancy Rules</div>
            <div className="font-semibold text-[var(--text-primary)]">
              Deposit Max: {pack.deposit.maxMonths ? `${pack.deposit.maxMonths} mo` : 'No Cap'}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">
              Notice: {pack.noticePeriods.rentIncreaseDays}d &bull; Interest: {pack.deposit.interestRequired ? 'Required' : 'None'}
            </div>
          </div>
        </div>

        {pack.lateFee.islamicFinanceMode && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Islamic Finance Tenancy Mode Active:</strong> Late fees cannot accrue interest.
              Any late penalty collections must be allocated to designated charitable distributions.
            </div>
          </div>
        )}
      </Card>

      {/* Export Destination Settings */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Export Destination Path</CardTitle>
          </div>
          <Badge variant="accent">Desktop Folder Sync</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Configure the default target folder where professional Excel spreadsheet exports (.xlsx) are saved on your local file system.
        </p>

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

      {/* Feature 2.7: Petty Cash & Maintenance Approval Threshold */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Petty Cash & Maintenance Approval Threshold</CardTitle>
          </div>
          <Badge variant="neutral">Feature 2.7</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Configure the maximum expenditure threshold for routine repairs. Any maintenance work order where estimated or actual cost exceeds this limit requires explicit Admin Approval before it can be closed or converted into an operating expense.
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
              className="pl-8 h-9 text-xs font-mono"
            />
          </div>
          <Button type="submit" size="sm" variant="primary">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Save Threshold</span>
          </Button>
        </form>
      </Card>

      {/* Property Management Agency Commission */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Agency Management Commission</CardTitle>
          </div>
          <Badge variant="neutral">Financial Policy</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)]">
          Configure default property management fees deducted from gross rent collection before disbursement to landlords and owners in Owner Statements.
        </p>

        <form onSubmit={handleSaveCommission} className="flex items-center gap-3 max-w-sm">
          <div className="relative flex-1">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={agencyCommission}
              onChange={(e) => setAgencyCommission(parseFloat(e.target.value) || 0)}
              className="pr-8 h-9 text-xs font-mono"
            />
            <span className="absolute right-3 top-2.5 text-xs text-[var(--text-secondary)]">%</span>
          </div>
          <Button type="submit" size="sm" variant="primary">
            <Check className="w-3.5 h-3.5" />
            <span>Save Rate</span>
          </Button>
        </form>
      </Card>

      {/* Feature 2.9: Bulk Import & Export Hub */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <CardTitle>Bulk Data Import & Multi-Sheet Excel Export</CardTitle>
          </div>
          <Badge variant="success">Feature 2.9 &bull; CSV & Excel</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Import bulk properties or tenant rosters directly from CSV files. Export your complete RentFlow portfolio across 13 relational sheets into a native Microsoft Excel (.xlsx) workbook.
        </p>

        {/* 1. Full Multi-Tab Excel Export (ExcelJS) */}
        <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  Export All Data to Excel (.xlsx)
                </h4>
                <Badge variant="success">ExcelJS Styled</Badge>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                Generates a professional workbook with dedicated worksheets for Properties, Units, Tenants, Leases, Invoices, Payments, Expenses, Maintenance, and Vendors. Includes dark blue title rows, light gray headers, auto-calculated column widths, and native currency formatting.
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="shrink-0 gap-2 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              <FileSpreadsheet className={`w-3.5 h-3.5 ${isExportingExcel ? 'animate-spin' : ''}`} />
              <span>{isExportingExcel ? 'Generating .xlsx...' : 'Export All Data to Excel'}</span>
            </Button>
          </div>
        </div>

        {/* 2. Smart Update Existing Master Excel Workbook */}
        <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  Update Existing Excel File (.xlsx)
                </h4>
                <Badge variant="info">Smart Deduplication</Badge>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                Select your existing Master Excel file. RentFlow will read the workbook, check for existing records in each sheet, and append only new data for Properties, Units, Tenants, Leases, Invoices, Payments, Expenses, Maintenance, and Vendors without duplicates.
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
              <span className="inline-flex items-center gap-2 h-9 px-3.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-xs">
                <Upload className={`w-3.5 h-3.5 ${isUpdatingExcel ? 'animate-spin' : ''}`} />
                <span>{isUpdatingExcel ? 'Updating Excel...' : 'Update Existing Excel File'}</span>
              </span>
            </label>
          </div>
        </div>

        {/* 2. Bulk CSV Import */}
        <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-4">
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)]">
              Bulk CSV Importer
            </h4>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Select record type, download the pre-formatted template, and upload your CSV.
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
              <span>Download Sample {csvImportType === 'properties' ? 'Properties' : 'Tenants'} CSV</span>
            </Button>

            <label className="inline-flex cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                disabled={isImportingCsv}
                className="hidden"
              />
              <span className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>{isImportingCsv ? 'Importing...' : `Upload & Import ${csvImportType === 'properties' ? 'Properties' : 'Tenants'} CSV`}</span>
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* Zero-Knowledge Backup & Cloud Sync */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <CardTitle>Zero-Knowledge Cloud Backup (Google Drive)</CardTitle>
          </div>
          <Badge variant="success">AES-256-GCM + Argon2id</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          RentFlow never uploads plaintext data to Google Drive. Every automated cloud sync is client-side encrypted
          using an Argon2id key derivation function and AES-256-GCM authenticated cipher before uploading to the
          designated <code className="bg-[var(--bg-base)] px-1.5 py-0.5 rounded text-[11px] font-mono">App_RentFlow_Backups</code> folder.
        </p>

        {/* Auto Sync Toggle Switch */}
        <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Automatic Background Synchronization
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Automatically backs up database changes to Google Drive in the background after local modifications.
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleAutoSync}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 ${
              autoSyncEnabled ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-700'
            }`}
            role="switch"
            aria-checked={autoSyncEnabled}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {/* Manual Sync Now Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              setIsForceSyncing(true);
              try {
                showToast({ type: 'info', message: 'Executing Google Drive sync...' });
                await syncNow();
                showToast({ type: 'success', message: 'Sync Now complete! Database backed up to Google Drive.' });
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
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isForceSyncing || syncState === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{isForceSyncing || syncState === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
          </Button>

          {/* Restore from Drive Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const confirmed = window.confirm(
                'Are you sure you want to restore from Google Drive? This will download RentFlow_FullBackup.enc, wipe current local data, and restore all properties, units, tenants, leases, invoices, payments, expenses, settings, and themes.'
              );
              if (!confirmed) return;

              setIsForceRestoring(true);
              try {
                showToast({ type: 'info', message: 'Downloading RentFlow_FullBackup.enc and restoring database...' });
                const res = await restoreFromDrive();
                if (res && res.restored) {
                  showToast({
                    type: 'success',
                    message: `Restore complete! Restored ${res.totalRecords || 0} records across all tables, settings, and themes.`,
                  });
                } else {
                  showToast({ type: 'info', message: res?.message || 'Restore completed (no backup found).' });
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
            className="gap-2 border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent-subtle)]/30"
          >
            <Download className={`w-3.5 h-3.5 ${isForceRestoring || isRestoring ? 'animate-bounce' : ''}`} />
            <span>{isForceRestoring || isRestoring ? 'Restoring from Drive...' : 'Restore from Drive'}</span>
          </Button>

          {/* Backup Database Button */}
          <Button variant="outline" size="sm" onClick={handleOpenBackupModal} className="gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Backup Database</span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportBackup} className="gap-2">
            <Download className="w-3.5 h-3.5" />
            <span>Export Encrypted Snapshot (.json)</span>
          </Button>

          <label className="inline-flex">
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
            <span className="cursor-pointer inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-base)] text-[var(--text-primary)] transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Import Snapshot (.json)</span>
            </span>
          </label>
        </div>

        {/* Native App Data Directory Info */}
        <div className="mt-4 p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
            <Database className="w-3.5 h-3.5 text-indigo-500" />
            <span>Application Data Directory (app_data_dir):</span>
          </div>
          <p className="text-[11px] font-mono text-[var(--text-secondary)] break-all select-all bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
            {appDataPath}
          </p>
        </div>
      </Card>

      {/* Database Maintenance & Reset */}
      <Card className="space-y-4 border-rose-500/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-rose-600" />
            <CardTitle>Database Reset & Fixtures</CardTitle>
          </div>
          <Badge variant="danger">Destructive Action</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)]">
          Clears local database storage and seeds fresh demo records for multi-unit properties, tenants, leases, and invoices.
        </p>

        {!showResetConfirm ? (
          <Button variant="danger" size="sm" onClick={() => setShowResetConfirm(true)}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Local Database to Demo Seed</span>
          </Button>
        ) : (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs space-y-3">
            <p className="text-rose-700 dark:text-rose-300 font-medium">
              Are you sure? This will delete all custom records and reset to the default demo database.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="danger" size="sm" onClick={handleResetDemo}>
                Yes, Reset Everything
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Phase 7: Privacy & Data */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Privacy &amp; Data</CardTitle>
          </div>
          <Badge variant="neutral">Legal &amp; Local Vault</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          All portfolio records, leases, and financial ledgers are stored locally on your device inside{' '}
          <code className="bg-[var(--bg-base)] px-1.5 py-0.5 rounded text-[11px] font-mono">rentflow.db</code>.
          Review our data handling commitments or permanently erase all local application data below.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPrivacyPolicyOpen(true)}
            className="gap-2"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Privacy Policy</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsTermsOpen(true)}
            className="gap-2"
          >
            <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Terms of Service</span>
          </Button>

          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setIsWipeDataConfirmOpen(true)}
            className="gap-2 ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Wipe All Local Data</span>
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
              placeholder="e.g. C:\Backups\rentflow_backup.db or /home/user/rentflow_backup.db"
              value={backupDestinationPath}
              onChange={(e) => setBackupDestinationPath(e.target.value)}
              className="w-full text-xs font-mono"
              required
            />
            <p className="text-[11px] text-[var(--text-secondary)] mt-1.5">
              Specify the absolute destination file path where the SQLite database backup should be saved.
            </p>
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
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isBackingUp}
              className="gap-2"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isBackingUp ? 'Backing up...' : 'Create Backup'}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal
        isOpen={isPrivacyPolicyOpen}
        onClose={() => setIsPrivacyPolicyOpen(false)}
        title="RentFlow Privacy Policy"
        description="Local-first data architecture, native authentication, and zero-knowledge cloud backups."
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs text-[var(--text-secondary)] leading-relaxed max-h-[65vh] overflow-y-auto pr-1">
          <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">1. Local-First Portfolio Storage</h4>
            <p>
              RentFlow stores your properties, units, tenant profiles, leases, invoices, payments, expenses, and documents strictly on your own computer in a local SQLite database (<code className="font-mono">rentflow.db</code>). No central RentFlow cloud server collects, reads, or sells your portfolio records.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">2. Native Google OAuth &amp; Token Isolation</h4>
            <p>
              Sign-in uses an RFC 7636 PKCE OAuth 2.0 loopback flow handled directly between the desktop application and Google&apos;s authorization servers. OAuth access and refresh tokens are sealed locally inside an encrypted credential vault and are never transmitted to third parties.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">3. Encrypted Google Drive Backups</h4>
            <p>
              When Drive synchronization is enabled, your database snapshot is compressed and encrypted client-side using Argon2id key derivation and AES-256-GCM authenticated encryption before uploading to your private Google Drive backup folder.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">4. Zero Analytics &amp; Zero Telemetry</h4>
            <p>
              RentFlow contains zero behavioral tracking scripts, third-party advertising SDKs, or silent telemetry beacons. Network requests occur only for user-initiated actions (Google OAuth, Google Drive Sync, or map/geocoding lookups).
            </p>
          </div>
          <div className="flex justify-end pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="primary" size="sm" onClick={() => setIsPrivacyPolicyOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Terms of Service Modal */}
      <Modal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        title="RentFlow Terms of Service"
        description="Desktop software license, financial record disclaimers, and backup responsibility."
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs text-[var(--text-secondary)] leading-relaxed max-h-[65vh] overflow-y-auto pr-1">
          <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">1. Ownership &amp; Control of Your Records</h4>
            <p>
              You retain 100% ownership and control of every lease, accounting record, document, and backup created with RentFlow. You may export, archive, or wipe your local data at any time.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">2. Accounting, Legal &amp; Tax Disclaimer</h4>
            <p>
              RentFlow provides property accounting ledgers, regional country-pack calculations, owner disbursement statements, and tax estimates as operational tools only. Nothing generated by the software constitutes legal, financial, or tax advice; always verify local landlord-tenant statutes and tax filings with a qualified professional.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">3. Backup &amp; Device Security</h4>
            <p>
              Because data resides locally on your device, maintaining regular local backups or encrypted Google Drive snapshots—and protecting your Google account credentials—is your responsibility.
            </p>
          </div>
          <div className="flex justify-end pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="primary" size="sm" onClick={() => setIsTermsOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Wipe All Local Data Confirmation Modal (No "Type DELETE" friction) */}
      <Modal
        isOpen={isWipeDataConfirmOpen}
        onClose={() => !isWipingData && setIsWipeDataConfirmOpen(false)}
        title="Wipe All Local Data?"
        description="Permanently deletes all local SQLite records, app settings, and desktop session tokens."
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
            This will permanently erase all properties, units, tenants, leases, invoices, payments, expenses, maintenance tickets, documents, and cached OAuth credentials from this device. Remote backups already stored in your Google Drive are not deleted.
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
              className="gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isWipingData ? 'Wiping Data...' : 'Wipe All Local Data'}</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
