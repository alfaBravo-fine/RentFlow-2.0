import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  Cloud,
  Database,
  Download,
  Folder,
  History,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from './icons';
import { useDriveSync } from '../hooks/useDriveSync';
import {
  BackupGroupEntry,
  BackupManifestEntry,
  ChangeHistoryEntry,
  GroupedBackupList,
} from '../lib/tauri/bridge';
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

export function formatGroupTitle(group: BackupGroupEntry): string {
  const isoCandidate = group.created_at || group.updated_at;
  if (isoCandidate) {
    const parsed = new Date(isoCandidate);
    if (!Number.isNaN(parsed.getTime())) {
      const datePart = parsed.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const timePart = parsed.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
      return `Backup ${datePart}, ${timePart}`;
    }
  }
  return group.folder_name;
}

function buildFallbackGroups(grouped: GroupedBackupList): BackupGroupEntry[] {
  if (Array.isArray(grouped.groups) && grouped.groups.length > 0) {
    return grouped.groups;
  }

  const map = new Map<string, BackupGroupEntry>();

  for (const full of grouped.full_backups || []) {
    const datePrefix = full.date ? full.date.slice(0, 10) : '2026-01-01';
    const hourPrefix = full.date && full.date.length >= 13 ? full.date.slice(11, 13) : '00';
    const folderName = full.folder_name || `Backup_${datePrefix}_${hourPrefix}-00`;
    const existing = map.get(folderName) || {
      folder_name: folderName,
      folder_id: full.folder_id,
      created_at: full.date,
      updated_at: full.date,
      started_epoch: 0,
      changes: [],
    };
    if (!existing.full_snapshot_filename) {
      existing.full_snapshot_filename = full.filename;
      existing.full_snapshot_file_id = full.file_id;
      existing.full_snapshot_size = full.size;
      existing.record_count = full.record_count;
    }
    map.set(folderName, existing);
  }

  for (const ch of grouped.change_history || []) {
    const datePrefix = ch.date ? ch.date.slice(0, 10) : '2026-01-01';
    const hourPrefix = ch.date && ch.date.length >= 13 ? ch.date.slice(11, 13) : '00';
    const folderName = ch.folder_name || `Backup_${datePrefix}_${hourPrefix}-00`;
    const existing = map.get(folderName) || {
      folder_name: folderName,
      folder_id: ch.folder_id,
      created_at: ch.date,
      updated_at: ch.date,
      started_epoch: 0,
      changes: [],
    };
    existing.changes.push(ch);
    if (ch.date && (!existing.updated_at || ch.date > existing.updated_at)) {
      existing.updated_at = ch.date;
    }
    map.set(folderName, existing);
  }

  return Array.from(map.values()).sort((a, b) =>
    (b.created_at || b.folder_name).localeCompare(a.created_at || a.folder_name)
  );
}

