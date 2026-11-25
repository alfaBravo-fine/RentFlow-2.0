import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  History,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from './icons';
import { useDriveSync } from '../hooks/useDriveSync';
import { BackupManifestEntry, ChangeHistoryEntry } from '../lib/tauri/bridge';
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
    return `Full Backup · ${entry.size}`;
  }

  const parsed = new Date(entry.date);
  if (Number.isNaN(parsed.getTime())) {
    return `Full Backup · ${entry.date} · ${entry.size}`;
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

  return `${dateLabel} at ${timeLabel} · ${entry.size}`;
}

export function formatChangeSummary(entry: ChangeHistoryEntry): string {
  const actionLabel =
    entry.action === 'add' ? 'Added' : entry.action === 'delete' ? 'Deleted' : 'Edited';
  const entityLabel = entry.entity.replace(/_/g, ' ');
  const headline = entry.summary || `${actionLabel} ${entityLabel}`;

  if (!entry.date) {
    return `${headline} · ${entry.size}`;
  }
  const parsed = new Date(entry.date);
  if (Number.isNaN(parsed.getTime())) {
    return `${headline} · ${entry.date}`;
  }
  const timeLabel = parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${headline} · ${timeLabel}`;
}

export const RestoreModal: React.FC<RestoreModalProps> = ({
  isOpen,
  onClose,
  onRestored,
}) => {
  const { getGroupedBackupList, restoreFromSnapshot, revertChangeSnapshot } = useDriveSync();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'full' | 'changes'>('full');
  const [fullBackups, setFullBackups] = useState<BackupManifestEntry[]>([]);
  const [changeHistory, setChangeHistory] = useState<ChangeHistoryEntry[]>([]);
  const [changesSinceFull, setChangesSinceFull] = useState(0);

  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedFull, setSelectedFull] = useState<BackupManifestEntry | null>(null);
  const [selectedChange, setSelectedChange] = useState<ChangeHistoryEntry | null>(null);
  const [actingFilename, setActingFilename] = useState<string | null>(null);

  const loadGroupedBackups = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    setSelectedFull(null);
    setSelectedChange(null);
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
            "Could not load backup history from your 'RentFlow Grouped Backups' folder.";
      setListError(msg);
    } finally {
      setIsLoadingList(false);
    }
  }, [getGroupedBackupList]);

  useEffect(() => {
    if (isOpen) {
      void loadGroupedBackups();
    } else {
      setSelectedFull(null);
      setSelectedChange(null);
      setActingFilename(null);
      setListError(null);
    }
  }, [isOpen, loadGroupedBackups]);

  const handleConfirmFullRestore = async (entry: BackupManifestEntry) => {
    setActingFilename(entry.filename);
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
        setListError(res.message || 'Selected backup did not contain restorable records.');
      }
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Failed to restore from selected backup.';
      setListError(msg);
      showToast({ type: 'error', message: msg });
    } finally {
      setActingFilename(null);
    }
  };

  const handleConfirmRevertChange = async (entry: ChangeHistoryEntry) => {
    setActingFilename(entry.filename);
    setListError(null);

    try {
      const res = await revertChangeSnapshot(entry.filename);
      if (res.restored) {
        showToast({
          type: 'success',
          message: res.message || `Reverted ${entry.filename}`,
        });
        onRestored?.(res);
        setSelectedChange(null);
        await loadGroupedBackups();
      } else {
        setListError(res.message || 'Could not revert this change snapshot.');
      }
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Failed to revert selected change.';
      setListError(msg);
      showToast({ type: 'error', message: msg });
    } finally {
      setActingFilename(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!actingFilename) onClose();
      }}
      title="Restore Data"
      description="Restore an entire full session backup or revert one specific record change from 'RentFlow Grouped Backups'."
      maxWidth="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] text-xs">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              AES-256-GCM &bull; {changesSinceFull}/10 small changes toward next full backup
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadGroupedBackups()}
            disabled={isLoadingList || Boolean(actingFilename)}
            className="gap-1.5 h-7 px-2.5 text-xs shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Two-Tab Restore Switcher */}
        <div
          role="tablist"
          aria-label="Restore mode"
          className="grid grid-cols-2 p-1 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'full'}
            onClick={() => {
              setActiveTab('full');
              setSelectedChange(null);
            }}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'full'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Full Backups</span>
            <span className="text-[11px] font-mono opacity-70 tabular-nums">
              ({fullBackups.length})
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'changes'}
            onClick={() => {
              setActiveTab('changes');
              setSelectedFull(null);
            }}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'changes'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Change History</span>
            <span className="text-[11px] font-mono opacity-70 tabular-nums">
              ({changeHistory.length})
            </span>
          </button>
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
                Loading Google Drive grouped backups...
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Fetching backup history from your RentFlow Grouped Backups folder.
              </p>
            </div>
          </div>
        ) : activeTab === 'full' ? (
          fullBackups.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface-sunken)] space-y-2">
              <Cloud className="w-7 h-7 mx-auto text-[var(--text-subtle)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                No Full Backups found yet
              </p>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
                Full Backups compile automatically every 24 hours or after 10 small record changes.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {fullBackups.map((entry, idx) => {
                const summaryLabel = formatSnapshotSummary(entry);
                const isSelected = selectedFull?.filename === entry.filename;
                const isActing = actingFilename === entry.filename;

                return (
                  <button
                    key={`${entry.filename}-${idx}`}
                    type="button"
                    onClick={() => setSelectedFull(entry)}
                    disabled={Boolean(actingFilename)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/25 ring-1 ring-[var(--accent)]/40'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-sunken)]'
                    } ${actingFilename ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                          {summaryLabel}
                        </span>
                        {idx === 0 && (
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            · Latest
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
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
                      {isActing ? (
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
          )
        ) : changeHistory.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface-sunken)] space-y-2">
            <History className="w-7 h-7 mx-auto text-[var(--text-subtle)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              No Small Change snapshots yet
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
              Every create, edit, or delete automatically uploads a lightweight encrypted snapshot here (last 20 kept).
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
            {changeHistory.map((entry, idx) => {
              const summaryLabel = formatChangeSummary(entry);
              const isSelected = selectedChange?.filename === entry.filename;
              const isActing = actingFilename === entry.filename;

              return (
                <button
                  key={`${entry.filename}-${idx}`}
                  type="button"
                  onClick={() => setSelectedChange(entry)}
                  disabled={Boolean(actingFilename)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/25 ring-1 ring-[var(--accent)]/40'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-sunken)]'
                  } ${actingFilename ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RotateCcw className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums truncate">
                        {summaryLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                      <span className="font-mono truncate max-w-[290px]">{entry.filename}</span>
                      <span>· {entry.table}</span>
                      <span>· {entry.size}</span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isActing ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent)]" />
                    ) : isSelected ? (
                      <CheckCircle2 className="w-5 h-5 text-[var(--accent)]" />
                    ) : (
                      <RotateCcw className="w-4 h-4 text-[var(--text-subtle)]" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === 'full' && selectedFull && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200 space-y-1">
            <p className="font-semibold">
              Restore {selectedFull.filename} and reload RentFlow?
            </p>
            <p className="text-[11px] opacity-90 leading-relaxed">
              This downloads and decrypts the full backup, replaces your local portfolio data, and reloads RentFlow.
            </p>
          </div>
        )}

        {activeTab === 'changes' && selectedChange && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200 space-y-1">
            <p className="font-semibold">
              Revert only &ldquo;{formatChangeSummary(selectedChange)}&rdquo;?
            </p>
            <p className="text-[11px] opacity-90 leading-relaxed">
              Undoes only this individual change ({selectedChange.table.replace(/_/g, ' ')}) without affecting other records.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={Boolean(actingFilename)}
          >
            Cancel
          </Button>
          {activeTab === 'full' ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!selectedFull || Boolean(actingFilename)}
              onClick={() => {
                if (selectedFull) {
                  void handleConfirmFullRestore(selectedFull);
                }
              }}
              className="gap-1.5"
            >
              {actingFilename ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Restoring Full Backup...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Restore Full Backup</span>
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!selectedChange || Boolean(actingFilename)}
              onClick={() => {
                if (selectedChange) {
                  void handleConfirmRevertChange(selectedChange);
                }
              }}
              className="gap-1.5"
            >
              {actingFilename ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Reverting Change...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert Only This Change</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default RestoreModal;
