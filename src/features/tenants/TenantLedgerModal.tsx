import React, { useMemo, useState, useEffect } from 'react';
import { db, parseDepositDeductions } from '../../db/client';
import {
  Tenant,
  Lease,
  Invoice,
  Payment,
  Credit,
  Deposit,
  DepositDeduction,
  MaintenanceRequest,
  Unit,
  Property,
} from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { getUnitDisplayName } from '../../lib/formatNames';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { usePrint } from '../../components/print/PrintContext';
import {
  Receipt,
  Printer,
  ShieldCheck,
} from '../../components/icons';

interface TenantLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
}

interface LedgerEntry {
  id: string;
  date: string;
  sortTime: number;
  type: 'charge' | 'payment' | 'late_fee' | 'maintenance' | 'deposit_deduction';
  title: string;
  description: string;
  debitMinor: number; // + rent/fee amount owed
  creditMinor: number; // - rent payment received
  depositDeductionMinor?: number; // deducted from security deposit escrow
  runningBalanceMinor: number;
}

export const TenantLedgerModal: React.FC<TenantLedgerModalProps> = ({
  isOpen,
  onClose,
  tenant,
}) => {
  const pack = usePack();
  const { printReport } = usePrint();
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const unsub = db.onWrite(() => setRefreshTick((k) => k + 1));
    return unsub;
  }, []);

  const leases = db.getTable<Lease>('leases');
  const invoices = db.getTable<Invoice>('invoices');
  const payments = db.getTable<Payment>('payments');
  const credits = db.getTable<Credit>('credits');
  const deposits = db.getTable<Deposit>('deposits');
  const depositDeductions = db.getTable<DepositDeduction>('deposit_deductions');
  const maintenance = db.getTable<MaintenanceRequest>('maintenance_requests');
  const units = db.getTable<Unit>('units');
  const properties = db.getTable<Property>('properties');

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const propertyMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);

  const {
    ledgerEntries,
    totalChargedMinor,
    totalPaidMinor,
    currentBalanceMinor,
    creditBalanceMinor,
    originalDepositMinor,
    totalDepositDeductedMinor,
    remainingDepositMinor,
  } = useMemo(() => {
    if (!tenant) {
      return {
        ledgerEntries: [],
        totalChargedMinor: 0,
        totalPaidMinor: 0,
        currentBalanceMinor: 0,
        creditBalanceMinor: 0,
        originalDepositMinor: 0,
        totalDepositDeductedMinor: 0,
        remainingDepositMinor: 0,
      };
    }

    const tenantLeases = leases.filter((l) => l.tenant_id === tenant.id);
    const tenantLeaseIds = new Set(tenantLeases.map((l) => l.id));

    const tenantInvoices = invoices.filter((i) => tenantLeaseIds.has(i.lease_id));
    const tenantInvoiceIds = new Set(tenantInvoices.map((i) => i.id));

    const tenantPayments = payments.filter((p) => tenantInvoiceIds.has(p.invoice_id));
    const tenantDeposits = deposits.filter((d) => tenantLeaseIds.has(d.lease_id));
    const tenantDepositIds = new Set(tenantDeposits.map((d) => d.id));

    const tenantDeductions = depositDeductions.filter(
      (dd) =>
        dd.tenant_id === tenant.id ||
        (dd as any).tenantId === tenant.id ||
        tenantLeaseIds.has(dd.lease_id) ||
        tenantDepositIds.has(dd.deposit_id)
    );

    const tenantMaintenance = maintenance.filter(
      (m) => m.tenant_id === tenant.id && m.paid_by === 'tenant'
    );

    const rawList: Array<Omit<LedgerEntry, 'runningBalanceMinor'>> = [];

    // 1. Rent Charges
    tenantInvoices.forEach((inv) => {
      const chargeDate = inv.period_start || inv.due_date || '2026-01-01';
      rawList.push({
        id: `inv-${inv.id}`,
        date: chargeDate,
        sortTime: new Date(chargeDate).getTime() || 0,
        type: 'charge',
        title: `Rent Charge (Inv #${inv.id.slice(-6)})`,
        description: `Billing period ${inv.period_start} to ${inv.period_end}`,
        debitMinor: inv.subtotal_minor,
        creditMinor: 0,
      });

      // Statutory Late Fee Entry if applicable
      if (inv.late_fee_minor > 0) {
        rawList.push({
          id: `late-${inv.id}`,
          date: inv.due_date,
          sortTime: new Date(inv.due_date).getTime() || 0,
          type: 'late_fee',
          title: `Late Fee Penalty (Inv #${inv.id.slice(-6)})`,
          description: `Statutory overdue fee (${pack.name} legal rules)`,
          debitMinor: inv.late_fee_minor,
          creditMinor: 0,
        });
      }
    });

    // 2. Rent Payments Received
    tenantPayments.forEach((p) => {
      const payDate = p.paid_at ? p.paid_at.slice(0, 10) : '2026-01-01';
      rawList.push({
        id: `pay-${p.id}`,
        date: payDate,
        sortTime: new Date(p.paid_at || payDate).getTime() || 0,
        type: 'payment',
        title: `Rent Payment Received`,
        description: `Method: ${p.method.toUpperCase()} (Ref: ${p.reference || 'N/A'})`,
        debitMinor: 0,
        creditMinor: p.amount_minor,
      });
    });

    // 3. Tenant-responsible Maintenance Charges
    tenantMaintenance.forEach((m) => {
      const maintDate = m.completed_at
        ? m.completed_at.slice(0, 10)
        : new Date(m.updated_at).toISOString().slice(0, 10);
      rawList.push({
        id: `maint-${m.id}`,
        date: maintDate,
        sortTime: new Date(m.completed_at || maintDate).getTime() || m.updated_at || 0,
        type: 'maintenance',
        title: `Repair Outlay: ${m.category.toUpperCase()}`,
        description: `${m.description}`,
        debitMinor: m.cost_minor,
        creditMinor: 0,
      });
    });

    // 4. Security Deposit Deductions (from deposit_deductions table, plus any legacy deductions_json fallback)
    const seenDeductionIds = new Set<string>();
    let totalDepositDeducted = 0;

    tenantDeductions.forEach((dd) => {
      seenDeductionIds.add(dd.id);
      const amount = Number(dd.amount_minor) || 0;
      totalDepositDeducted += amount;
      const dedDate = dd.deducted_at
        ? dd.deducted_at.slice(0, 10)
        : new Date(dd.created_at || dd.updated_at || Date.now()).toISOString().slice(0, 10);
      rawList.push({
        id: `depded-${dd.id}`,
        date: dedDate,
        sortTime: dd.created_at || new Date(dd.deducted_at || dedDate).getTime() || 0,
        type: 'deposit_deduction',
        title: 'Security Deposit Deduction',
        description: dd.receipt_note ? `${dd.reason} • ${dd.receipt_note}` : dd.reason,
        debitMinor: 0,
        creditMinor: 0,
        depositDeductionMinor: amount,
      });
    });

    tenantDeposits.forEach((dep) => {
      const legacyItems = parseDepositDeductions(dep.deductions_json);
      legacyItems.forEach((item) => {
        if (!item.id || seenDeductionIds.has(item.id)) return;
        const amount = Number(item.amount_minor) || 0;
        if (amount <= 0) return;
        seenDeductionIds.add(item.id);
        totalDepositDeducted += amount;
        const dedDate = item.date
          ? item.date.slice(0, 10)
          : new Date(dep.updated_at || Date.now()).toISOString().slice(0, 10);
        rawList.push({
          id: `depded-${item.id}`,
          date: dedDate,
          sortTime: new Date(item.date || dedDate).getTime() || dep.updated_at || 0,
          type: 'deposit_deduction',
          title: 'Security Deposit Deduction',
          description: item.reason || 'Deducted from security deposit',
          debitMinor: 0,
          creditMinor: 0,
          depositDeductionMinor: amount,
        });
      });
    });

    // Sort chronologically ascending
    rawList.sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.sortTime - b.sortTime;
    });

    // Calculate running rent balance (deposit deductions reduce deposit escrow, not rent payments)
    let running = 0;
    let charged = 0;
    let paid = 0;

    const entries: LedgerEntry[] = rawList.map((item) => {
      running += item.debitMinor - item.creditMinor;
      charged += item.debitMinor;
      paid += item.creditMinor;
      return {
        ...item,
        runningBalanceMinor: running,
      };
    });

    const totalOriginalDeposit =
      tenantDeposits.length > 0
        ? tenantDeposits.reduce((sum, d) => sum + (Number(d.amount_minor) || 0), 0)
        : tenantLeases.reduce((sum, l) => sum + (Number(l.deposit_minor) || 0), 0);

    const activeCreditBalanceMinor = credits
      .filter(
        (c) =>
          !c.deleted_at &&
          !(c as any).deletedAt &&
          (c.status === 'active' || c.status === 'partially_used') &&
          (c.amount_minor || 0) > 0 &&
          (c.tenant_id === tenant.id ||
            (c as any).tenantId === tenant.id ||
            (c.lease_id && tenantLeaseIds.has(c.lease_id)) ||
            ((c as any).leaseId && tenantLeaseIds.has((c as any).leaseId)))
      )
      .reduce((sum, c) => sum + (Number(c.amount_minor) || 0), 0);

    return {
      ledgerEntries: entries,
      totalChargedMinor: charged,
      totalPaidMinor: paid,
      currentBalanceMinor: running,
      creditBalanceMinor: activeCreditBalanceMinor,
      originalDepositMinor: totalOriginalDeposit,
      totalDepositDeductedMinor: totalDepositDeducted,
      remainingDepositMinor: Math.max(0, totalOriginalDeposit - totalDepositDeducted),
    };
  }, [
    tenant,
    leases,
    invoices,
    payments,
    credits,
    deposits,
    depositDeductions,
    maintenance,
    pack,
    isOpen,
    refreshTick,
  ]);

  if (!tenant) return null;

  const currentLease =
    leases.find((l) => l.tenant_id === tenant.id && l.status === 'active') ||
    leases.find((l) => l.tenant_id === tenant.id);
  const currentUnit = currentLease ? unitMap.get(currentLease.unit_id) : undefined;
  const currentProperty = currentUnit ? propertyMap.get(currentUnit.property_id) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resident Account Ledger — ${tenant.name}`}
      description="Verifiable transaction timeline & cumulative running balance in accordance with Country Pack financial standards."
      maxWidth="4xl"
    >
      <div className="space-y-6">
        {/* Resident Summary Banner */}
        <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-bold block">
                Resident
              </span>
              <span className="text-sm font-bold text-[var(--text-primary)] block mt-0.5">
                {tenant.name}
              </span>
              <span className="text-xs text-[var(--text-secondary)] font-mono">
                {tenant.phone}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-bold block">
                Assigned Home
              </span>
              <span className="text-xs font-bold text-[var(--text-primary)] block mt-0.5">
                {currentUnit ? getUnitDisplayName(currentUnit) : 'Unassigned'}
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                {currentProperty ? currentProperty.name : 'No Property'}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-bold block">
                Total Invoiced / Paid
              </span>
              <span className="text-xs font-semibold text-emerald-600 block mt-0.5 font-mono">
                Paid: {formatMoney(totalPaidMinor, pack)}
              </span>
              <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                Charges: {formatMoney(totalChargedMinor, pack)}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-bold block">
                {creditBalanceMinor > 0 ? 'Balance Due / Credit' : 'Current Outstanding Balance'}
              </span>
              <span
                className={`text-base font-black font-mono block mt-0.5 ${
                  currentBalanceMinor > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {formatMoney(Math.max(0, currentBalanceMinor), pack)}
              </span>
              {creditBalanceMinor > 0 ? (
                <Badge variant="success" size="sm">
                  Credit Balance: {formatMoney(creditBalanceMinor, pack)}
                </Badge>
              ) : (
                <Badge variant={currentBalanceMinor > 0 ? 'danger' : 'success'} size="sm">
                  {currentBalanceMinor > 0 ? 'Arrears / Due' : 'Zero Balance'}
                </Badge>
              )}
            </div>
          </div>

          {creditBalanceMinor > 0 && (
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-emerald-700 dark:text-emerald-300 font-medium">
                Available Overpayment Credit (carries forward automatically to next month&apos;s rent invoice):
              </div>
              <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                Credit Balance: {formatMoney(creditBalanceMinor, pack)}
              </div>
            </div>
          )}

          {(originalDepositMinor > 0 || totalDepositDeductedMinor > 0) && (
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold text-[var(--text-primary)]">Security Deposit Escrow:</span>
                <span className="font-mono">
                  Original {formatMoney(originalDepositMinor, pack)}
                </span>
                {totalDepositDeductedMinor > 0 && (
                  <span className="font-mono font-semibold text-rose-600">
                    (-{formatMoney(totalDepositDeductedMinor, pack)} deducted)
                  </span>
                )}
              </div>
              <div className="font-mono font-bold text-emerald-600">
                Remaining Deposit: {formatMoney(remainingDepositMinor, pack)}
              </div>
            </div>
          )}
        </div>

        {/* Running Ledger Timeline Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              Transaction History ({ledgerEntries.length} Records)
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              Currency: {pack.currency.code} ({pack.currency.symbol})
            </span>
          </div>

          {ledgerEntries.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40 text-indigo-500" />
              <span>No ledger activity recorded for this tenant yet.</span>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--bg-base)] text-[var(--text-secondary)] uppercase">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Type</th>
                    <th className="py-2.5 px-3 font-semibold">Description</th>
                    <th className="py-2.5 px-3 font-semibold text-right text-rose-600">Charge / Deduction</th>
                    <th className="py-2.5 px-3 font-semibold text-right text-emerald-600">Payment (-)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Rent Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
                  {ledgerEntries.map((entry) => {
                    const isDepositDeduction = entry.type === 'deposit_deduction';
                    return (
                      <tr
                        key={entry.id}
                        className={
                          isDepositDeduction
                            ? 'bg-rose-500/5 hover:bg-rose-500/10 transition-colors'
                            : 'hover:bg-[var(--bg-surface-sunken)] transition-colors'
                        }
                      >
                        <td
                          className={`py-3 px-3 font-mono whitespace-nowrap ${
                            isDepositDeduction
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {entry.date}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {entry.type === 'payment' ? (
                            <Badge variant="success">Payment</Badge>
                          ) : entry.type === 'deposit_deduction' ? (
                            <Badge variant="danger">Security Deposit Deduction</Badge>
                          ) : entry.type === 'late_fee' ? (
                            <Badge variant="danger">Late Fee</Badge>
                          ) : entry.type === 'maintenance' ? (
                            <Badge variant="warning">Maintenance</Badge>
                          ) : (
                            <Badge variant="accent">Rent Charge</Badge>
                          )}
                        </td>
                        <td className="py-3 px-3 min-w-0">
                          <span
                            className={`font-bold block ${
                              isDepositDeduction
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-[var(--text-primary)]'
                            }`}
                          >
                            {entry.title}
                          </span>
                          <span
                            className={`text-[11px] block ${
                              isDepositDeduction
                                ? 'text-rose-600/80 dark:text-rose-400/80'
                                : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {entry.description}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-right text-rose-600 whitespace-nowrap">
                          {isDepositDeduction ? (
                            <div>
                              <span className="font-bold">
                                -{formatMoney(entry.depositDeductionMinor || 0, pack)}
                              </span>
                              <span className="block text-[10px] font-normal text-rose-500/80">
                                from Deposit
                              </span>
                            </div>
                          ) : entry.debitMinor > 0 ? (
                            `+${formatMoney(entry.debitMinor, pack)}`
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-right text-emerald-600 whitespace-nowrap">
                          {entry.creditMinor > 0 ? `-${formatMoney(entry.creditMinor, pack)}` : '—'}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-right text-[var(--text-primary)] whitespace-nowrap">
                          <span className={entry.runningBalanceMinor > 0 ? 'text-rose-600 font-black' : ''}>
                            {formatMoney(entry.runningBalanceMinor, pack)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="no-print flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              printReport(
                <div className="print-area bg-white text-black w-full max-w-[800px] mx-auto font-sans p-10 space-y-6">
                  <div className="flex items-start justify-between pb-5 border-b-2 border-gray-900">
                    <div>
                      <h1 className="text-xl font-bold text-gray-950">Resident Account Ledger</h1>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {tenant.name} &middot; {currentProperty ? currentProperty.name : 'Portfolio'} ({currentUnit ? currentUnit.name : 'Unassigned'})
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-600 tabular-nums">
                      <div className="font-bold text-gray-950">
                        Rent Balance: {formatMoney(Math.max(0, currentBalanceMinor), pack)}
                      </div>
                      {creditBalanceMinor > 0 && (
                        <div className="font-bold text-emerald-700">
                          Credit Balance: {formatMoney(creditBalanceMinor, pack)}
                        </div>
                      )}
                      {originalDepositMinor > 0 && (
                        <div>
                          Deposit Balance: {formatMoney(remainingDepositMinor, pack)}
                        </div>
                      )}
                      <div>Currency: {pack.currency.code}</div>
                    </div>
                  </div>

                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 font-bold uppercase text-gray-700">
                        <th className="py-2.5 pr-3">Date</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-right tabular-nums">Charge / Deduction</th>
                        <th className="py-2.5 px-3 text-right tabular-nums">Payment (-)</th>
                        <th className="py-2.5 pl-3 text-right tabular-nums">Rent Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {ledgerEntries.map((entry) => {
                        const isDepositDeduction = entry.type === 'deposit_deduction';
                        return (
                          <tr key={entry.id}>
                            <td className="py-2.5 pr-3 font-mono tabular-nums whitespace-nowrap">{entry.date}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`font-semibold block ${
                                  isDepositDeduction ? 'text-rose-700' : 'text-gray-900'
                                }`}
                              >
                                {entry.title}
                              </span>
                              <span className="text-[11px] text-gray-500">{entry.description}</span>
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                                isDepositDeduction ? 'text-rose-700 font-semibold' : ''
                              }`}
                            >
                              {isDepositDeduction
                                ? `-${formatMoney(entry.depositDeductionMinor || 0, pack)} (Deposit)`
                                : entry.debitMinor > 0
                                ? `+${formatMoney(entry.debitMinor, pack)}`
                                : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              {entry.creditMinor > 0 ? `-${formatMoney(entry.creditMinor, pack)}` : '—'}
                            </td>
                            <td className="py-2.5 pl-3 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                              {formatMoney(entry.runningBalanceMinor, pack)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            }}
            className="gap-2"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Formal Ledger Statement</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
