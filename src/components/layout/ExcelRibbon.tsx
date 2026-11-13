import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePack } from '../../countries/usePack';
import { useTheme } from '../theme/ThemeProvider';
import { useUIStore } from '../../stores/uiStore';
import { exportAllDataToExcel, updateExistingExcel } from '../../lib/excelExport';
import { useToast } from '../toast/ToastContext';
import {
  FileSpreadsheet,
  Download,
  Upload,
  RefreshCw,
  Sun,
  Moon,
  Plus,
  Building2,
  Users,
  Receipt,
  Wrench,
  Calendar,
  FileText,
  DollarSign,
  Settings,
  HardHat,
  Folder,
  BarChart3,
  Globe,
  LayoutGrid,
} from '../icons';

export const ExcelRibbon: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pack = usePack();
  const { isDarkMode, toggleTheme } = useTheme();
  const { setUILayout } = useUIStore();
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const tabs = [
    { label: 'Dashboard', path: '/' },
    { label: 'Calendar & Tasks', path: '/calendar' },
    { label: 'Properties', path: '/properties' },
    { label: 'Tenants', path: '/tenants' },
    { label: 'Leases', path: '/leases' },
    { label: 'Invoices & Rent', path: '/invoices' },
    { label: 'Maintenance', path: '/maintenance' },
    { label: 'Expenses', path: '/expenses' },
    { label: 'Vendors', path: '/vendors' },
    { label: 'Owner Statements', path: '/owners' },
    { label: 'Documents', path: '/documents' },
    { label: 'Reports', path: '/reports' },
    { label: 'Settings', path: '/settings' },
  ];

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      showToast({ type: 'info', message: 'Generating ExcelJS formatted workbook...' });
      const result = await exportAllDataToExcel(pack);
      showToast({
        type: 'success',
        message: `Exported ${result.totalRecords} records to ${result.fileName}!`,
      });
    } catch (err: any) {
      showToast({ type: 'error', message: err.message || 'Export failed' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleUpdateExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExporting(true);
    try {
      showToast({ type: 'info', message: `Reading '${file.name}' with ExcelJS...` });
      const result = await updateExistingExcel(file, pack);
      showToast({
        type: 'success',
        message: `Updated Excel! Appended ${result.totalRecords} new record(s) across ${result.sheetCount} sheet(s).`,
      });
    } catch (err: any) {
      showToast({ type: 'error', message: err.message || 'Excel update failed' });
    } finally {
      setIsExporting(false);
      e.target.value = '';
    }
  };

  return (
    <header className="no-print bg-[var(--bg-surface)] border-b border-[var(--border-strong)] shrink-0 select-none shadow-xs">
      {/* Top Application Bar with Excel Branding & Tabs */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-raised)]">
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-none">
          {/* Green Excel App Icon & Title */}
          <div className="flex items-center gap-2 pr-3 border-r border-[var(--border-strong)] shrink-0">
            <div className="w-6 h-6 rounded bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              X
            </div>
            <span className="text-xs font-bold tracking-tight text-[var(--text-primary)]">
              RentFlow <span className="font-normal text-[var(--text-secondary)]">Excel Mode</span>
            </span>
          </div>

          {/* Excel Sheet Navigation Tabs */}
          <nav className="flex items-center gap-0.5" role="tablist">
            {tabs.map((tab) => {
              const isActive =
                tab.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(tab.path);

              return (
                <button
                  key={tab.path}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => navigate(tab.path)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-t transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-[var(--bg-surface)] text-emerald-600 dark:text-emerald-400 font-bold border-b-2 border-emerald-600 shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Tools: Switch Layout, Theme & Status */}
        <div className="flex items-center gap-2 shrink-0 pl-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
            <span>{pack.flag}</span>
            <span className="font-semibold">{pack.code}</span>
            <span className="text-emerald-600/70 font-mono">({pack.currency.code})</span>
          </div>

          <button
            onClick={() => setUILayout('sidebar')}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-sunken)] border border-[var(--border-strong)] text-[var(--text-primary)] font-medium cursor-pointer transition-colors"
            title="Switch back to Sidebar Navigation layout"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden md:inline">Sidebar View</span>
          </button>

          <button
            onClick={toggleTheme}
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)] transition-colors cursor-pointer"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Ribbon Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-1.5 bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] overflow-x-auto">
        <div className="flex items-center gap-4 divide-x divide-[var(--border-strong)]">
          {/* Group 1: Data & Export */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-subtle)] mr-1">
              File:
            </span>
            <button
              onClick={handleExportData}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
              title="Download Data: Professional ExcelJS multi-sheet workbook"
            >
              <FileSpreadsheet className={`w-3.5 h-3.5 ${isExporting ? 'animate-spin' : ''}`} />
              <span>{isExporting ? 'Exporting...' : 'Download Data (.xlsx)'}</span>
            </button>
            <label className="inline-flex cursor-pointer">
              <input
                type="file"
                accept=".xlsx"
                onChange={handleUpdateExcelFile}
                disabled={isExporting}
                className="hidden"
              />
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs">
                <Upload className={`w-3.5 h-3.5 ${isExporting ? 'animate-spin' : ''}`} />
                <span>Update Master Excel</span>
              </span>
            </label>
          </div>

          {/* Group 2: Quick Records Insert */}
          <div className="flex items-center gap-1.5 pl-4">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-subtle)] mr-1">
              Quick Insert:
            </span>
            <button
              onClick={() => navigate('/properties')}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--bg-surface-sunken)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3 text-emerald-600" />
              <span>Property</span>
            </button>
            <button
              onClick={() => navigate('/leases')}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--bg-surface-sunken)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3 text-emerald-600" />
              <span>Lease</span>
            </button>
            <button
              onClick={() => navigate('/invoices')}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--bg-surface-sunken)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3 text-emerald-600" />
              <span>Payment</span>
            </button>
            <button
              onClick={() => navigate('/maintenance')}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--bg-surface-sunken)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3 text-emerald-600" />
              <span>Work Order</span>
            </button>
          </div>

          {/* Group 3: Features */}
          <div className="flex items-center gap-1.5 pl-4">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-subtle)] mr-1">
              Tools:
            </span>
            <button
              onClick={() => navigate('/calendar')}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--bg-surface-sunken)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              <Calendar className="w-3 h-3 text-indigo-500" />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => navigate('/expenses')}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--bg-surface-sunken)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              <Receipt className="w-3 h-3 text-amber-500" />
              <span>Reconcile</span>
            </button>
          </div>
        </div>

        {/* View dense mode status pill */}
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-[var(--text-subtle)]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          <span>Dense Spreadsheet Grid Active (13px &bull; Alternating Rows)</span>
        </div>
      </div>
    </header>
  );
};
