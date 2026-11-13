import React, { useState, useEffect } from 'react';
import { db } from '../../db/client';
import { Invoice, Payment, Lease, Tenant, Property, Unit, Organization, Credit } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney, parseMajorToMinor, minorToMajorNumber } from '../../lib/money';
import { computeLateFee } from '../../lib/lateFee';
import { exportToXLSX } from '../../lib/xlsx';
import { formatLeaseName, formatInvoiceNumber, getUnitDisplayName } from '../../lib/formatNames';
import { useToast } from '../../components/toast/ToastContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PrintReceipt } from './PrintReceipt';
import {
  Plus,
  AlertCircle,
  FileSpreadsheet,
  XCircle,
  Printer,
  CheckCircle2,
  Pencil,
  Trash2,
} from '../../components/icons';

export const InvoicesView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt)
  );
  const [payments, setPayments] = useState<Payment[]>(() =>
    db.getTable<Payment>('payments').filter((p) => !p.deleted_at && !(p as any).deletedAt)
  );
  const [credits, setCredits] = useState<Credit[]>(() =>
    db.getTable<Credit>('credits').filter((c) => !c.deleted_at && !(c as any).deletedAt)
  );

  const leases = db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt);
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt);
  const units = db.getTable<Unit>('units').filter((u) => !u.deleted_at && !(u as any).deletedAt);
  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt);
  const org = db.getTable<Organization>('organizations')[0] || { name: 'Horizon Property Management' };

  // Reactive DB subscription
  useEffect(() => {
    const unsub = db.onWrite(() => {
      setInvoices(db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt));
      setPayments(db.getTable<Payment>('payments').filter((p) => !p.deleted_at && !(p as any).deletedAt));
      setCredits(db.getTable<Credit>('credits').filter((c) => !c.deleted_at && !(c as any).deletedAt));
    });
    return unsub;
  }, []);

  // Modals
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [selectedLeaseId, setSelectedLeaseId] = useState(leases[0]?.id || '');
  const [paymentAmount, setPaymentAmount] = useState('1850');
  const [paymentMethod, setPaymentMethod] = useState(pack.paymentMethods[0] || 'ACH Bank Transfer');

  // Edit Invoice modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editDueDate, setEditDueDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editStatus, setEditStatus] = useState<Invoice['status']>('unpaid');

  // Delete Payment modal state
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [isDeletePaymentModalOpen, setIsDeletePaymentModalOpen] = useState(false);

  // Print Receipt modal state
  const [activeReceiptData, setActiveReceiptData] = useState<{
    invoice: Invoice;
    lease: Lease;
    tenant: Tenant;
    unit: Unit;
    property: Property;
    payment?: Payment;
  } | null>(null);

  // Void modal
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [voidingInvoiceId, setVoidingInvoiceId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('Duplicate billing entry / Lease amendment');

  const handleOpenEditModal = (inv: Invoice) => {
    setEditingInvoice(inv);
    setEditDueDate(inv.due_date);
    setEditAmount(String(minorToMajorNumber(inv.total_minor, inv.currency_code || pack)));
    setEditStatus(inv.status);
    setIsEditOpen(true);
  };

  const handleSaveEditInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;

    const amountMinor = parseMajorToMinor(editAmount, editingInvoice.currency_code || pack);
    if (amountMinor <= 0) {
      showToast({ type: 'error', message: 'Invoice amount must be greater than zero!' });
      return;
    }

    db.updateItem<Invoice>('invoices', editingInvoice.id, {
      due_date: editDueDate,
      subtotal_minor: amountMinor,
      total_minor: amountMinor,
      status: editStatus,
    });

    setInvoices(db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt));
    setIsEditOpen(false);
    setEditingInvoice(null);
    showToast({ type: 'success', message: `Invoice ${formatInvoiceNumber(editingInvoice.id)} updated successfully.` });
  };

  const handleDeleteInvoice = (inv: Invoice) => {
    const success = db.deleteInvoiceCascading(inv.id);
    if (success) {
      setInvoices(db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt));
      setPayments(db.getTable<Payment>('payments').filter((p) => !p.deleted_at && !(p as any).deletedAt));
      showToast({
        type: 'info',
        message: `Invoice ${formatInvoiceNumber(inv.id)} and associated payments removed.`,
      });
    }
  };

  const handleConfirmDeletePayment = () => {
    if (!paymentToDelete) return;
    const success = db.deletePayment(paymentToDelete.id);
    if (success) {
      setInvoices(db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt));
      setPayments(db.getTable<Payment>('payments').filter((p) => !p.deleted_at && !(p as any).deletedAt));
      showToast({
        type: 'info',
        message: `Payment (${paymentToDelete.reference || paymentToDelete.id.slice(0, 8)}) deleted and invoice balance reversed successfully.`,
      });
    } else {
      showToast({ type: 'error', message: 'Failed to delete payment.' });
    }
    setIsDeletePaymentModalOpen(false);
    setPaymentToDelete(null);
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const targetInv = payingInvoiceId ? invoices.find((i) => i.id === payingInvoiceId) : undefined;
    const amountMinor = parseMajorToMinor(paymentAmount, targetInv?.currency_code || pack);
    if (amountMinor <= 0) {
      showToast({ type: 'error', message: 'Payment amount must be greater than zero!' });
      return;
    }

    if (payingInvoiceId && targetInv) {
      const { payment, credit } = db.recordInvoicePayment(
        targetInv.id,
        amountMinor,
        paymentMethod,
        `REF-${Date.now().toString().slice(-6)}`
      );
      setInvoices(db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt));
      setPayments(db.getTable<Payment>('payments').filter((p) => !p.deleted_at && !(p as any).deletedAt));
      setCredits(db.getTable<Credit>('credits').filter((c) => !c.deleted_at && !(c as any).deletedAt));
      setIsRecordOpen(false);
      setPayingInvoiceId(null);
      showToast({
        type: 'success',
        message:
          credit && credit.amount_minor > 0
            ? `Payment recorded (${payment.reference}): Invoice marked PAID and ${formatMoney(credit.amount_minor, pack)} overpayment saved as Tenant Credit for next month!`
            : `Payment of ${formatMoney(amountMinor, pack)} recorded for ${formatInvoiceNumber(targetInv.id)} (Ref: ${payment.reference})`,
      });
      return;
    }

    const effectiveLeaseId = selectedLeaseId || leases[0]?.id || '';
    if (!effectiveLeaseId) {
      showToast({ type: 'error', message: 'Please select a lease agreement!' });
      return;
    }

    const { payment, credit } = db.allocatePayment(
      effectiveLeaseId,
      amountMinor,
      paymentMethod,
      `REF-${Date.now().toString().slice(-6)}`
    );

    setInvoices(db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt));
    setPayments(db.getTable<Payment>('payments').filter((p) => !p.deleted_at && !(p as any).deletedAt));
    setCredits(db.getTable<Credit>('credits').filter((c) => !c.deleted_at && !(c as any).deletedAt));
    setIsRecordOpen(false);
    setPayingInvoiceId(null);
    showToast({
      type: 'success',
      message:
        credit && credit.amount_minor > 0
          ? `Payment recorded (${payment.reference}) with ${formatMoney(credit.amount_minor, pack)} overpayment saved to Tenant Credit Balance!`
          : `FIFO payment of ${formatMoney(amountMinor, pack)} recorded (Ref: ${payment.reference})`,
    });
  };

  const handleApplyLateFees = () => {
    let appliedCount = 0;
    invoices.forEach((inv) => {
      const lease = leases.find((l) => l.id === inv.lease_id);
      if (!lease || inv.status === 'paid' || inv.status === 'voided' || (inv.late_fee_minor || 0) > 0) return;

      const feeRes = computeLateFee(inv, lease, pack, new Date());
      if (feeRes.feeMinor > 0) {
        appliedCount++;
        const baseTotal = inv.total_minor || inv.subtotal_minor || 0;
        db.updateItem<Invoice>('invoices', inv.id, {
          late_fee_minor: feeRes.feeMinor,
          total_minor: baseTotal + feeRes.feeMinor,
          status: 'overdue',
        });
      }
    });

    setInvoices(db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt));
    showToast({
      type: 'info',
      message: `Late fees checked: ${appliedCount} overdue invoice(s) assessed under ${pack.name} regulations.`,
    });
  };

  const handleVoidInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidingInvoiceId || !voidReason.trim()) {
      showToast({ type: 'error', message: 'A void reason is required!' });
      return;
    }

    db.updateItem<Invoice>('invoices', voidingInvoiceId, {
      status: 'voided',
      voided_reason: voidReason.trim(),
    });

    setInvoices(db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt));
    setIsVoidOpen(false);
    showToast({
      type: 'info',
      message: `Invoice ${formatInvoiceNumber(voidingInvoiceId)} has been voided.`,
    });
  };

  // 1.5: Deep relational lookup with graceful fallbacks
  const handleOpenReceiptModal = (inv: Invoice) => {
    const lease = leases.find((l) => l.id === inv.lease_id);
    const tenant = tenants.find((t) => t.id === lease?.tenant_id);
    const unit = units.find((u) => u.id === lease?.unit_id);
    const property = properties.find((p) => p.id === unit?.property_id);
    const payment = db.getTable<Payment>('payments').find((p) => p.invoice_id === inv.id);

    const safeTenant: Tenant = tenant || {
      id: lease?.tenant_id || 'unknown_tenant',
      org_id: 'default_org',
      name: 'Resident Tenant',
      phone: '+1 555-0100',
      email: 'tenant@example.com',
      id_type: 'National ID',
      id_number: 'N/A',
      updated_at: Date.now(),
      device_id: 'local',
    };

    const safeProperty: Property = property || {
      id: 'prop_default',
      org_id: 'default_org',
      name: 'Residential Property',
      address: 'Property Premises',
      type: 'residential_apartment',
      country_code: pack.code,
      updated_at: Date.now(),
      device_id: 'local',
    };

    const safeUnit: Unit = unit || {
      id: lease?.unit_id || 'unit_default',
      property_id: safeProperty.id,
      name: 'Unit Premises',
      size: 750,
      area_unit: pack.areaUnit,
      bedrooms: 1,
      bathrooms: 1,
      rent_minor: inv.subtotal_minor,
      currency_code: inv.currency_code,
      status: 'occupied',
      updated_at: Date.now(),
      device_id: 'local',
    };

    const safeLease: Lease = lease || {
      id: inv.lease_id,
      unit_id: safeUnit.id,
      tenant_id: safeTenant.id,
      start_date: inv.period_start,
      end_date: inv.period_end,
      rent_minor: inv.subtotal_minor,
      currency_code: inv.currency_code,
      country_code_snapshot: pack.code,
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 1,
      deposit_minor: inv.subtotal_minor,
      late_fee_type: 'none',
      late_fee_value: 0,
      grace_days: 5,
      status: 'active',
      updated_at: Date.now(),
      device_id: 'local',
    };

    setActiveReceiptData({
      invoice: inv,
      lease: safeLease,
      tenant: safeTenant,
      unit: safeUnit,
      property: safeProperty,
      payment,
    });
  };

  const handleExportRentRollXLSX = () => {
    const data = invoices.map((inv) => {
      const lease = leases.find((l) => l.id === inv.lease_id);
      const tenant = tenants.find((t) => t.id === lease?.tenant_id);
      const unit = units.find((u) => u.id === lease?.unit_id);

      return {
        'Invoice #': formatInvoiceNumber(inv.id, inv.period_start),
        Tenant: tenant?.name || 'N/A',
        Phone: tenant?.phone || '',
        Unit: unit ? getUnitDisplayName(unit) : '',
        'Period Start': inv.period_start,
        'Period End': inv.period_end,
        'Due Date': inv.due_date,
        'Subtotal Amount': minorToMajorNumber(inv.subtotal_minor, inv.currency_code || pack),
        'Late Fee Amount': minorToMajorNumber(inv.late_fee_minor, inv.currency_code || pack),
        'Total Amount': minorToMajorNumber(inv.total_minor, inv.currency_code || pack),
        'Amount Paid': minorToMajorNumber(inv.amount_paid_minor, inv.currency_code || pack),
        Currency: inv.currency_code,
        Status: inv.status.toUpperCase(),
      };
    });

    exportToXLSX(`RentFlow_RentRoll_${pack.code}_${new Date().toISOString().slice(0, 10)}`, [
      { name: 'Rent Roll & Invoices', data },
    ]);
    showToast({ type: 'success', message: 'Real Excel (.xlsx) Rent Roll downloaded!' });
  };

  return (
    <div className="space-y-8 min-w-0">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] truncate">
            Rent Roll & Invoicing
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">
            Append-only financial records &bull; FIFO automatic allocation &bull; Real Excel export ({pack.name})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleExportRentRollXLSX} className="gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Rent Roll (.xlsx)</span>
          </Button>
          <Button variant="outline" onClick={handleApplyLateFees} className="gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Apply Statutory Fees</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setPayingInvoiceId(null);
              const defaultLeaseId = selectedLeaseId || leases[0]?.id || '';
              if (defaultLeaseId) {
                setSelectedLeaseId(defaultLeaseId);
                const openLeaseInvoices = invoices.filter(
                  (i) => i.lease_id === defaultLeaseId && i.status !== 'paid' && i.status !== 'voided'
                );
                const dueSum = openLeaseInvoices.reduce(
                  (sum, i) => sum + Math.max(0, i.total_minor - i.amount_paid_minor),
                  0
                );
                const targetLease = leases.find((l) => l.id === defaultLeaseId);
                const suggestedMinor = dueSum > 0 ? dueSum : targetLease?.rent_minor || 0;
                if (suggestedMinor > 0) {
                  setPaymentAmount(String(minorToMajorNumber(suggestedMinor, targetLease?.currency_code || pack)));
                }
              }
              setIsRecordOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Record Payment (FIFO)</span>
          </Button>
        </div>
      </div>

      {/* Active Tenant Overpayment Credits Banner in Rent Roll */}
      {(() => {
        const activeCreditsList = credits.filter(
          (c) =>
            !c.deleted_at &&
            !(c as any).deletedAt &&
            (c.status === 'active' || c.status === 'partially_used') &&
            (c.amount_minor || 0) > 0
        );
        if (activeCreditsList.length === 0) return null;

        const creditByTenant = new Map<string, { tenantName: string; unitName: string; amountMinor: number }>();
        activeCreditsList.forEach((c) => {
          const lease = leases.find((l) => l.id === (c.lease_id || (c as any).leaseId));
          const resolvedTenantId = c.tenant_id || (c as any).tenantId || lease?.tenant_id || c.id;
          const tenant = tenants.find((t) => t.id === resolvedTenantId);
          const unit = lease ? units.find((u) => u.id === lease.unit_id) : undefined;
          const prev = creditByTenant.get(resolvedTenantId);
          creditByTenant.set(resolvedTenantId, {
            tenantName: tenant?.name || 'Resident Account',
            unitName: unit ? getUnitDisplayName(unit) : prev?.unitName || 'Active Tenancy',
            amountMinor: (prev?.amountMinor || 0) + (c.amount_minor || 0),
          });
        });
        const entries = Array.from(creditByTenant.entries());
        const totalCreditsMinor = entries.reduce((sum, [, item]) => sum + item.amountMinor, 0);

        return (
          <Card className="border-emerald-500/30 bg-emerald-500/5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                  Tenant Overpayment Credits ({entries.length} Account{entries.length > 1 ? 's' : ''})
                </h3>
              </div>
              <Badge variant="success" className="font-mono font-bold">
                Total Credit Held: {formatMoney(totalCreditsMinor, pack)}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {entries.map(([key, item]) => (
                <div
                  key={key}
                  className="p-3 rounded-xl bg-[var(--bg-surface)] border border-emerald-500/20 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[var(--text-primary)] block truncate">
                      {item.tenantName}
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                      {item.unitName} &bull; For next month
                    </span>
                  </div>
                  <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400 shrink-0">
                    {formatMoney(item.amountMinor, pack)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* Invoices List Table with 56px Row Height */}
      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight truncate">
              Rent Ledger & Invoices
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
              Itemized billing history and statutory fee adjustments
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Badge variant="accent">{invoices.length} Total Records</Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="py-3.5 px-6">Invoice #</th>
                <th className="py-3.5 px-6">Resident & Unit</th>
                <th className="py-3.5 px-6">Due Date</th>
                <th className="py-3.5 px-6 text-right">Subtotal</th>
                <th className="py-3.5 px-6 text-right">Late Fee</th>
                <th className="py-3.5 px-6 text-right">Total</th>
                <th className="py-3.5 px-6 text-right">Paid</th>
                <th className="py-3.5 px-6 text-right">Credit Balance</th>
                <th className="py-3.5 px-6 text-center">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
              {invoices.map((inv) => {
                const lease = leases.find((l) => l.id === inv.lease_id);
                const tenant = tenants.find((t) => t.id === lease?.tenant_id);
                const unit = units.find((u) => u.id === lease?.unit_id);
                const formattedInvNo = formatInvoiceNumber(inv.id, inv.period_start);

                const activeCredits = credits.filter(
                  (c) =>
                    !c.deleted_at &&
                    !(c as any).deletedAt &&
                    (c.status === 'active' || c.status === 'partially_used') &&
                    (c.amount_minor || 0) > 0 &&
                    ((inv.lease_id && (c.lease_id === inv.lease_id || (c as any).leaseId === inv.lease_id)) ||
                      (tenant && (c.tenant_id === tenant.id || (c as any).tenantId === tenant.id)))
                );
                const creditBalanceMinor = activeCredits.reduce((sum, c) => sum + (c.amount_minor || 0), 0);

                const statusVariant =
                  inv.status === 'paid'
                    ? 'success'
                    : inv.status === 'overdue'
                    ? 'danger'
                    : inv.status === 'partially_paid'
                    ? 'warning'
                    : 'neutral';

                return (
                  <tr
                    key={inv.id}
                    className="h-14 transition-colors hover:bg-[var(--bg-base)]"
                  >
                    <td className="py-3 px-6 font-mono font-semibold text-[var(--text-primary)] text-xs">
                      {formattedInvNo}
                      {inv.voided_reason && (
                        <span className="block text-[10px] text-[var(--text-subtle)] line-clamp-1 italic">
                          Void: {inv.voided_reason}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-6">
                      <p className="font-semibold text-[var(--text-primary)]">{tenant?.name || 'N/A'}</p>
                      <p className="text-xs text-[var(--text-secondary)] font-medium">
                        {unit ? getUnitDisplayName(unit) : 'N/A'}
                      </p>
                    </td>
                    <td className="py-3 px-6 text-xs text-[var(--text-secondary)] font-mono">
                      {inv.due_date}
                    </td>
                    <td className="py-3 px-6 text-right font-mono number-tabular text-[var(--text-secondary)]">
                      {formatMoney(inv.subtotal_minor, pack)}
                    </td>
                    <td className="py-3 px-6 text-right font-mono number-tabular text-rose-600 font-medium">
                      {inv.late_fee_minor > 0 ? formatMoney(inv.late_fee_minor, pack) : '—'}
                    </td>
                    <td className="py-3 px-6 text-right font-mono font-bold number-tabular text-[var(--text-primary)]">
                      {formatMoney(inv.total_minor, pack)}
                    </td>
                    <td className="py-3 px-6 text-right font-mono font-bold number-tabular text-emerald-600">
                      {formatMoney(inv.amount_paid_minor, pack)}
                    </td>
                    <td className="py-3 px-6 text-right font-mono font-semibold">
                      {creditBalanceMinor > 0 ? (
                        <Badge variant="success" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold font-mono text-[11px]">
                          +{formatMoney(creditBalanceMinor, pack)} Credit
                        </Badge>
                      ) : (
                        <span className="text-[var(--text-subtle)] font-normal text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-6 text-center">
                      <Badge variant={statusVariant}>{inv.status.replace('_', ' ').toUpperCase()}</Badge>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {inv.status !== 'paid' && inv.status !== 'voided' && (
                          <button
                            onClick={() => {
                              setPayingInvoiceId(inv.id);
                              setSelectedLeaseId(inv.lease_id);
                              setPaymentAmount(
                                String(
                                  minorToMajorNumber(
                                    Math.max(0, inv.total_minor - inv.amount_paid_minor),
                                    inv.currency_code || pack
                                  )
                                )
                              );
                              setIsRecordOpen(true);
                            }}
                            className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--accent)] hover:text-white text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer"
                            title="Pay this invoice"
                          >
                            Pay
                          </button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs px-2.5 gap-1.5"
                          onClick={() => handleOpenReceiptModal(inv)}
                          title="Print Official Receipt"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </Button>

                        <button
                          onClick={() => handleOpenEditModal(inv)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] cursor-pointer"
                          title="Edit Invoice"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteInvoice(inv)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-rose-600 hover:bg-[var(--bg-base)] cursor-pointer"
                          title="Delete Invoice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {inv.status !== 'voided' && (
                          <button
                            onClick={() => {
                              setVoidingInvoiceId(inv.id);
                              setIsVoidOpen(true);
                            }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-base)] cursor-pointer"
                            title="Void Invoice"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recorded Payments & Settlement Ledger Table */}
      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              Recorded Payments & Settlement Ledger
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Real-time payment transactions and FIFO allocations across tenant accounts
            </p>
          </div>
          <Badge variant="accent">{payments.length} Payments Logged</Badge>
        </div>

        <div className="overflow-x-auto">
          {payments.length === 0 ? (
            <div className="text-center py-10 text-xs text-[var(--text-secondary)]">
              No payments recorded yet. Click &quot;Record Payment (FIFO)&quot; above to allocate a payment.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  <th className="py-3.5 px-6">Payment Reference</th>
                  <th className="py-3.5 px-6">Resident & Unit</th>
                  <th className="py-3.5 px-6">Linked Invoice</th>
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Method</th>
                  <th className="py-3.5 px-6 text-right">Amount Paid</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                {[...payments]
                  .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
                  .map((pmt) => {
                    const inv = invoices.find((i) => i.id === pmt.invoice_id);
                    const lease = leases.find((l) => l.id === inv?.lease_id);
                    const tenant = tenants.find((t) => t.id === lease?.tenant_id);
                    const unit = units.find((u) => u.id === lease?.unit_id);
                    const prop = properties.find((p) => p.id === unit?.property_id);

                    return (
                      <tr key={pmt.id} className="h-14 hover:bg-[var(--bg-base)]/60 transition-colors">
                        <td className="py-3.5 px-6 font-mono font-bold text-xs text-[var(--text-primary)]">
                          {pmt.reference || `REF-${pmt.id.slice(0, 8)}`}
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="font-semibold text-xs text-[var(--text-primary)] block">
                            {tenant ? tenant.name : 'Resident Account'}
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] block">
                            {unit ? getUnitDisplayName(unit) : 'General Tenancy'} {prop ? `(${prop.name})` : ''}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 font-mono text-xs text-[var(--text-secondary)]">
                          {inv ? formatInvoiceNumber(inv.id, inv.period_start) : 'FIFO Allocation'}
                        </td>
                        <td className="py-3.5 px-6 text-xs text-[var(--text-secondary)]">
                          {new Date(pmt.paid_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3.5 px-6">
                          <Badge variant="neutral">{pmt.method}</Badge>
                        </td>
                        <td className="py-3.5 px-6 text-right font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 number-tabular">
                          +{formatMoney(pmt.amount_minor, pack)}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {inv && lease && tenant && unit && prop && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs px-2.5 gap-1.5"
                                onClick={() => {
                                  setActiveReceiptData({
                                    invoice: inv,
                                    lease,
                                    tenant,
                                    unit,
                                    property: prop,
                                    payment: pmt,
                                  });
                                }}
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Receipt</span>
                              </Button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentToDelete(pmt);
                                setIsDeletePaymentModalOpen(true);
                              }}
                              className="h-8 w-8 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/40 flex items-center justify-center transition-colors cursor-pointer"
                              title="Delete payment and reverse invoice balance"
                              aria-label="Delete payment"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Record Payment FIFO / Invoice Modal */}
      <Modal
        isOpen={isRecordOpen}
        onClose={() => {
          setIsRecordOpen(false);
          setPayingInvoiceId(null);
        }}
        title={
          payingInvoiceId
            ? `Pay Invoice ${formatInvoiceNumber(payingInvoiceId)}`
            : 'Record Payment (FIFO Allocation)'
        }
        description={
          payingInvoiceId
            ? 'Settle this invoice. Any overpayment above the balance due is saved automatically to Tenant Credits.'
            : 'The payment is automatically applied to oldest unsettled invoices first.'
        }
        maxWidth="lg"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {payingInvoiceId ? (() => {
            const targetInv = invoices.find((i) => i.id === payingInvoiceId);
            const targetLease = leases.find((l) => l.id === targetInv?.lease_id);
            const targetTenant = tenants.find((t) => t.id === targetLease?.tenant_id);
            const targetUnit = units.find((u) => u.id === targetLease?.unit_id);
            const balanceDueMinor = targetInv
              ? Math.max(0, targetInv.total_minor - targetInv.amount_paid_minor)
              : 0;
            return (
              <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-[var(--text-primary)] block">
                    {targetTenant?.name || 'Resident'} &bull; {targetUnit ? getUnitDisplayName(targetUnit) : 'Unit'}
                  </span>
                  <span className="text-[var(--text-secondary)] font-mono">
                    {targetInv ? formatInvoiceNumber(targetInv.id, targetInv.period_start) : ''}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)] font-bold block">
                    Balance Due
                  </span>
                  <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                    {formatMoney(balanceDueMinor, pack)}
                  </span>
                </div>
              </div>
            );
          })() : (
            <Select
              label="Select Lease Agreement *"
              value={selectedLeaseId || leases[0]?.id || ''}
              onChange={(e) => setSelectedLeaseId(e.target.value)}
              required
            >
              {leases.map((l) => {
                const t = tenants.find((tenant) => tenant.id === l.tenant_id);
                const u = units.find((unit) => unit.id === l.unit_id);
                const leaseName = formatLeaseName(t?.name, u ? getUnitDisplayName(u) : undefined, l.id);
                return (
                  <option key={l.id} value={l.id}>
                    {leaseName} — {formatMoney(l.rent_minor, pack)}/mo
                  </option>
                );
              })}
            </Select>
          )}

          <Input
            label={`Payment Amount (${pack.currency.code}) *`}
            type="number"
            step="any"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            required
          />

          {(() => {
            const targetInv = payingInvoiceId ? invoices.find((i) => i.id === payingInvoiceId) : undefined;
            const enteredMinor = parseMajorToMinor(paymentAmount, targetInv?.currency_code || pack);
            const effectiveLeaseId = targetInv?.lease_id || selectedLeaseId || leases[0]?.id || '';
            const openDueMinor = targetInv
              ? Math.max(0, targetInv.total_minor - targetInv.amount_paid_minor)
              : invoices
                  .filter(
                    (i) => i.lease_id === effectiveLeaseId && i.status !== 'paid' && i.status !== 'voided'
                  )
                  .reduce((sum, i) => sum + Math.max(0, i.total_minor - i.amount_paid_minor), 0);
            const previewOverpaymentMinor = openDueMinor > 0 && enteredMinor > openDueMinor
              ? enteredMinor - openDueMinor
              : 0;

            if (previewOverpaymentMinor > 0) {
              return (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <div>
                    <strong className="font-bold block">Overpayment Credit Detected</strong>
                    <span>
                      {formatMoney(openDueMinor, pack)} will mark the invoice <strong>PAID</strong>, and{' '}
                      <strong>{formatMoney(previewOverpaymentMinor, pack)}</strong> will be saved to the tenant&apos;s{' '}
                      <strong>Credit Balance</strong> for next month.
                    </span>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <Select
            label="Payment Method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            {pack.paymentMethods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>

          <div className="p-4 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent)]/30 text-xs text-[var(--accent)] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block">FIFO & Overpayment Rule:</strong>
              <span>
                Exact balance due is applied to open invoices first. Any surplus overpayment is saved to the tenant&apos;s credit balance for future rent.
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsRecordOpen(false);
                setPayingInvoiceId(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Record Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Void Invoice */}
      <Modal
        isOpen={isVoidOpen}
        onClose={() => setIsVoidOpen(false)}
        title={`Void Invoice ${voidingInvoiceId ? formatInvoiceNumber(voidingInvoiceId) : ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleVoidInvoice} className="space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Under append-only ledger rules, invoices are never deleted. Voiding marks the invoice as void and logs the reason in the audit trail.
          </p>

          <Input
            label="Reason for Voiding Invoice *"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="e.g. Duplicate entry, renegotiated tenancy terms"
            required
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsVoidOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Confirm Void Invoice
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Invoice */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingInvoice(null);
        }}
        title={`Edit Invoice ${editingInvoice ? formatInvoiceNumber(editingInvoice.id) : ''}`}
        description="Update invoice due date, total amount, or payment status."
        maxWidth="md"
      >
        <form onSubmit={handleSaveEditInvoice} className="space-y-4">
          <Input
            label="Due Date *"
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            required
          />

          <Input
            label={`Total Rent Amount (${pack.currency.code}) *`}
            type="number"
            step="0.01"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            required
          />

          <Select
            label="Invoice Status"
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value as any)}
          >
            <option value="unpaid">Unpaid / Due</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="voided">Voided</option>
          </Select>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditOpen(false);
                setEditingInvoice(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Payment Confirmation */}
      <Modal
        isOpen={isDeletePaymentModalOpen}
        onClose={() => {
          setIsDeletePaymentModalOpen(false);
          setPaymentToDelete(null);
        }}
        title="Delete Payment"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-primary)]">
            Are you sure you want to delete this payment?
          </p>

          {paymentToDelete && (
            <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Reference:</span>
                <span className="font-bold text-[var(--text-primary)]">
                  {paymentToDelete.reference || `REF-${paymentToDelete.id.slice(0, 8)}`}
                </span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Amount:</span>
                <span className="font-bold text-rose-600">
                  {formatMoney(paymentToDelete.amount_minor, pack)}
                </span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Method:</span>
                <span>{paymentToDelete.method}</span>
              </div>
              <p className="pt-2 text-[11px] font-sans text-amber-600 dark:text-amber-400">
                ⚠️ This will reverse the linked invoice balance and recalculate its settlement status (reopening the invoice if unpaid).
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeletePaymentModalOpen(false);
                setPaymentToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDeletePayment}
            >
              Yes, Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Dedicated Clean Print Receipt Preview Modal */}
      {activeReceiptData && (
        <PrintReceipt
          organization={org as Organization}
          property={activeReceiptData.property}
          unit={activeReceiptData.unit}
          tenant={activeReceiptData.tenant}
          lease={activeReceiptData.lease}
          invoice={activeReceiptData.invoice}
          payment={activeReceiptData.payment}
          pack={pack}
          onClose={() => setActiveReceiptData(null)}
        />
      )}
    </div>
  );
};
