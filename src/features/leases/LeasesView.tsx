import React, { useState, useEffect } from 'react';
import { db, parseDepositDeductions } from '../../db/client';
import { Lease, Tenant, Unit, Deposit, DepositDeduction, Property } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney, parseMajorToMinor, minorToMajorNumber } from '../../lib/money';
import { accrueDepositInterest } from '../../lib/interest';
import { formatLeaseName } from '../../lib/formatNames';
import { generateUUID } from '../../lib/uuid';
import { generateFirstInvoice } from '../../lib/invoicing';
import { useToast } from '../../components/toast/ToastContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  FileText,
  Plus,
  ShieldCheck,
  Clock,
  AlertCircle,
  Wallet,
  Pencil,
  Trash2,
  Calendar,
  CheckCircle2,
  MoreVertical,
  LayoutGrid,
  List,
  Building2,
  Users,
  FileCheck,
  Eye,
} from '../../components/icons';
import { LeaseChecklistModal } from './LeaseChecklistModal';

export const LeasesView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const [leases, setLeases] = useState<Lease[]>(() =>
    db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt)
  );
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt);
  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt);
  const [units, setUnits] = useState<Unit[]>(() =>
    db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt)
  );
  const validUnits = units.filter(
    (u) => !u.deleted_at && !(u as any).deletedAt && properties.some((p) => p.id === u.property_id)
  );
  const vacantUnits = validUnits.filter((u) => u.status === 'vacant');
  const [deposits, setDeposits] = useState<Deposit[]>(() =>
    db.getTable<Deposit>('deposits').filter((d) => !d.deleted_at && !(d as any).deletedAt)
  );
  const [depositDeductions, setDepositDeductions] = useState<DepositDeduction[]>(() =>
    db.getTable<DepositDeduction>('deposit_deductions').filter((dd) => !dd.deleted_at && !(dd as any).deletedAt)
  );

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLease, setEditingLease] = useState<Lease | null>(null);
  const [checklistLease, setChecklistLease] = useState<Lease | null>(null);
  const [detailsLeaseId, setDetailsLeaseId] = useState<string | null>(null);

  const selectableUnits = editingLease
    ? validUnits.filter((u) => u.status === 'vacant' || u.id === editingLease.unit_id)
    : vacantUnits;

  // Form states
  const [unitId, setUnitId] = useState(vacantUnits[0]?.id || '');
  const [tenantId, setTenantId] = useState(tenants[0]?.id || '');
  const [startDate, setStartDate] = useState('2026-11-01');
  const [endDate, setEndDate] = useState('2027-10-31');
  const [rentAmount, setRentAmount] = useState('1850');
  const [depositAmount, setDepositAmount] = useState('1850');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'quarterly' | 'bi-annual' | 'annual'>('monthly');
  const [dueDay, setDueDay] = useState(String(pack.billingDueDayDefault || 1));
  const [leaseStatus, setLeaseStatus] = useState<'active' | 'expiring' | 'expired' | 'terminated'>('active');

  // Feature 2.2: Multi-item Security Deposit Deduction Ledger
  const [isDeductionModalOpen, setIsDeductionModalOpen] = useState(false);
  const [deductionLeaseId, setDeductionLeaseId] = useState<string | null>(null);
  const [deductionItems, setDeductionItems] = useState<Array<{ id: string; reason: string; amount: string }>>([
    { id: generateUUID(), reason: '', amount: '' },
  ]);
  const [receiptAttachmentNote, setReceiptAttachmentNote] = useState('');

  // Delete confirmation modal
  const [deletingLease, setDeletingLease] = useState<Lease | null>(null);

  // Close active dropdown menu on outside click
  useEffect(() => {
    const handleOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  // Subscribe to reactive DB writes so Leases, Units & Deposits stay synchronized
  useEffect(() => {
    const unsub = db.onWrite(() => {
      setLeases(db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt));
      setUnits(db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt));
      setDeposits(db.getTable<Deposit>('deposits').filter((d) => !d.deleted_at && !(d as any).deletedAt));
      setDepositDeductions(
        db.getTable<DepositDeduction>('deposit_deductions').filter((dd) => !dd.deleted_at && !(dd as any).deletedAt)
      );
    });
    return unsub;
  }, []);

  const handleOpenAdd = () => {
    setEditingLease(null);
    const firstVacant = vacantUnits[0];
    setUnitId(firstVacant?.id || '');
    setTenantId(tenants[0]?.id || '');
    setStartDate(new Date().toISOString().split('T')[0]);
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setEndDate(nextYear.toISOString().split('T')[0]);
    setRentAmount(firstVacant ? String(minorToMajorNumber(firstVacant.rent_minor, pack)) : '1850');
    setDepositAmount(firstVacant ? String(minorToMajorNumber(firstVacant.rent_minor, pack)) : '1850');
    setBillingCycle('monthly');
    setDueDay(String(pack.billingDueDayDefault || 1));
    setLeaseStatus('active');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (l: Lease) => {
    setEditingLease(l);
    setUnitId(l.unit_id);
    setTenantId(l.tenant_id);
    setStartDate(l.start_date);
    setEndDate(l.end_date);
    setRentAmount(String(minorToMajorNumber(l.rent_minor, l.currency_code || pack)));
    setDepositAmount(String(minorToMajorNumber(l.deposit_minor, l.currency_code || pack)));
    setBillingCycle(l.billing_cycle);
    setDueDay(String(l.due_day));
    setLeaseStatus(l.status as any);
    setIsModalOpen(true);
  };

  const handleUnitChange = (selectedId: string) => {
    setUnitId(selectedId);
    const u = validUnits.find((item) => item.id === selectedId);
    if (u && !editingLease) {
      setRentAmount(String(minorToMajorNumber(u.rent_minor, u.currency_code || pack)));
      setDepositAmount(String(minorToMajorNumber(u.rent_minor, u.currency_code || pack)));
    }
  };

  const handleSaveLease = (e: React.FormEvent) => {
    e.preventDefault();

    if (!unitId || !tenantId) {
      showToast({ type: 'error', message: 'Both Unit and Tenant must be selected!' });
      return;
    }
    if (!startDate || !endDate) {
      showToast({ type: 'error', message: 'Lease term dates are required!' });
      return;
    }

    const rentMinor = parseMajorToMinor(rentAmount, pack);
    const depMinor = parseMajorToMinor(depositAmount, pack);
    const dueDayVal = parseInt(dueDay) || 1;

    if (rentMinor <= 0) {
      showToast({ type: 'error', message: 'Rent amount must be greater than zero!' });
      return;
    }

    const selectedTenant = tenants.find((t) => t.id === tenantId);
    const selectedUnit = units.find((u) => u.id === unitId);
    const humanTitle = formatLeaseName(selectedTenant?.name, selectedUnit?.name);

    if (editingLease) {
      const prevUnitId = editingLease.unit_id;
      const updatedLease = db.updateItem<Lease>('leases', editingLease.id, {
        unit_id: unitId,
        tenant_id: tenantId,
        start_date: startDate,
        end_date: endDate,
        rent_minor: rentMinor,
        billing_cycle: billingCycle,
        due_day: dueDayVal,
        deposit_minor: depMinor,
        status: leaseStatus,
      });

      // Synchronize unit occupancy
      if (leaseStatus === 'active') {
        db.updateItem<Unit>('units', unitId, { status: 'occupied' });
        try {
          generateFirstInvoice(updatedLease);
        } catch (err) {
          console.error('generateFirstInvoice failed during lease update:', err);
        }
      } else {
        db.syncUnitOccupancy(unitId);
      }
      if (prevUnitId && prevUnitId !== unitId) {
        db.syncUnitOccupancy(prevUnitId);
      }

      showToast({ type: 'success', message: `Lease "${humanTitle}" updated` });
    } else {
      const leaseId = generateUUID();
      const savedLease = db.insertItem<Lease>('leases', {
        id: leaseId,
        unit_id: unitId,
        tenant_id: tenantId,
        start_date: startDate,
        end_date: endDate,
        rent_minor: rentMinor,
        currency_code: pack.currency.code,
        country_code_snapshot: pack.code,
        pack_version_snapshot: pack.version,
        billing_cycle: billingCycle,
        due_day: dueDayVal,
        deposit_minor: depMinor,
        late_fee_type: pack.lateFee.type === 'flat' ? 'flat' : 'percent',
        late_fee_value: pack.lateFee.maxValue || 5,
        grace_days: pack.lateFee.graceDaysDefault,
        status: leaseStatus,
      });

      // Automatically update linked unit status
      if (leaseStatus === 'active') {
        db.updateItem<Unit>('units', unitId, { status: 'occupied' });

        // Trigger First Invoice Generation immediately after the lease is saved
        try {
          generateFirstInvoice(savedLease);
        } catch (err) {
          console.error('generateFirstInvoice failed during lease creation:', err);
        }
      } else {
        db.syncUnitOccupancy(unitId);
      }

      if (depMinor > 0) {
        db.insertItem<Deposit>('deposits', {
          id: generateUUID(),
          lease_id: leaseId,
          amount_minor: depMinor,
          currency_code: pack.currency.code,
          received_at: startDate,
          status: 'held',
          interest_accrued_minor: 0,
          returned_minor: 0,
        });
      }
      showToast({ type: 'success', message: `New lease "${humanTitle}" created` });
    }

    db.notifyWrite();
    setLeases(db.getTable<Lease>('leases'));
    setDeposits(db.getTable<Deposit>('deposits'));
    setIsModalOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!deletingLease) return;
    const l = deletingLease;
    const tenant = tenants.find((t) => t.id === l.tenant_id);
    const unit = units.find((u) => u.id === l.unit_id);
    const humanTitle = formatLeaseName(tenant?.name, unit?.name, l.id);

    const success = db.softDeleteItem<Lease>('leases', l.id);
    if (success) {
      db.syncUnitOccupancy(l.unit_id);
      db.notifyWrite();
      setLeases(db.getTable<Lease>('leases'));
      setDeletingLease(null);
      showToast({
        type: 'info',
        message: `Lease "${humanTitle}" archived`,
        onUndo: () => {
          db.updateItem<Lease>('leases', l.id, { deleted_at: null });
          if (l.status === 'active') {
            db.updateItem<Unit>('units', l.unit_id, { status: 'occupied' });
          } else {
            db.syncUnitOccupancy(l.unit_id);
          }
          db.notifyWrite();
          setLeases(db.getTable<Lease>('leases'));
          showToast({ type: 'success', message: `Restored lease "${humanTitle}"` });
        },
      });
    }
  };

  const handleAddDeductionRow = () => {
    setDeductionItems((prev) => [
      ...prev,
      { id: generateUUID(), reason: '', amount: '0' },
    ]);
  };

  const handleRemoveDeductionRow = (id: string) => {
    setDeductionItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateDeductionRow = (id: string, field: 'reason' | 'amount', value: string) => {
    setDeductionItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleOpenDeductionModal = (leaseId: string) => {
    setDeductionLeaseId(leaseId);
    setDeductionItems([{ id: generateUUID(), reason: '', amount: '' }]);
    setReceiptAttachmentNote('');
    setIsDeductionModalOpen(true);
  };

  const getDepositLedgerForLease = (lease: Lease) => {
    const deposit = deposits.find((d) => d.lease_id === lease.id);
    const originalDepositMinor = deposit?.amount_minor ?? lease.deposit_minor ?? 0;

    const ledgerRows = deposit
      ? depositDeductions.filter(
          (dd) =>
            (dd.deposit_id === deposit.id || dd.lease_id === lease.id) &&
            !dd.deleted_at &&
            !(dd as any).deletedAt
        )
      : depositDeductions.filter(
          (dd) => dd.lease_id === lease.id && !dd.deleted_at && !(dd as any).deletedAt
        );

    const parsedJsonRows = parseDepositDeductions(deposit?.deductions_json);

    const historyItems =
      ledgerRows.length > 0
        ? ledgerRows
            .slice()
            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
            .map((row) => ({
              id: row.id,
              date: row.deducted_at
                ? new Date(row.deducted_at).toLocaleDateString(pack.locale || 'en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : new Date(row.created_at).toLocaleDateString(pack.locale || 'en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  }),
              reason: row.reason,
              notes: row.receipt_note || '',
              amountMinor: Number(row.amount_minor) || 0,
            }))
        : parsedJsonRows.map((row) => ({
            id: row.id || generateUUID(),
            date: row.date
              ? new Date(row.date).toLocaleDateString(pack.locale || 'en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : '—',
            reason: row.reason,
            notes: '',
            amountMinor: Number(row.amount_minor) || 0,
          }));

    const totalDeductionsMinor = historyItems.reduce((sum, item) => sum + item.amountMinor, 0);
    const remainingBalanceMinor = Math.max(0, originalDepositMinor - totalDeductionsMinor);

    const accruedInterestMinor = deposit
      ? accrueDepositInterest({
          principalMinor: remainingBalanceMinor,
          pack,
          from: deposit.received_at,
          to: new Date(),
        })
      : 0;

    return {
      deposit,
      originalDepositMinor,
      historyItems,
      totalDeductionsMinor,
      remainingBalanceMinor,
      accruedInterestMinor,
    };
  };

  const handleRecordDeduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deductionLeaseId) return;

    const validDeductions = deductionItems
      .filter((item) => item.reason.trim() && parseMajorToMinor(item.amount, pack) > 0)
      .map((item) => ({
        id: item.id || generateUUID(),
        reason: item.reason.trim(),
        amountMinor: parseMajorToMinor(item.amount, pack),
      }));

    if (validDeductions.length === 0) {
      showToast({
        type: 'error',
        message: 'Please enter a valid deduction reason and positive amount.',
      });
      return;
    }

    try {
      const result = db.recordDeduction(deductionLeaseId, validDeductions, receiptAttachmentNote);
      const totalNewMinor = result.deductions.reduce((sum, d) => sum + d.amount_minor, 0);

      setDeposits(db.getTable<Deposit>('deposits'));
      setDepositDeductions(db.getTable<DepositDeduction>('deposit_deductions'));
      setIsDeductionModalOpen(false);
      showToast({
        type: 'success',
        message: `Recorded ${formatMoney(totalNewMinor, pack)} deduction. Remaining deposit balance: ${formatMoney(result.remainingBalanceMinor, pack)}`,
      });
    } catch (err: any) {
      console.error('[Deposit Deduction Error]:', err);
      showToast({
        type: 'error',
        message: err?.message || 'Failed to record security deposit deduction.',
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Leases & Tenancy Contracts
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Contract ledger &bull; Country pack compliance &bull; Security deposit escrow ({pack.name})
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <Button variant="primary" onClick={handleOpenAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            <span>Create Lease</span>
          </Button>
        </div>
      </div>

      {/* Main Content: Grid or Table */}
      {leases.length === 0 ? (
        <Card className="p-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">No lease agreements yet</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
            Create your first tenancy agreement to link a tenant to a rental unit with automatic rent schedules.
          </p>
          <Button variant="primary" onClick={handleOpenAdd} className="mt-5 gap-2">
            <Plus className="w-4 h-4" />
            <span>Create Lease</span>
          </Button>
        </Card>
      ) : viewMode === 'grid' ? (
        /* Card Grid Layout (2-3 Columns) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {leases.map((lease) => {
            const tenant = tenants.find((t) => t.id === lease.tenant_id);
            const unit = units.find((u) => u.id === lease.unit_id);
            const property = properties.find((p) => p.id === unit?.property_id);
            const humanName = formatLeaseName(tenant?.name, unit?.name, lease.id);
            const ledger = getDepositLedgerForLease(lease);
            const totalDeductionsMinor = ledger.totalDeductionsMinor;
            const netDepositHeldMinor = ledger.remainingBalanceMinor;
            const accruedInterest = ledger.accruedInterestMinor;

            const statusVariant =
              lease.status === 'active'
                ? 'success'
                : lease.status === 'expiring'
                ? 'warning'
                : lease.status === 'expired'
                ? 'danger'
                : 'neutral';

            const isMenuOpen = activeMenuId === lease.id;

            return (
              <Card key={lease.id} className="flex flex-col justify-between relative group hover:border-[var(--accent)]/40 transition-colors">
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setDetailsLeaseId(lease.id)}
                      className="flex items-center gap-3 text-left min-w-0 group/title cursor-pointer"
                      title="Open Lease Details & Deduction History"
                    >
                      <div className="w-10 h-10 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[var(--text-primary)] group-hover/title:text-[var(--accent)] transition-colors tracking-tight line-clamp-1">
                          {humanName}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                          {property?.name} &bull; {unit?.name}
                        </p>
                      </div>
                    </button>

                    {/* Action Dropdown Menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : lease.id);
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                        title="Lease Actions"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 mt-1 w-48 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] modal-shadow py-1.5 z-30 animate-in fade-in zoom-in-95 duration-150"
                        >
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              setDetailsLeaseId(lease.id);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-[var(--accent)]" />
                            <span>Lease Details & Ledger</span>
                          </button>
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              handleOpenEdit(lease);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                            <span>Edit Contract</span>
                          </button>
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              setChecklistLease(lease);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2 cursor-pointer"
                          >
                            <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Move-In / Move-Out Checklist</span>
                          </button>
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              handleOpenDeductionModal(lease.id);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2 cursor-pointer"
                          >
                            <Wallet className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                            <span>Record Deduction</span>
                          </button>
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              setDeletingLease(lease);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs text-[var(--status-danger-fg)] hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Archive Lease</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status & Term Dates */}
                  <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
                    <Badge variant={statusVariant}>{lease.status.toUpperCase()}</Badge>
                    <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1 font-mono">
                      <Calendar className="w-3 h-3 text-[var(--text-subtle)]" />
                      <span>{lease.start_date} to {lease.end_date}</span>
                    </div>
                  </div>

                  {/* Financial Details */}
                  <div className="grid grid-cols-2 gap-3 py-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] block">
                        Monthly Rent
                      </span>
                      <div className="text-base font-bold number-tabular text-[var(--text-primary)]">
                        {formatMoney(lease.rent_minor, pack)}
                      </div>
                      <span className="text-[11px] text-[var(--text-secondary)] block">
                        Due Day {lease.due_day} &bull; {lease.billing_cycle}
                      </span>
                    </div>

                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] block">
                        Security Deposit
                      </span>
                      <div className="text-base font-bold number-tabular text-[var(--text-primary)]">
                        {formatMoney(netDepositHeldMinor, pack)}
                      </div>
                      <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                        {totalDeductionsMinor > 0
                          ? `-${formatMoney(totalDeductionsMinor, pack)} deducted`
                          : accruedInterest > 0
                          ? `+${formatMoney(accruedInterest, pack)} int.`
                          : 'Held in Escrow'}
                      </span>
                    </div>
                  </div>

                  {/* Deduction History Preview inside Card */}
                  {ledger.historyItems.length > 0 && (
                      <div className="mb-3 p-2.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                            Deduction History ({ledger.historyItems.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => setDetailsLeaseId(lease.id)}
                            className="text-[11px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                          >
                            View Full Ledger
                          </button>
                        </div>
                        <div className="divide-y divide-[var(--border-subtle)]">
                          {ledger.historyItems.slice(0, 2).map((item) => (
                            <div
                              key={item.id}
                              className="py-1 flex items-center justify-between gap-2 text-[11px] min-w-0"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="text-[var(--text-primary)] font-medium truncate block">
                                  {item.reason}
                                </span>
                                <span className="text-[10px] text-[var(--text-subtle)]">{item.date}</span>
                              </div>
                              <span className="font-mono font-semibold text-rose-600 shrink-0">
                                -{formatMoney(item.amountMinor, pack)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                  )}
                </div>

                {/* Footer Info */}
                <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span className="truncate">
                    Tenant: <strong className="text-[var(--text-primary)]">{tenant?.name}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setDetailsLeaseId(lease.id)}
                    className="font-semibold text-[var(--accent)] hover:underline shrink-0 cursor-pointer"
                  >
                    Lease Details &rarr;
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Modern 56px Row Height Table View */
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  <th className="py-3.5 px-6">Lease / Tenant</th>
                  <th className="py-3.5 px-6">Premises</th>
                  <th className="py-3.5 px-6">Term Period</th>
                  <th className="py-3.5 px-6 text-right">Rent</th>
                  <th className="py-3.5 px-6 text-right">Deposit</th>
                  <th className="py-3.5 px-6 text-center">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                {leases.map((lease) => {
                  const tenant = tenants.find((t) => t.id === lease.tenant_id);
                  const unit = units.find((u) => u.id === lease.unit_id);
                  const property = properties.find((p) => p.id === unit?.property_id);

                  const statusVariant =
                    lease.status === 'active'
                      ? 'success'
                      : lease.status === 'expiring'
                      ? 'warning'
                      : lease.status === 'expired'
                      ? 'danger'
                      : 'neutral';

                  return (
                    <tr key={lease.id} className="h-14 hover:bg-[var(--bg-base)] transition-colors">
                      <td className="py-3 px-6">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {tenant?.name || 'Unnamed Tenant'}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] font-mono">{tenant?.phone}</div>
                      </td>
                      <td className="py-3 px-6">
                        <div className="font-medium text-[var(--text-primary)]">{unit?.name}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{property?.name}</div>
                      </td>
                      <td className="py-3 px-6 text-xs text-[var(--text-secondary)] font-mono">
                        {lease.start_date} &rarr; {lease.end_date}
                      </td>
                      <td className="py-3 px-6 text-right font-bold number-tabular text-[var(--text-primary)]">
                        {formatMoney(lease.rent_minor, pack)}
                      </td>
                      <td className="py-3 px-6 text-right font-medium number-tabular text-[var(--text-secondary)]">
                        {(() => {
                          const ledger = getDepositLedgerForLease(lease);
                          return (
                            <div>
                              <div className="text-[var(--text-primary)] font-semibold">
                                {formatMoney(ledger.remainingBalanceMinor, pack)}
                              </div>
                              {ledger.totalDeductionsMinor > 0 && (
                                <div className="text-[10px] text-rose-600 font-mono">
                                  -{formatMoney(ledger.totalDeductionsMinor, pack)} deducted
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-6 text-center">
                        <Badge variant={statusVariant}>{lease.status.toUpperCase()}</Badge>
                      </td>
                      <td className="py-3 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailsLeaseId(lease.id)}
                            className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors cursor-pointer"
                            title="Lease Details & Deduction History"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setChecklistLease(lease)}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer"
                            title="Move-In / Move-Out Inspection Checklist"
                          >
                            <FileCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenDeductionModal(lease.id)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-sunken)] transition-colors cursor-pointer"
                            title="Record Security Deposit Deduction"
                          >
                            <Wallet className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(lease)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-sunken)] transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingLease(lease)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-surface-sunken)] transition-colors cursor-pointer"
                            title="Archive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal: Create / Edit Lease with Clear Dropdown Selectors */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingLease ? 'Edit Tenancy Agreement' : 'Create New Tenancy Lease'}
        description="Select the property unit and tenant to attach an enforceable rental schedule."
        maxWidth="xl"
      >
        <form onSubmit={handleSaveLease} className="space-y-5">
          {/* Section 1: Clear Dropdown Selectors */}
          <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              1. Premises & Resident Assignment
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Rental Unit *"
                value={unitId}
                onChange={(e) => handleUnitChange(e.target.value)}
                required
              >
                {selectableUnits.length === 0 ? (
                  <option value="">No vacant units available</option>
                ) : (
                  selectableUnits.map((u) => {
                    const prop = properties.find((p) => p.id === u.property_id);
                    return (
                      <option key={u.id} value={u.id}>
                        {prop?.name} &bull; {u.name} ({formatMoney(u.rent_minor, pack)}/mo)
                      </option>
                    );
                  })
                )}
              </Select>

              <Select
                label="Assigned Tenant *"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                required
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.phone})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Section 2: Term Dates */}
          <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              2. Contract Duration
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Lease Start Date *"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              >
              </Input>
              <Input
                label="Lease End Date *"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              >
              </Input>
            </div>
          </div>

          {/* Section 3: Financial Terms */}
          <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              3. Rent & Escrow ({pack.currency.code})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={`Monthly Rent (${pack.currency.code}) *`}
                type="number"
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
                required
              />
              <Input
                label={`Security Deposit (${pack.currency.code}) *`}
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                label="Billing Cycle"
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as any)}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="bi-annual">Bi-Annual</option>
                <option value="annual">Annual</option>
              </Select>

              <Input
                label="Due Day (1-28)"
                type="number"
                min="1"
                max="28"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />

              <Select
                label="Status"
                value={leaseStatus}
                onChange={(e) => setLeaseStatus(e.target.value as any)}
              >
                <option value="active">Active</option>
                <option value="expiring">Expiring Soon</option>
                <option value="expired">Expired</option>
                <option value="terminated">Terminated</option>
              </Select>
            </div>
          </div>

          {/* Sticky Modal Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingLease ? 'Save Lease Changes' : 'Create Lease Agreement'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation */}
      <Modal
        isOpen={!!deletingLease}
        onClose={() => setDeletingLease(null)}
        title="Archive Lease Agreement?"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Are you sure you want to archive this contract? The record will be soft-deleted and can be restored using the Undo action.
          </p>
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="outline" onClick={() => setDeletingLease(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Confirm Archive
            </Button>
          </div>
        </div>
      </Modal>

      {/* Feature 2.2: Multi-Item Security Deposit Deduction Ledger Modal */}
      <Modal
        isOpen={isDeductionModalOpen}
        onClose={() => setIsDeductionModalOpen(false)}
        title="Security Deposit Deduction & Settlement Ledger"
        description="Itemize damage, cleaning, or unpaid repair deductions and calculate net tenant refund."
        maxWidth="lg"
      >
        {(() => {
          const targetLease = leases.find((l) => l.id === deductionLeaseId);
          const deposit = deposits.find((d) => d.lease_id === deductionLeaseId);
          const originalDepositMinor = deposit?.amount_minor ?? targetLease?.deposit_minor ?? 0;

          const existingLedgerRows = deposit
            ? depositDeductions.filter((dd) => dd.deposit_id === deposit.id && !dd.deleted_at)
            : [];
          const existingJsonRows = parseDepositDeductions(deposit?.deductions_json);
          const alreadyDeductedMinor =
            existingLedgerRows.length > 0
              ? existingLedgerRows.reduce((sum, item) => sum + (Number(item.amount_minor) || 0), 0)
              : existingJsonRows.reduce((sum, item) => sum + (Number(item.amount_minor) || 0), 0);

          const remainingBeforeMinor = Math.max(0, originalDepositMinor - alreadyDeductedMinor);
          const newDeductionsMinor = deductionItems.reduce(
            (sum, item) => sum + parseMajorToMinor(item.amount, pack),
            0
          );
          const exceedsBalance = newDeductionsMinor > remainingBeforeMinor;
          const remainingAfterMinor = Math.max(0, remainingBeforeMinor - newDeductionsMinor);

          return (
            <form onSubmit={handleRecordDeduction} className="w-full max-w-full min-w-0 space-y-4">
              {/* Escrow Balance Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-center min-w-0">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block truncate">
                    Remaining Deposit
                  </span>
                  <p className="text-sm sm:text-base font-bold font-mono text-[var(--text-primary)] break-words">
                    {formatMoney(remainingBeforeMinor, pack)}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-rose-600 block truncate">
                    New Deductions
                  </span>
                  <p className="text-sm sm:text-base font-bold font-mono text-rose-600 break-words">
                    -{formatMoney(newDeductionsMinor, pack)}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 block truncate">
                    Net Balance After
                  </span>
                  <p className="text-sm sm:text-base font-bold font-mono text-emerald-600 break-words">
                    {formatMoney(remainingAfterMinor, pack)}
                  </p>
                </div>
              </div>

              {exceedsBalance && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">
                    Deduction total ({formatMoney(newDeductionsMinor, pack)}) cannot exceed the remaining deposit balance ({formatMoney(remainingBeforeMinor, pack)}).
                  </span>
                </div>
              )}

              {/* Deduction Line Items */}
              <div className="space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <label className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider truncate">
                    Itemized Deductions
                  </label>
                  <button
                    type="button"
                    onClick={handleAddDeductionRow}
                    className="text-xs text-[var(--accent)] hover:underline font-medium cursor-pointer shrink-0"
                  >
                    + Add Deduction Line
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 min-w-0">
                  {deductionItems.map((item, idx) => (
                    <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 w-full">
                      <input
                        type="text"
                        value={item.reason}
                        onChange={(e) => handleUpdateDeductionRow(item.id, 'reason', e.target.value)}
                        placeholder={`Reason #${idx + 1} (e.g. wall patching, lost key replacement)`}
                        className="w-full max-w-full flex-1 min-w-0 h-9 px-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        required
                      />
                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 min-w-0">
                        <div className="w-full sm:w-28 min-w-0 relative">
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            value={item.amount}
                            onChange={(e) => handleUpdateDeductionRow(item.id, 'amount', e.target.value)}
                            placeholder="Amount"
                            className="w-full max-w-full h-9 px-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-mono text-right focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                            required
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDeductionRow(item.id)}
                          disabled={deductionItems.length <= 1}
                          className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[var(--text-subtle)] hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 cursor-pointer"
                          title="Remove row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attachment Notes */}
              <div className="min-w-0">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Receipts & Evidence Notes
                </label>
                <textarea
                  rows={2}
                  value={receiptAttachmentNote}
                  onChange={(e) => setReceiptAttachmentNote(e.target.value)}
                  placeholder="Receipts attached from Handyman Invoice #2041, photos saved in Document Vault..."
                  className="w-full max-w-full min-w-0 p-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)] min-w-0">
                <span className="text-xs text-[var(--text-secondary)] min-w-0 break-words">
                  Remaining balance of <strong>{formatMoney(remainingAfterMinor, pack)}</strong> will remain refundable.
                </span>
                <div className="flex items-center justify-end gap-2 shrink-0">
                  <Button type="button" variant="outline" onClick={() => setIsDeductionModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={exceedsBalance || remainingBeforeMinor <= 0}>
                    Record Deduction
                  </Button>
                </div>
              </div>

              {/* Existing Deduction History inside Record Deduction Modal */}
              {targetLease && (() => {
                const ledger = getDepositLedgerForLease(targetLease);
                if (ledger.historyItems.length === 0) return null;
                return (
                  <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2 min-w-0">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      Previous Deduction History
                    </h4>
                    <div className="rounded-xl border border-[var(--border-subtle)] overflow-x-auto max-h-36">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[var(--bg-base)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                          <tr>
                            <th className="py-2 px-3 font-semibold">Date</th>
                            <th className="py-2 px-3 font-semibold">Reason / Notes</th>
                            <th className="py-2 px-3 font-semibold text-right">Amount Deducted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {ledger.historyItems.map((h) => (
                            <tr key={h.id}>
                              <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)]">{h.date}</td>
                              <td className="py-2 px-3 min-w-0 break-words text-[var(--text-primary)]">
                                <div>{h.reason}</div>
                                {h.notes && <div className="text-[11px] text-[var(--text-subtle)]">{h.notes}</div>}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap text-right font-mono font-semibold text-rose-600">
                                -{formatMoney(h.amountMinor, pack)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </form>
          );
        })()}
      </Modal>

      {/* Lease Details & Security Deposit Deduction History Ledger Modal */}
      <Modal
        isOpen={!!detailsLeaseId}
        onClose={() => setDetailsLeaseId(null)}
        title="Lease Details & Security Deposit Ledger"
        description="Complete tenancy summary, escrow balance, and running deposit deduction history."
        maxWidth="2xl"
      >
        {(() => {
          const lease = leases.find((l) => l.id === detailsLeaseId);
          if (!lease) return null;
          const tenant = tenants.find((t) => t.id === lease.tenant_id);
          const unit = units.find((u) => u.id === lease.unit_id);
          const property = properties.find((p) => p.id === unit?.property_id);
          const ledger = getDepositLedgerForLease(lease);

          return (
            <div className="space-y-6 min-w-0 w-full max-w-full">
              {/* Lease Overview */}
              <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)] block">
                    Tenant &amp; Unit
                  </span>
                  <div className="text-sm font-bold text-[var(--text-primary)] truncate mt-0.5">
                    {tenant?.name || 'Unnamed Tenant'}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] truncate">
                    {property?.name} &bull; {unit?.name}
                  </div>
                </div>
                <div className="min-w-0 sm:text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)] block">
                    Term &amp; Monthly Rent
                  </span>
                  <div className="text-sm font-bold text-[var(--text-primary)] font-mono mt-0.5">
                    {formatMoney(lease.rent_minor, pack)} / {lease.billing_cycle}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] font-mono">
                    {lease.start_date} to {lease.end_date}
                  </div>
                </div>
              </div>

              {/* Security Deposit Section */}
              <div className="space-y-4 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Security Deposit</span>
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Escrow balance and itemized deduction ledger
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    className="gap-1.5"
                    onClick={() => handleOpenDeductionModal(lease.id)}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Record Deduction</span>
                  </Button>
                </div>

                {/* Deposit Balance Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-center min-w-0">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block truncate">
                      Original Deposit
                    </span>
                    <p className="text-sm sm:text-base font-bold font-mono text-[var(--text-primary)] break-words">
                      {formatMoney(ledger.originalDepositMinor, pack)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-rose-600 block truncate">
                      Total Deducted
                    </span>
                    <p className="text-sm sm:text-base font-bold font-mono text-rose-600 break-words">
                      -{formatMoney(ledger.totalDeductionsMinor, pack)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block truncate">
                      Remaining Balance
                    </span>
                    <p className="text-sm sm:text-base font-bold font-mono text-emerald-600 break-words">
                      {formatMoney(ledger.remainingBalanceMinor, pack)}
                    </p>
                  </div>
                </div>

                {/* Deduction History Table */}
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      Deduction History
                    </h4>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {ledger.historyItems.length} record{ledger.historyItems.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {ledger.historyItems.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-[var(--border-strong)] text-center text-xs text-[var(--text-secondary)]">
                      No deductions recorded for this tenant&apos;s security deposit yet.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--border-subtle)] overflow-x-auto bg-[var(--bg-surface)]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[var(--bg-base)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase tracking-wider">
                            <th className="py-2.5 px-4 font-semibold">Date</th>
                            <th className="py-2.5 px-4 font-semibold">Reason / Notes</th>
                            <th className="py-2.5 px-4 font-semibold text-right">Amount Deducted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {ledger.historyItems.map((row) => (
                            <tr key={row.id} className="hover:bg-[var(--bg-base)]/60">
                              <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[var(--text-secondary)]">
                                {row.date}
                              </td>
                              <td className="py-2.5 px-4 min-w-0 break-words text-[var(--text-primary)]">
                                <div className="font-medium">{row.reason}</div>
                                {row.notes && (
                                  <div className="text-[11px] text-[var(--text-subtle)] mt-0.5">
                                    {row.notes}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-4 whitespace-nowrap text-right font-mono font-bold text-rose-600">
                                -{formatMoney(row.amountMinor, pack)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-[var(--border-subtle)]">
                <Button type="button" variant="outline" onClick={() => setDetailsLeaseId(null)}>
                  Close
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Move-In / Move-Out Inspection Checklist Modal */}
      <LeaseChecklistModal
        isOpen={!!checklistLease}
        onClose={() => setChecklistLease(null)}
        lease={checklistLease}
        tenant={tenants.find((t) => t.id === checklistLease?.tenant_id)}
        unit={units.find((u) => u.id === checklistLease?.unit_id)}
      />
    </div>
  );
};
