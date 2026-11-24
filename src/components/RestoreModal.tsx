import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  RefreshCw,
  ShieldCheck,
} from './icons';
import { useDriveSync } from '../hooks/useDriveSync';
import { BackupManifestEntry } from '../lib/tauri/bridge';
import { useToast } from './toast/ToastContext';

export interface RestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored?: (result: {
    restored: boolean;
    filename?: string;
    message: string;
    totalRecords: number;
  }) => void;
}

export function formatSnapshotSummary(entry: BackupManifestEntry): string {
  if (!entry.date) {
    return `Snapshot (${entry.size})`;
  }

  const parsed = new Date(entry.date);
  if (Number.isNaN(parsed.getTime())) {
    return `Snapshot from ${entry.date} - ${entry.size}`;
  }

  const dateLabel = parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeLabel = parsed.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `Snapshot from ${dateLabel} at ${timeLabel} - ${entry.size}`;
}

export const RestoreModal: React.FC<RestoreModalProps> = ({
  isOpen,
  onClose,
  onRestored,
}) => {
  const { getBackupList, restoreFromSnapshot } = useDriveSync();
  const { showToast } = useToast();

  const [snapshots, setSnapshots] = useState<BackupManifestEntry[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<BackupManifestEntry | null>(null);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);

  const loadSnapshots = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    setSelectedSnapshot(null);
    try {
      const list = await getBackupList();
      setSnapshots(Array.isArray(list) ? list : []);
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message ||
            'Could not read manifest.json from your RentFlow Backups folder.';
      setListError(msg);
    } finally {
      setIsLoadingList(false);
    }
  }, [getBackupList]);

  useEffect(() => {
    if (isOpen) {
      void loadSnapshots();
    } else {
      setSelectedSnapshot(null);
      setRestoringFilename(null);
      setListError(null);
    }
  }, [isOpen, loadSnapshots]);

  const handleConfirmRestore = async (entry: BackupManifestEntry) => {
    setRestoringFilename(entry.filename);
    setListError(null);

    try {
      const res = await restoreFromSnapshot(entry.filename);
      if (res.restored) {
        showToast({
          type: 'success',
          message: `Restored ${res.totalRecords} records from ${entry.filename}. Reloading RentFlow...`,
        });
        onRestored?.(res);
        onClose();
        window.location.reload();
      } else {
        setListError(res.message || 'Selected snapshot did not contain restorable records.');
      }
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Failed to restore from selected snapshot.';
      setListError(msg);
      showToast({ type: 'error', message: msg });
    } finally {
      setRestoringFilename(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!restoringFilename) onClose();
      }}
      title="Restore Data"
      description="Choose a snapshot from your 'RentFlow Backups' Google Drive folder to restore your local SQLite database."
      maxWidth="lg"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] text-xs">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>AES-256-GCM Encrypted &bull; Up to 15 snapshots in RentFlow Backups</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadSnapshots()}
            disabled={isLoadingList || Boolean(restoringFilename)}
            className="gap-1.5 h-7 px-2.5 text-xs shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {listError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed break-words">{listError}</span>
          </div>
        )}

        {isLoadingList ? (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent)]" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Loading Google Drive snapshots...
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Reading manifest.json from your visible RentFlow Backups folder.
              </p>
            </div>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface-sunken)] space-y-2">
            <Cloud className="w-7 h-7 mx-auto text-[var(--text-subtle)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              No snapshots found in RentFlow Backups
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
              Snapshots are created automatically 500ms after any database write or when you click Sync Now.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
            {snapshots.map((entry, idx) => {
              const summaryLabel = formatSnapshotSummary(entry);
              const isSelected = selectedSnapshot?.filename === entry.filename;
              const isThisRestoring = restoringFilename === entry.filename;

              return (
                <button
                  key={`${entry.filename}-${idx}`}
                  type="button"
                  onClick={() => setSelectedSnapshot(entry)}
                  disabled={Boolean(restoringFilename)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/25 ring-1 ring-[var(--accent)]/40'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-sunken)]'
                  } ${restoringFilename ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {summaryLabel}
                      </span>
                      {idx === 0 && <Badge variant="success">Latest</Badge>}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                      <span className="font-mono truncate max-w-[290px]">{entry.filename}</span>
                      {typeof entry.record_count === 'number' && (
                        <span className="inline-flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          <span>{entry.record_count} records</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isThisRestoring ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent)]" />
                    ) : isSelected ? (
                      <CheckCircle2 className="w-5 h-5 text-[var(--accent)]" />
                    ) : (
                      <Download className="w-4 h-4 text-[var(--text-subtle)]" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selectedSnapshot && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200 space-y-1">
            <p className="font-semibold">
              Restore {selectedSnapshot.filename} and reload RentFlow?
            </p>
            <p className="text-[11px] opacity-90 leading-relaxed">
              This downloads and decrypts the selected snapshot, replaces your local SQLite database, and reloads the window.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={Boolean(restoringFilename)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!selectedSnapshot || Boolean(restoringFilename)}
            onClick={() => {
              if (selectedSnapshot) {
                void handleConfirmRestore(selectedSnapshot);
              }
            }}
            className="gap-1.5"
          >
            {restoringFilename ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Restoring Snapshot...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Restore This Snapshot</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RestoreModal;
