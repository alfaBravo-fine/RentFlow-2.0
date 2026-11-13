import React, { useState } from 'react';
import { db } from '../../db/client';
import { Owner, Property, Unit, Lease, Invoice, Expense, Organization } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney, parseMajorToMinor } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { usePrint } from '../../components/print/PrintContext';
import { OwnerStatementPrintable } from '../../components/print/OwnerStatementPrintable';
import { OwnerStatementModal } from './OwnerStatementModal';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { DestructiveConfirmationModal } from '../../components/ui/DestructiveConfirmationModal';
import {
  Users,
  Plus,
  Building2,
  Receipt,
  Printer,
  FileSpreadsheet,
  Banknote,
  Percent,
  Mail,
  Phone,
  Pencil,
  Trash2,
  Calendar,
  CheckCircle2,
} from '../../components/icons';

export const OwnersView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();
  const { printReport } = usePrint();

  const [owners, setOwners] = useState<Owner[]>(() =>
    db.getTable<Owner>('owners').filter((o) => !o.deleted_at && !(o as any).deletedAt)
  );
  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt);
  const units = db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt);
  const leases = db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt);
  const invoices = db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt);
  const expenses = db.getTable<Expense>('expenses').filter((e) => !e.deleted_at && !(e as any).deletedAt);
  const org = db.getTable<Organization>('organizations').filter((o) => !o.deleted_at && !(o as any).deletedAt)[0] || { name: 'Horizon Property Management' };

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [deletingOwner, setDeletingOwner] = useState<Owner | null>(null);
  const [statementOwner, setStatementOwner] = useState<Owner | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [payoutDetails, setPayoutDetails] = useState('');
  const [commissionType, setCommissionType] = useState<'percentage' | 'flat'>('percentage');
  const [commissionValue, setCommissionValue] = useState('8');

  // Statement period
  const [statementMonth, setStatementMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const handleOpenAdd = () => {
    setEditingOwner(null);
    setName('');
    setEmail('');
    setPhone('');
    setPayoutDetails('Direct ACH Transfer / IBAN');
    setCommissionType('percentage');
    setCommissionValue('8');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (o: Owner) => {
    setEditingOwner(o);
    setName(o.name);
    setEmail(o.email || '');
    setPhone(o.phone || '');
    setPayoutDetails(o.payout_details || '');
    setCommissionType(o.commission_type);
    setCommissionValue(String(o.commission_value));
    setIsModalOpen(true);
  };

  const handleSaveOwner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast({ type: 'error', message: 'Owner name is required!' });
      return;
    }

    const commVal = parseFloat(commissionValue) || 8;

    if (editingOwner) {
      db.updateItem<Owner>('owners', editingOwner.id, {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        payout_details: payoutDetails.trim() || null,
        commission_type: commissionType,
        commission_value: commVal,
      });
      showToast({ type: 'success', message: `Owner "${name}" updated` });
    } else {
      db.insertItem<Owner>('owners', {
        id: generateUUID(),
        org_id: 'org_demo_1',
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        payout_details: payoutDetails.trim() || null,
        commission_type: commissionType,
        commission_value: commVal,
      });
      showToast({ type: 'success', message: `Owner profile "${name}" registered` });
    }

    setOwners(db.getTable<Owner>('owners').filter((o) => !o.deleted_at && !(o as any).deletedAt));
    setIsModalOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!deletingOwner) return;
    const o = deletingOwner;
    db.softDeleteItem<Owner>('owners', o.id);
    setOwners(db.getTable<Owner>('owners').filter((item) => !item.deleted_at && !(item as any).deletedAt));
    setDeletingOwner(null);
    showToast({
      type: 'info',
      message: `Owner "${o.name}" archived`,
      onUndo: () => {
        db.updateItem<Owner>('owners', o.id, { deleted_at: null });
        setOwners(db.getTable<Owner>('owners').filter((item) => !item.deleted_at && !(item as any).deletedAt));
        showToast({ type: 'success', message: `Restored owner "${o.name}"` });
      },
    });
  };

  // Helper to calculate financials for an owner
  const calculateOwnerFinancials = (ownerId: string) => {
    const ownerProps = properties.filter((p) => p.owner_id === ownerId);
    const ownerPropIds = ownerProps.map((p) => p.id);
    const ownerUnits = units.filter((u) => ownerPropIds.includes(u.property_id));
    const ownerUnitIds = ownerUnits.map((u) => u.id);
    const ownerLeases = leases.filter((l) => ownerUnitIds.includes(l.unit_id));
    const ownerLeaseIds = ownerLeases.map((l) => l.id);

    // Filter invoices by lease
    const ownerInvoices = invoices.filter((i) => ownerLeaseIds.includes(i.lease_id));
    const rentCollectedMinor = ownerInvoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + i.amount_paid_minor, 0);

    // Filter expenses on owner properties
    const ownerExpenses = expenses.filter((e) => e.property_id && ownerPropIds.includes(e.property_id));
    const totalExpensesMinor = ownerExpenses.reduce((sum, e) => sum + e.amount_minor, 0);

    // Calculate commission
    const owner = owners.find((o) => o.id === ownerId);
    let commissionMinor = 0;
    if (owner) {
      if (owner.commission_type === 'percentage') {
        commissionMinor = Math.round((rentCollectedMinor * owner.commission_value) / 100);
      } else {
        commissionMinor = parseMajorToMinor(owner.commission_value, pack);
      }
    }

    const netPayoutMinor = Math.max(0, rentCollectedMinor - commissionMinor - totalExpensesMinor);

    return {
      ownerProps,
      ownerUnits,
      rentCollectedMinor,
      commissionMinor,
      totalExpensesMinor,
      netPayoutMinor,
    };
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Owner & Agency Statements
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Property ownership portfolios &bull; Commission accounting &bull; Monthly net disbursement statements ({pack.name})
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          <span>Add Property Owner</span>
        </Button>
      </div>

      {/* Owner Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {owners.length === 0 ? (
          <div className="col-span-full p-12 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)]">
            <Users className="w-8 h-8 mx-auto mb-2 text-[var(--text-secondary)] opacity-50" />
            <span>No property owners registered yet.</span>
          </div>
        ) : (
          owners.map((owner) => {
            const {
              ownerProps,
              ownerUnits,
              rentCollectedMinor,
              commissionMinor,
              totalExpensesMinor,
              netPayoutMinor,
            } = calculateOwnerFinancials(owner.id);

            return (
              <Card key={owner.id} className="space-y-4 relative group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0 font-bold text-sm">
                      {owner.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight truncate">
                        {owner.name}
                      </h3>
                      <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                        {ownerProps.length} Properties &bull; {ownerUnits.length} Units
                      </span>
                    </div>
                  </div>
                  <Badge variant="accent" className="shrink-0">
                    {owner.commission_value}
                    {owner.commission_type === 'percentage' ? '%' : pack.currency.symbol} Comm
                  </Badge>
                </div>

                {/* Financial Summary */}
                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Rent Collected</span>
                    <span className="font-mono font-semibold text-emerald-600 tabular-nums">
                      {formatMoney(rentCollectedMinor, pack)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Agency Commission</span>
                    <span className="font-mono text-[var(--text-primary)] tabular-nums">
                      -{formatMoney(commissionMinor, pack)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Operating Expenses</span>
                    <span className="font-mono text-rose-600 tabular-nums">
                      -{formatMoney(totalExpensesMinor, pack)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] font-bold">
                    <span className="text-[var(--text-primary)]">Net Owner Payout</span>
                    <span className="font-mono text-sm text-[var(--accent)] tabular-nums">
                      {formatMoney(netPayoutMinor, pack)}
                    </span>
                  </div>
                </div>

                {/* Contact & Payout Details */}
                <div className="text-xs text-[var(--text-secondary)] space-y-1">
                  {owner.email && (
                    <p className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                      <span className="truncate">{owner.email}</span>
                    </p>
                  )}
                  {owner.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                      <span>{owner.phone}</span>
                    </p>
                  )}
                </div>

                {/* Footer action buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatementOwner(owner)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Statement</span>
                  </Button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(owner)}
                      className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingOwner(owner)}
                      className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                      title="Archive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal: Create / Edit Owner */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingOwner ? 'Edit Property Owner Profile' : 'Register Property Owner'}
        description="Configure ownership portfolio and property management commission terms."
        maxWidth="md"
      >
        <form onSubmit={handleSaveOwner} className="space-y-4">
          <Input
            label="Owner / Investor Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Apex Real Estate Holdings LLC"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="payouts@apexholdings.com"
            />
            <Input
              label="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555-0192"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Commission Structure"
              value={commissionType}
              onChange={(e) => setCommissionType(e.target.value as any)}
            >
              <option value="percentage">Percentage of Rent Collected (%)</option>
              <option value="flat">Flat Monthly Retainer Fee</option>
            </Select>

            <Input
              label={commissionType === 'percentage' ? 'Commission Rate (%) *' : `Flat Fee (${pack.currency.code}) *`}
              type="number"
              step="any"
              value={commissionValue}
              onChange={(e) => setCommissionValue(e.target.value)}
              required
            />
          </div>

          <Input
            label="Bank Payout Details"
            value={payoutDetails}
            onChange={(e) => setPayoutDetails(e.target.value)}
            placeholder="e.g. Chase Bank Checking #4829, Routing #021000021"
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingOwner ? 'Save Changes' : 'Register Owner'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Redesigned Owner Disbursement Statement */}
      {statementOwner && (() => {
        const financials = calculateOwnerFinancials(statementOwner.id);
        return (
          <OwnerStatementModal
            isOpen={!!statementOwner}
            onClose={() => setStatementOwner(null)}
            orgName={org.name}
            owner={statementOwner}
            statementMonth={statementMonth}
            onChangeStatementMonth={setStatementMonth}
            ownerProps={financials.ownerProps}
            rentCollectedMinor={financials.rentCollectedMinor}
            commissionMinor={financials.commissionMinor}
            totalExpensesMinor={financials.totalExpensesMinor}
            netPayoutMinor={financials.netPayoutMinor}
            pack={pack}
            onPrintStatement={() => {
              printReport(
                <OwnerStatementPrintable
                  orgName={org.name}
                  statementOwner={statementOwner}
                  statementMonth={statementMonth}
                  ownerProps={financials.ownerProps}
                  rentCollectedMinor={financials.rentCollectedMinor}
                  commissionMinor={financials.commissionMinor}
                  totalExpensesMinor={financials.totalExpensesMinor}
                  netPayoutMinor={financials.netPayoutMinor}
                  pack={pack}
                />
              );
            }}
          />
        );
      })()}

      {/* Destructive Action Confirmation */}
      <DestructiveConfirmationModal
        isOpen={!!deletingOwner}
        onClose={() => setDeletingOwner(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Owner Profile"
        itemName={deletingOwner?.name || ''}
        itemType="Owner"
        warningDetails="Assigned properties will remain active in the system."
      />
    </div>
  );
};