export const RestoreModal: React.FC<RestoreModalProps> = ({
  isOpen,
  onClose,
  onRestored,
}) => {
  const { getGroupedBackupList, restoreGroupBackup, restoreFromSnapshot, revertChangeSnapshot } =
    useDriveSync();
  const { showToast } = useToast();

  const [groups, setGroups] = useState<BackupGroupEntry[]>([]);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [changesSinceFull, setChangesSinceFull] = useState(0);

  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actingKey, setActingKey] = useState<string | null>(null);

  const loadGroupedBackups = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const grouped = await getGroupedBackupList();
      const resolvedGroups = buildFallbackGroups(grouped);
      setGroups(resolvedGroups);
      setChangesSinceFull(grouped.changes_since_full_backup ?? 0);
      setSelectedFolderName((prev) => {
        if (prev && resolvedGroups.some((g) => g.folder_name === prev)) {
          return prev;
        }
        return resolvedGroups[0]?.folder_name ?? null;
      });
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message ||
            "Could not load grouped backup history from your 'RentFlow Grouped Backups' folder.";
      setListError(msg);
    } finally {
      setIsLoadingList(false);
    }
  }, [getGroupedBackupList]);

  useEffect(() => {
    if (isOpen) {
      void loadGroupedBackups();
    } else {
      setActingKey(null);
      setListError(null);
    }
  }, [isOpen, loadGroupedBackups]);

  const selectedGroup =
    groups.find((g) => g.folder_name === selectedFolderName) ?? groups[0] ?? null;

  const handleRestoreWholeGroup = async (group: BackupGroupEntry) => {
    setActingKey(`group:${group.folder_name}`);
    setListError(null);

    try {
      const res = group.folder_name
        ? await restoreGroupBackup(group.folder_name)
        : await restoreFromSnapshot(group.full_snapshot_filename || '', group.folder_id);

      if (res.restored) {
        showToast({
          type: 'success',
          message: `Restored ${res.totalRecords} records from ${formatGroupTitle(group)}. Reloading RentFlow...`,
        });
        onRestored?.(res);
        onClose();
        window.location.reload();
      } else {
        setListError(res.message || 'Selected backup group did not contain restorable records.');
      }
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Failed to restore selected backup group.';
      setListError(msg);
      showToast({ type: 'error', message: msg });
    } finally {
      setActingKey(null);
    }
  };

  const handleRevertChange = async (change: ChangeHistoryEntry, group: BackupGroupEntry) => {
    setActingKey(`change:${group.folder_name}:${change.filename}`);
    setListError(null);

    try {
      const res = await revertChangeSnapshot(
        change.filename,
        change.folder_id || group.folder_id
      );
      if (res.restored) {
        showToast({
          type: 'success',
          message: res.message || `Reverted ${change.filename}`,
        });
        onRestored?.(res);
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
      setActingKey(null);
    }
  };

  const getActionBadgeStyle = (action: string) => {
    if (action === 'add') {
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25';
    }
    if (action === 'delete') {
      return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25';
    }
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!actingKey) onClose();
      }}
      title="Restore Data"
      description="Select an hourly backup group on the left to restore the entire session snapshot or revert an individual change on the right."
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Status Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] text-xs">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              AES-256-GCM Encrypted &bull; {groups.length} Backup Group{groups.length === 1 ? '' : 's'} &bull;{' '}
              {changesSinceFull}/10 small changes toward next full snapshot
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadGroupedBackups()}
            disabled={isLoadingList || Boolean(actingKey)}
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
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent)]" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Loading Google Drive grouped backups...
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Fetching hourly folders and itemized change snapshots from RentFlow Grouped Backups.
              </p>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div className="py-12 px-4 text-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface-sunken)] space-y-2">
            <Cloud className="w-8 h-8 mx-auto text-[var(--text-subtle)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              No Grouped Backups Found Yet
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
              Changes made while signed in are automatically grouped into hourly folders inside
              &lsquo;RentFlow Grouped Backups&rsquo;.
            </p>
          </div>
        ) : (
          /* Two-Pane Grouped Restore Browser */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 min-h-[380px]">
            {/* Left Pane: Hourly Grouped Backups */}
            <div className="md:col-span-5 flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)] overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  <Folder className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Grouped Backups</span>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-subtle)] tabular-nums">
                  {groups.length}
                </span>
              </div>

              <div className="p-2 space-y-1.5 max-h-[360px] overflow-y-auto">
                {groups.map((group, idx) => {
                  const isSelected = selectedGroup?.folder_name === group.folder_name;
                  const changeCount = group.changes?.length ?? 0;

                  return (
                    <button
                      key={`${group.folder_name}-${idx}`}
                      type="button"
                      onClick={() => setSelectedFolderName(group.folder_name)}
                      disabled={Boolean(actingKey)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                        isSelected
                          ? 'border-[var(--accent)] bg-[var(--bg-surface)] ring-1 ring-[var(--accent)]/40 shadow-xs'
                          : 'border-transparent hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface)]/70'
                      } ${actingKey ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                          <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {formatGroupTitle(group)}
                          </span>
                          {idx === 0 && (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                              Latest
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-secondary)] tabular-nums">
                          <span className="font-mono truncate max-w-[170px]">{group.folder_name}</span>
                          <span>
                            &bull; {changeCount} {changeCount === 1 ? 'change' : 'changes'}
                          </span>
                          {typeof group.record_count === 'number' && (
                            <span>&bull; {group.record_count} recs</span>
                          )}
                        </div>
                      </div>

                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isSelected ? 'text-[var(--accent)] translate-x-0.5' : 'text-[var(--text-subtle)]'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Pane: Selected Group Header + Itemized Small Changes */}
            <div className="md:col-span-7 flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
              {selectedGroup ? (
                <>
                  {/* Selected Group Action Header */}
                  <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-[var(--accent)] shrink-0" />
                        <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                          {formatGroupTitle(selectedGroup)}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[var(--text-secondary)] tabular-nums">
                        <span className="font-mono">{selectedGroup.folder_name}</span>
                        {selectedGroup.full_snapshot_size && (
                          <span>&bull; {selectedGroup.full_snapshot_size}</span>
                        )}
                        {typeof selectedGroup.record_count === 'number' && (
                          <span>&bull; {selectedGroup.record_count} records</span>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={Boolean(actingKey)}
                      onClick={() => void handleRestoreWholeGroup(selectedGroup)}
                      className="gap-1.5 shrink-0"
                    >
                      {actingKey === `group:${selectedGroup.folder_name}` ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Restoring Group...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Restore Whole Group</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Itemized Small Changes inside Selected Group */}
                  <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Itemized Small Changes
                    </span>
                    <span className="font-mono tabular-nums text-[var(--text-subtle)]">
                      {selectedGroup.changes?.length ?? 0} item
                      {(selectedGroup.changes?.length ?? 0) === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto flex-1">
                    {!selectedGroup.changes || selectedGroup.changes.length === 0 ? (
                      <div className="py-10 px-4 text-center text-xs text-[var(--text-secondary)] space-y-1.5">
                        <History className="w-6 h-6 mx-auto text-[var(--text-subtle)]" />
                        <p className="font-semibold text-[var(--text-primary)]">
                          Full Snapshot Group
                        </p>
                        <p className="max-w-xs mx-auto leading-relaxed">
                          This group holds a full portfolio snapshot. Click &ldquo;Restore Whole
                          Group&rdquo; above to restore all records.
                        </p>
                      </div>
                    ) : (
                      selectedGroup.changes.map((change, idx) => {
                        const actionKey = `change:${selectedGroup.folder_name}:${change.filename}`;
                        const isReverting = actingKey === actionKey;
                        const summaryLabel = formatChangeSummary(change);

                        return (
                          <div
                            key={`${change.filename}-${idx}`}
                            className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)]/60 hover:border-[var(--border-strong)] transition-colors flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${getActionBadgeStyle(
                                    change.action
                                  )}`}
                                >
                                  {change.action}
                                </span>
                                <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                  {summaryLabel}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-secondary)] tabular-nums">
                                <span className="font-mono truncate max-w-[230px]">
                                  {change.filename}
                                </span>
                                <span>&bull; {change.table.replace(/_/g, ' ')}</span>
                                <span>&bull; {change.size}</span>
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={Boolean(actingKey)}
                              onClick={() => void handleRevertChange(change, selectedGroup)}
                              className="gap-1.5 h-8 px-2.5 text-xs shrink-0"
                            >
                              {isReverting ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Reverting...</span>
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Revert Change</span>
                                </>
                              )}
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={Boolean(actingKey)}
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RestoreModal;
