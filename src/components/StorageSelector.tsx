import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { motion } from 'motion/react';
import { Logo } from './Logo';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import {
  Folder,
  Database,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ChevronLeft,
} from './icons';
import { useAppSettingsStore } from '../stores/appSettingsStore';
import { AppMode, useAuthStore } from '../stores/authStore';
import { useToast } from './toast/ToastContext';

export const DATA_PATH_STORAGE_KEY = 'rentflow_data_path';

export interface StorageSelectorProps {
  mode: AppMode;
  userEmail?: string;
  onBack?: () => void;
  onComplete: (chosenPath: string) => void;
}

export const StorageSelector: React.FC<StorageSelectorProps> = ({
  mode,
  userEmail,
  onBack,
  onComplete,
}) => {
  const { showToast } = useToast();
  const setAppMode = useAuthStore((s) => s.setAppMode);

  const [selectedPath, setSelectedPath] = useState<string>('');
  const [defaultPath, setDefaultPath] = useState<string>('');
  const [isLoadingDefault, setIsLoadingDefault] = useState<boolean>(true);
  const [isBrowsing, setIsBrowsing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadDefaultDataDir = async () => {
      try {
        let resolved = '';
        try {
          resolved = await invoke<string>('get_data_path');
        } catch {
          resolved = await appDataDir();
        }
        if (active && resolved) {
          setDefaultPath(resolved);
          setSelectedPath(resolved);
        }
      } catch (err) {
        console.warn('[StorageSelector] Could not resolve default app data directory:', err);
      } finally {
        if (active) {
          setIsLoadingDefault(false);
        }
      }
    };

    void loadDefaultDataDir();
    return () => {
      active = false;
    };
  }, []);

  const handleBrowseFolder = async () => {
    setErrorMessage(null);
    setIsBrowsing(true);
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        defaultPath: selectedPath.trim() || defaultPath || undefined,
        title: 'Select Local Storage Location',
      });

      if (typeof picked === 'string' && picked.trim()) {
        setSelectedPath(picked.trim());
      }
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Could not open folder picker.';
      setErrorMessage(msg);
      showToast({ type: 'error', message: msg });
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = selectedPath.trim();
    if (!trimmed) {
      setErrorMessage('Please select a valid folder for your local database and exports.');
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);

    try {
      const savedPath = await invoke<string>('set_data_path', { path: trimmed });
      const finalPath = savedPath || trimmed;

      try {
        await invoke<string>('db_init');
      } catch (initErr) {
        console.warn('[StorageSelector] db_init notice:', initErr);
      }

      localStorage.setItem(DATA_PATH_STORAGE_KEY, finalPath);
      useAppSettingsStore.getState().setExportDestination(finalPath);
      setAppMode(mode);

      onComplete(finalPath);
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Failed to configure local storage directory.';
      setErrorMessage(msg);
      showToast({ type: 'error', message: msg });
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg-base)] p-6 sm:p-10 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl space-y-6 my-auto"
      >
        <div className="flex flex-col items-center text-center space-y-3">
          <Logo size={56} className="shadow-md" />
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[var(--accent)] tracking-wide">
              Step 2 of 2 · {mode === 'cloud' ? 'Cloud Backup' : 'Offline & Private'}
              {mode === 'cloud' && userEmail ? ` (${userEmail})` : ''}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Select Local Storage Location
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
              Choose the folder on your computer where RentFlow stores your portfolio database and exported reports.
            </p>
          </div>
        </div>

        <Card className="p-6 sm:p-8 space-y-6 border border-[var(--border-strong)] rounded-2xl modal-shadow bg-[var(--bg-surface)]">
          <form onSubmit={handleConfirm} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="storage-selector-path-input"
                className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]"
              >
                <Database className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Database &amp; Exports Folder</span>
              </label>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="flex-1 min-w-0">
                  <Input
                    id="storage-selector-path-input"
                    type="text"
                    value={selectedPath}
                    onChange={(e) => {
                      setSelectedPath(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder={
                      isLoadingDefault ? 'Finding default folder...' : 'Select a folder path...'
                    }
                    className="font-mono text-xs h-10"
                    disabled={isLoadingDefault || isSaving}
                    required
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleBrowseFolder()}
                  disabled={isLoadingDefault || isBrowsing || isSaving}
                  className="h-10 px-4 gap-2 shrink-0 cursor-pointer whitespace-nowrap"
                >
                  <Folder className="w-4 h-4 text-[var(--accent)]" />
                  <span>{isBrowsing ? 'Opening...' : 'Browse'}</span>
                </Button>
              </div>

              {defaultPath && (
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  Default folder:{' '}
                  <button
                    type="button"
                    onClick={() => setSelectedPath(defaultPath)}
                    className="font-mono text-[var(--accent)] hover:underline break-all text-left cursor-pointer"
                  >
                    {defaultPath}
                  </button>
                </p>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-1.5 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {mode === 'cloud'
                    ? 'Local Database + Encrypted Google Drive Sync'
                    : 'Private Offline Local Storage'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {mode === 'cloud'
                  ? 'Data is saved locally first for instant speed and automatically encrypted before syncing to your RentFlow Grouped Backups folder.'
                  : 'All records stay exclusively on your computer. You can link Google Drive later from Settings > General.'}
              </p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300"
              >
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              {onBack ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onBack}
                  disabled={isSaving}
                  className="h-11 px-4 gap-1.5 text-xs font-medium cursor-pointer whitespace-nowrap"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back</span>
                </Button>
              ) : (
                <span />
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={isLoadingDefault || isSaving || !selectedPath.trim()}
                className="h-11 px-6 gap-2 font-semibold text-sm rounded-xl cursor-pointer whitespace-nowrap"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Initializing Database...</span>
                  </>
                ) : (
                  <>
                    <span>Finish &amp; Open Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  );
};

export default StorageSelector;
