import React, { useState, useEffect } from 'react';
import { Lease, Tenant, Unit } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import { Modal } from '../../components/ui/Modal';
import { usePrint } from '../../components/print/PrintContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input, Select } from '../../components/ui/Input';
import {
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Camera,
  Printer,
} from '../../components/icons';

export interface ChecklistItem {
  id: string;
  type: 'move_in' | 'move_out';
  title: string;
  category: string;
  status: 'passed' | 'needs_repair' | 'failed' | 'pending';
  notes?: string;
  photoData?: string | null;
  photoTimestamp?: string | null;
  completedAt?: string | null;
}

interface LeaseChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  lease: Lease | null;
  tenant?: Tenant;
  unit?: Unit;
}

const DEFAULT_ITEMS = [
  { title: 'Walls & ceilings free of damage, scuffs and nails', category: 'General Structure' },
  { title: 'Hardwood floors and carpets clean and vacuumed', category: 'Flooring' },
  { title: 'Windows, blinds and locks opening and latching smoothly', category: 'Windows & Doors' },
  { title: 'Kitchen refrigerator and freezer clean and cooling properly', category: 'Kitchen Appliances' },
  { title: 'Stove burners, oven racks and range hood exhaust tested', category: 'Kitchen Appliances' },
  { title: 'Plumbing fixtures, sink drains and toilet flushing correctly', category: 'Bathrooms' },
  { title: 'Smoke alarms and carbon monoxide detectors tested and functional', category: 'Life Safety' },
  { title: 'All door keys, mailbox keys and building access fobs handed over', category: 'Key Handover' },
];

