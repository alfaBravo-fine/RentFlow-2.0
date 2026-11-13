import React, { useState } from 'react';
import { db } from '../../db/client';
import { Expense, Property, Unit, Vendor } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney, parseMajorToMinor, minorToMajorNumber } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Banknote,
  Plus,
  Calendar,
  Pencil,
  Trash2,
  Paperclip,
  Upload,
  HardHat,
  Building2,
  FileSpreadsheet,
  Search,
  Eye,
  RefreshCw,
} from '../../components/icons';
import { BankReconciliationModal } from './BankReconciliationModal';

export const ExpensesView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const [expenses, setExpenses] = useState<Expense[]>(() =>
    db.getTable<Expense>('expenses').filter((e) => !e.deleted_at && !(e as any).deletedAt)
  );
  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt);
  const activePropertyIds = new Set(properties.map((p) => p.id));
  const units = db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt && activePropertyIds.has(u.property_id));
  const vendors = db.getTable<Vendor>('vendors').filter((v) => !v.deleted_at && !(v as any).deletedAt);

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [isReconOpen, setIsReconOpen] = useState(false);

  // Form states
  const [propertyId, setPropertyId] = useState(properties[0]?.id || '');
  const [unitId, setUnitId] = useState<string>('');
  const [category, setCategory] = useState('repairs_and_maintenance');
  const [amount, setAmount] = useState('250');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vendorId, setVendorId] = useState<string>('');
  const [receiptData, setReceiptData] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const propertyUnits = units.filter((u) => u.property_id === propertyId);

  const handleOpenAdd = () => {
    setEditingExpense(null);
    setPropertyId(properties[0]?.id || '');
    setUnitId('');
    setCategory('repairs_and_maintenance');
    setAmount('250');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setVendorId('');
    setReceiptData(null);
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setPropertyId(exp.property_id || properties[0]?.id || '');
    setUnitId(exp.unit_id || '');
    setCategory(exp.category);
    setAmount(String(minorToMajorNumber(exp.amount_minor, exp.currency_code || pack)));
    setExpenseDate(exp.expense_date);
    setVendorId(exp.vendor_id || '');
    setReceiptData(exp.receipt_path || null);
    setNotes(exp.notes || '');
    setIsModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setReceiptData(reader.result as string);
      showToast({ type: 'success', message: `Receipt "${file.name}" attached` });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amountMinor = parseMajorToMinor(amount, pack);
    if (amountMinor <= 0) {
      showToast({ type: 'error', message: 'Expense amount must be greater than zero!' });
      return;
    }

    if (editingExpense) {
      db.updateItem<Expense>('expenses', editingExpense.id, {
        property_id: propertyId || null,
        unit_id: unitId || null,
        category,
        amount_minor: amountMinor,
        expense_date: expenseDate,
        vendor_id: vendorId || null,
        receipt_path: receiptData,
        notes: notes.trim() || null,
      });
      showToast({ type: 'success', message: 'Expense record updated' });
    } else {
      db.insertItem<Expense>('expenses', {
        id: generateUUID(),
        org_id: 'org_demo_1',
        property_id: propertyId || null,
        unit_id: unitId || null,
        category,
        amount_minor: amountMinor,
        currency_code: pack.currency.code,
        expense_date: expenseDate,
        vendor_id: vendorId || null,
        receipt_path: receiptData,
        notes: notes.trim() || null,
      });
      showToast({ type: 'success', message: `Expense of ${formatMoney(amountMinor, pack)} logged` });
    }

    setExpenses(db.getTable<Expense>('expenses').filter((item) => !item.deleted_at && !(item as any).deletedAt));
    setIsModalOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!deletingExpense) return;
    const exp = deletingExpense;
    db.softDeleteItem<Expense>('expenses', exp.id);
    setExpenses(db.getTable<Expense>('expenses').filter((item) => !item.deleted_at && !(item as any).deletedAt));
    setDeletingExpense(null);
    showToast({
      type: 'info',
      message: 'Expense entry archived',
      onUndo: () => {
        db.updateItem<Expense>('expenses', exp.id, { deleted_at: null });
        setExpenses(db.getTable<Expense>('expenses').filter((item) => !item.deleted_at && !(item as any).deletedAt));
        showToast({ type: 'success', message: 'Restored expense entry' });
      },
    });
  };

  const totalExpenseMinor = expenses.reduce((acc, e) => acc + e.amount_minor, 0);

  const filteredExpenses = expenses.filter((e) => {
    const prop = properties.find((p) => p.id === e.property_id);
    const vendor = vendors.find((v) => v.id === e.vendor_id);
    const search = searchQuery.toLowerCase();
    return (
      e.category.toLowerCase().includes(search) ||
      (e.notes && e.notes.toLowerCase().includes(search)) ||
      (prop && prop.name.toLowerCase().includes(search)) ||
      (vendor && vendor.name.toLowerCase().includes(search))
    );
  });

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Operating Expenses & Outgoings
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            General repairs, property taxes, insurance premiums, and contractor disbursements ({pack.name})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setIsReconOpen(true)}
            className="gap-2 border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
            title="Upload bank statement CSV and auto-match deposits to tenants"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Bank Reconciliation (Auto-Match)</span>
          </Button>
          <Button variant="primary" onClick={handleOpenAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            <span>Log Expense</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="space-y-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Total Expenses (YTD)
          </span>
          <p className="text-2xl font-black font-mono text-rose-600">
            {formatMoney(totalExpenseMinor, pack)}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)] block">
            Across {properties.length} properties
          </span>
        </Card>

        <Card className="space-y-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Total Entries
          </span>
          <p className="text-2xl font-black font-mono text-[var(--text-primary)]">
            {expenses.length}
          </p>
          <span className="text-[11px] text-[var(--text-secondary)] block">
            Append-only verifiable ledger
          </span>
        </Card>

        <Card className="space-y-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Active Currency
          </span>
          <p className="text-2xl font-black font-mono text-[var(--accent)]">
            {pack.currency.code} ({pack.currency.symbol})
          </p>
          <span className="text-[11px] text-[var(--text-secondary)] block">
            Jurisdiction: {pack.name}
          </span>
        </Card>
      </div>

      {/* Expense Ledger Table */}
      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search expenses by category, vendor, or property..."
              className="w-full h-9 pl-10 pr-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <Badge variant="accent">{filteredExpenses.length} Records</Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="py-3.5 px-6">Date</th>
                <th className="py-3.5 px-6">Category</th>
                <th className="py-3.5 px-6">Property & Unit</th>
                <th className="py-3.5 px-6">Vendor</th>
                <th className="py-3.5 px-6">Notes / Receipt</th>
                <th className="py-3.5 px-6 text-right">Amount</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[var(--text-secondary)]">
                    No operating expenses found. Click <strong>Log Expense</strong> to create one.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => {
                  const prop = properties.find((p) => p.id === exp.property_id);
                  const unit = units.find((u) => u.id === exp.unit_id);
                  const vendor = vendors.find((v) => v.id === exp.vendor_id);

                  return (
                    <tr key={exp.id} className="h-14 hover:bg-[var(--bg-base)] transition-colors">
                      <td className="py-3 px-6 text-xs font-mono text-[var(--text-secondary)]">
                        {exp.expense_date}
                      </td>
                      <td className="py-3 px-6">
                        <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                          {exp.category.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-6">
                        <p className="font-semibold text-xs text-[var(--text-primary)]">
                          {prop?.name || 'General Portfolio'}
                        </p>
                        {unit && (
                          <p className="text-[11px] text-[var(--text-secondary)]">{unit.name}</p>
                        )}
                      </td>
                      <td className="py-3 px-6 text-xs text-[var(--text-secondary)]">
                        {vendor ? (
                          <span className="font-medium text-[var(--text-primary)]">{vendor.name}</span>
                        ) : (
                          <span className="text-[var(--text-subtle)] italic">—</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-xs text-[var(--text-secondary)]">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[180px]">{exp.notes || '—'}</span>
                          {exp.receipt_path && (
                            <button
                              onClick={() => setViewingReceipt(exp.receipt_path!)}
                              className="text-[var(--accent)] hover:underline flex items-center gap-1 text-[11px] font-semibold cursor-pointer shrink-0"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>Receipt</span>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-6 text-right font-mono font-bold number-tabular text-rose-600">
                        {formatMoney(exp.amount_minor, pack)}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(exp)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingExpense(exp)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                            title="Archive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Create / Edit Expense */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingExpense ? 'Edit Expense Record' : 'Log Operating Expense'}
        description="Attribute property maintenance, utilities, or supplier outgoings."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Associated Property"
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setUnitId('');
              }}
            >
              <option value="">General Portfolio / Unassigned</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <Select
              label="Specific Unit (Optional)"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={!propertyId}
            >
              <option value="">Common Area / Whole Property</option>
              {propertyUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Expense Category *"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="repairs_and_maintenance">Repairs & Maintenance</option>
              <option value="utilities">Master Utilities</option>
              <option value="property_tax">Property Tax</option>
              <option value="insurance">Insurance Premium</option>
              <option value="management_fee">Management Agency Commission</option>
              <option value="cleaning_turnover">Cleaning & Turnover</option>
              <option value="legal_professional">Legal & Accounting</option>
              <option value="capital_improvement">Capital Improvement (CapEx)</option>
              <option value="other">Other Expense</option>
            </Select>

            <Input
              label={`Amount (${pack.currency.code}) *`}
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />

            <Input
              label="Expense Date *"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Paid to Vendor / Trade (Optional)"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">None / Direct Payment</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.category})
                </option>
              ))}
            </Select>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Receipt File Upload (Image or PDF)
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileUpload}
                className="w-full text-xs text-[var(--text-secondary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent-subtle)] file:text-[var(--accent)] hover:file:bg-[var(--accent)]/20 cursor-pointer"
              />
              {receiptData && (
                <span className="text-[11px] text-emerald-600 block mt-1 font-medium">
                  File attached successfully
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Expense Description & Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Invoiced for replacement of pressure valve on boiler in building basement..."
              className="w-full p-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingExpense ? 'Save Changes' : 'Log Expense'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation */}
      <Modal
        isOpen={!!deletingExpense}
        onClose={() => setDeletingExpense(null)}
        title="Archive Expense Entry?"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Are you sure you want to archive this expense entry of <strong>{deletingExpense ? formatMoney(deletingExpense.amount_minor, pack) : ''}</strong>? The record can be restored from audit logs.
          </p>
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="outline" onClick={() => setDeletingExpense(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Confirm Archive
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: View Receipt */}
      <Modal
        isOpen={!!viewingReceipt}
        onClose={() => setViewingReceipt(null)}
        title="Receipt Document"
        maxWidth="md"
      >
        <div className="space-y-4">
          {viewingReceipt?.startsWith('data:image') ? (
            <img
              src={viewingReceipt}
              alt="Receipt preview"
              className="max-h-96 w-full object-contain rounded-xl border border-[var(--border-subtle)]"
            />
          ) : (
            <div className="p-8 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-base)] rounded-xl border border-[var(--border-subtle)]">
              <Paperclip className="w-8 h-8 mx-auto mb-2 text-[var(--accent)]" />
              <span>Digital document attached (Base64 file stream)</span>
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setViewingReceipt(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bank Reconciliation Modal */}
      <BankReconciliationModal
        isOpen={isReconOpen}
        onClose={() => setIsReconOpen(false)}
        onReconciled={() => setExpenses(db.getTable<Expense>('expenses').filter((e) => !e.deleted_at && !(e as any).deletedAt))}
      />
    </div>
  );
};