export const LeaseChecklistModal: React.FC<LeaseChecklistModalProps> = ({
  isOpen,
  onClose,
  lease,
  tenant,
  unit,
}) => {
  const pack = usePack();
  const { showToast } = useToast();
  const { printReport } = usePrint();

  const [activeTab, setActiveTab] = useState<'move_in' | 'move_out'>('move_in');
  const [items, setItems] = useState<ChecklistItem[]>([]);

  // New item form
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('General');

  // Load from centralized settings store for this lease
  useEffect(() => {
    if (!lease) return;
    const stored = useAppSettingsStore.getState().getLeaseChecklist(lease.id);
    if (Array.isArray(stored) && stored.length > 0) {
      setItems(stored);
      return;
    }

    // Initialize with standard defaults
    const initial: ChecklistItem[] = [];
    ['move_in', 'move_out'].forEach((t) => {
      DEFAULT_ITEMS.forEach((def, idx) => {
        initial.push({
          id: `${t}-${idx}`,
          type: t as any,
          title: def.title,
          category: def.category,
          status: 'pending',
          notes: '',
        });
      });
    });
    setItems(initial);
  }, [lease]);

  const saveChecklist = (updated: ChecklistItem[]) => {
    if (!lease) return;
    setItems(updated);
    useAppSettingsStore.getState().setLeaseChecklist(lease.id, updated);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemTitle.trim()) return;

    const newItem: ChecklistItem = {
      id: generateUUID(),
      type: activeTab,
      title: newItemTitle.trim(),
      category: newItemCategory,
      status: 'pending',
    };

    const updated = [...items, newItem];
    saveChecklist(updated);
    setNewItemTitle('');
    showToast({ type: 'success', message: 'Inspection item added' });
  };

  const handleStatusChange = (id: string, status: ChecklistItem['status']) => {
    const updated = items.map((it) =>
      it.id === id
        ? {
            ...it,
            status,
            completedAt: status !== 'pending' ? new Date().toISOString() : null,
          }
        : it
    );
    saveChecklist(updated);
  };

  const handleNotesChange = (id: string, notes: string) => {
    const updated = items.map((it) => (it.id === id ? { ...it, notes } : it));
    saveChecklist(updated);
  };

  const handlePhotoUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const timestampStr = new Date().toLocaleString(pack.locale || 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    reader.onload = () => {
      const updated = items.map((it) =>
        it.id === id
          ? {
              ...it,
              photoData: reader.result as string,
              photoTimestamp: timestampStr,
            }
          : it
      );
      saveChecklist(updated);
      showToast({ type: 'success', message: 'Timestamped inspection photo attached' });
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteItem = (id: string) => {
    const updated = items.filter((it) => it.id !== id);
    saveChecklist(updated);
  };

  if (!lease) return null;

  const currentTabItems = items.filter((it) => it.type === activeTab);
  const passedCount = currentTabItems.filter((it) => it.status === 'passed').length;
  const issuesCount = currentTabItems.filter(
    (it) => it.status === 'needs_repair' || it.status === 'failed'
  ).length;
  const pendingCount = currentTabItems.filter((it) => it.status === 'pending').length;

  const handlePrintCertificate = () => {
    const inspectionTitle =
      activeTab === 'move_in'
        ? 'Move-In Property Condition Inspection Certificate'
        : 'Move-Out Property Condition Inspection Certificate';
    const generatedAt = new Date().toLocaleDateString(pack.locale || 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    printReport(
      <div className="print-area bg-white text-black w-full max-w-[800px] mx-auto font-sans p-8 space-y-6">
        <div className="flex items-start justify-between pb-5 border-b-2 border-gray-900 gap-6">
          <div>
            <h1 className="text-xl font-bold text-black">{inspectionTitle}</h1>
            <p className="text-xs text-gray-700 mt-1">
              Tenant: <strong>{tenant?.name || 'Resident'}</strong> &middot; Unit:{' '}
              <strong>{unit?.name || 'Rental Unit'}</strong>
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              Lease Term: {lease.start_date} to {lease.end_date} &middot; Issued: {generatedAt}
            </p>
          </div>
          <div className="text-right text-xs text-gray-700 shrink-0">
            <div className="font-bold text-black">Certificate Ref: {lease.id.slice(0, 8).toUpperCase()}</div>
            <div className="mt-1">
              Passed: {passedCount} &middot; Issues: {issuesCount} &middot; Pending: {pendingCount}
            </div>
          </div>
        </div>

        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-800 font-bold uppercase text-gray-800">
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3">Inspection Item &amp; Notes</th>
              <th className="py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {currentTabItems.map((item) => {
              const statusLabel =
                item.status === 'passed'
                  ? 'PASSED'
                  : item.status === 'needs_repair'
                  ? 'NEEDS REPAIR'
                  : item.status === 'failed'
                  ? 'FAILED'
                  : 'PENDING';

              return (
                <tr key={item.id} className="break-inside-avoid">
                  <td className="py-2.5 pr-3 align-top font-semibold text-gray-700 whitespace-nowrap">
                    {item.category}
                  </td>
                  <td className="py-2.5 pr-3 align-top text-black">
                    <div className="font-semibold">{item.title}</div>
                    {item.notes && (
                      <div className="text-gray-700 mt-1">Notes: {item.notes}</div>
                    )}
                    {item.photoTimestamp && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Photo Timestamp: {item.photoTimestamp}
                      </div>
                    )}
                    {item.photoData && (
                      <div className="mt-2">
                        <img
                          src={item.photoData}
                          alt={item.title}
                          style={{ maxWidth: '180px', maxHeight: '110px', objectFit: 'cover', borderRadius: '6px' }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 align-top text-right font-bold whitespace-nowrap">
                    {statusLabel}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-8 pt-10 break-inside-avoid">
          <div className="border-t border-gray-800 pt-2 text-xs text-gray-700">
            <div className="font-bold text-black">Landlord / Property Inspector Signature</div>
            <div className="mt-1">Date: ______________________</div>
          </div>
          <div className="border-t border-gray-800 pt-2 text-xs text-gray-700">
            <div className="font-bold text-black">Tenant Acknowledgment Signature ({tenant?.name || 'Tenant'})</div>
            <div className="mt-1">Date: ______________________</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tenancy Move-In / Move-Out Inspection Checklist"
      description={`Unit condition verification & timestamped evidence for ${tenant?.name || 'Tenant'} (${unit?.name || 'Unit'})`}
      maxWidth="2xl"
    >
      <div className="space-y-5 min-w-0 w-full max-w-full">
        {/* Inspection Type Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab('move_in')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'move_in'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Move-In Inspection (Arrival)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('move_out')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'move_out'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Move-Out Inspection (Departure)
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            <Badge variant="success">{passedCount} Passed</Badge>
            {issuesCount > 0 && <Badge variant="danger">{issuesCount} Issue(s)</Badge>}
          </div>
        </div>

        {/* Add Custom Item */}
        <form
          onSubmit={handleAddItem}
          className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 w-full"
        >
          <div className="flex-1 min-w-0 w-full">
            <Input
              type="text"
              placeholder="e.g. Balcony railing secure & painted..."
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              className="text-xs h-9 w-full max-w-full"
              required
            />
          </div>
          <div className="w-full sm:w-40 shrink-0 min-w-0">
            <Select
              value={newItemCategory}
              onChange={(e) => setNewItemCategory(e.target.value)}
              className="text-xs h-9 w-full max-w-full"
            >
              <option value="General">General</option>
              <option value="Flooring">Flooring</option>
              <option value="Appliances">Appliances</option>
              <option value="Bathrooms">Bathrooms</option>
              <option value="Life Safety">Life Safety</option>
              <option value="Keys">Keys</option>
            </Select>
          </div>
          <Button type="submit" size="sm" variant="primary" className="h-9 gap-1 shrink-0">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </Button>
        </form>

        {/* Inspection Items List (Clean flex-col gap-4 without rogue white backgrounds) */}
        <div className="flex flex-col gap-4 max-h-[460px] overflow-y-auto pr-1 min-w-0 w-full">
          {currentTabItems.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--text-secondary)]">
              No checklist items recorded yet.
            </div>
          ) : (
            currentTabItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-all flex flex-col gap-3 min-w-0 w-full"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 min-w-0">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)] block truncate">
                      {item.category}
                    </span>
                    <h4 className="text-xs font-bold text-[var(--text-primary)] break-words">
                      {item.title}
                    </h4>
                  </div>

                  {/* Status Selection Buttons */}
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, 'passed')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        item.status === 'passed'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-emerald-600'
                      }`}
                    >
                      Passed
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, 'needs_repair')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        item.status === 'needs_repair'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-amber-600'
                      }`}
                    >
                      Needs Repair
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, 'failed')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        item.status === 'failed'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-rose-600'
                      }`}
                    >
                      Failed
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1 rounded text-[var(--text-subtle)] hover:text-rose-600 ml-1 transition-colors cursor-pointer"
                      title="Delete item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Notes Input */}
                <input
                  type="text"
                  placeholder="Inspector notes or observed defect details..."
                  value={item.notes || ''}
                  onChange={(e) => handleNotesChange(item.id, e.target.value)}
                  className="w-full max-w-full min-w-0 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-gray-400 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />

                {/* Timestamped Photo Attachment */}
                <div className="flex items-center justify-between gap-3 pt-1 text-sm text-gray-400 min-w-0 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0 flex-wrap">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-sm font-medium text-[var(--accent)] hover:underline min-w-0">
                      <Camera className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.photoData ? 'Replace Photo' : 'Attach Timestamped Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoUpload(item.id, e)}
                        className="hidden"
                      />
                    </label>

                    {item.photoTimestamp && (
                      <span className="text-xs font-mono text-gray-400 flex items-center gap-1 min-w-0">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.photoTimestamp}</span>
                      </span>
                    )}
                  </div>

                  {item.completedAt && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified</span>
                    </span>
                  )}
                </div>

                {/* Photo Preview with Verified Timestamp Stamp */}
                {item.photoData && (
                  <div className="relative rounded-xl overflow-hidden border border-[var(--border-strong)] mt-1 inline-block max-w-[220px]">
                    <img src={item.photoData} alt={item.title} className="w-full h-28 object-cover" />
                    <div className="absolute bottom-0 inset-x-0 bg-black/70 backdrop-blur-xs px-2 py-1 text-[10px] text-white font-mono flex items-center justify-between gap-2">
                      <span className="truncate">Verified Timestamp</span>
                      <span className="truncate">{item.photoTimestamp}</span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-[var(--border-subtle)] no-print min-w-0 flex-wrap">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="sm" onClick={handlePrintCertificate} className="gap-2">
            <Printer className="w-3.5 h-3.5" />
            <span>Print Inspection Certificate</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
