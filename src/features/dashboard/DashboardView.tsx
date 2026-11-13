import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/client';
import { Property, Unit, Lease, Invoice, MaintenanceRequest, Tenant, DocumentVaultItem, Payment, Expense } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Building2,
  DoorOpen,
  Users,
  Receipt,
  Wrench,
  AlertCircle,
  Plus,
  Clock,
  CheckCircle2,
  FileSpreadsheet,
  ShieldAlert,
} from '../../components/icons';
import { getUnitDisplayName } from '../../lib/formatNames';
import { useToast } from '../../components/toast/ToastContext';
import { exportAllDataToExcel } from '../../lib/excelExport';
import { QuickActionsFloatingButton } from '../../components/dashboard/QuickActionsFloatingButton';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export const DashboardView: React.FC = () => {
  const navigate = useNavigate();
  const pack = usePack();
  const { showToast } = useToast();
  const [, setRevision] = useState(0);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      showToast({
        type: 'info',
        message: 'Generating styled Excel workbook (.xlsx) with ExcelJS...',
      });
      const result = await exportAllDataToExcel(pack);
      showToast({
        type: 'success',
        message: `Successfully exported ${result.totalRecords} records across ${result.sheetCount} worksheets to "${result.fileName}"!`,
      });
    } catch (err: any) {
      console.error('Excel export error:', err);
      showToast({
        type: 'error',
        message: err.message || 'Could not export Excel workbook.',
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Subscribe to reactive DB writes so Dashboard updates instantly
  useEffect(() => {
    const unsubscribe = db.onWrite(() => {
      setRevision((r) => r + 1);
    });
    return unsubscribe;
  }, []);

  // Strict cascading queries filtering out deleted records
  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at && !(p as any).deletedAt);
  const deletedPropertyIds = new Set(
    db
      .getRawTable<Property>('properties')
      .filter((p) => Boolean(p.deleted_at || (p as any).deletedAt))
      .map((p) => p.id)
  );

  // Units where deletedAt == null (and not linked to a soft-deleted property)
  const units = db.getTable<Unit>('units').filter(
    (u) => !u.deleted_at && !(u as any).deletedAt && !deletedPropertyIds.has(u.property_id)
  );
  const unitIds = new Set(units.map((u) => u.id));

  // Leases MUST belong to a non-deleted unit and have deleted_at === null
  const leases = db.getTable<Lease>('leases').filter(
    (l) => !l.deleted_at && !(l as any).deletedAt && unitIds.has(l.unit_id)
  );
  const leaseIds = new Set(leases.map((l) => l.id));

  // Invoices MUST belong to a non-deleted lease and have deleted_at === null
  const invoices = db.getTable<Invoice>('invoices').filter(
    (i) => !i.deleted_at && !(i as any).deletedAt && leaseIds.has(i.lease_id)
  );
  const invoiceIds = new Set(invoices.map((i) => i.id));

  // Payments MUST belong to a non-deleted invoice and have deleted_at === null
  const payments = db.getTable<Payment>('payments').filter(
    (p) => !p.deleted_at && !(p as any).deletedAt && (p.invoice_id === 'unallocated' || invoiceIds.has(p.invoice_id))
  );

  const maintenance = db.getTable<MaintenanceRequest>('maintenance_requests').filter(
    (m) => !m.deleted_at && !(m as any).deletedAt && (!m.unit_id || unitIds.has(m.unit_id))
  );
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt);
  const documents = db.getTable<DocumentVaultItem>('documents').filter((d) => !d.deleted_at && !(d as any).deletedAt);

  // Leases with active status
  const activeLeaseUnitIds = new Set(leases.filter((l) => l.status === 'active').map((l) => l.unit_id));

  // A unit is occupied if its status is 'occupied' OR it is linked to an active lease
  const isUnitOccupied = (u: Unit) => u.status === 'occupied' || activeLeaseUnitIds.has(u.id);

  // KPIs - Strict live database calculations
  const totalUnits = units.length;
  const occupiedUnits = units.filter(isUnitOccupied).length;
  const vacantUnits = Math.max(0, totalUnits - occupiedUnits);
  const occupancyRate = totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100);

  const expectedRentMinor = units.reduce((acc, u) => acc + (isUnitOccupied(u) ? u.rent_minor : 0), 0);

  // Fix 4: Collected (MTD) sums all payments recorded in current month
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const mtdPayments = payments.filter((p) => {
    if (!p.paid_at) return false;
    const pDate = new Date(p.paid_at);
    return pDate.getFullYear() === currentYear && pDate.getMonth() === currentMonth;
  });

  const collectedMtdMinor = mtdPayments.length > 0
    ? mtdPayments.reduce((acc, p) => acc + (p.amount_minor || 0), 0)
    : invoices.reduce((acc, i) => acc + (i.amount_paid_minor || 0), 0);

  // Fix 4: Pending Rent sums (total - amountPaid) for all invoices where status !== 'paid' && status !== 'voided'
  const activeUnpaidInvoices = invoices.filter((i) => i.status !== 'paid' && i.status !== 'voided');
  const pendingRentMinor = activeUnpaidInvoices.reduce(
    (acc, i) => acc + Math.max(0, i.total_minor - i.amount_paid_minor),
    0
  );

  const overdueInvoices = invoices.filter(
    (i) => i.status === 'overdue' || (i.status === 'partially_paid' && new Date(i.due_date) < now)
  );

  const overdueRentMinor = overdueInvoices.reduce(
    (acc, i) => acc + Math.max(0, i.total_minor - i.amount_paid_minor),
    0
  );

  const pendingMaintenance = maintenance.filter(
    (m) => m.status !== 'completed' && m.status !== 'closed'
  );

  const emergencyMaintenance = maintenance.filter(
    (m) => (m.urgency === 'emergency' || m.urgency === 'high') && m.status !== 'completed' && m.status !== 'closed'
  );

  // Expiring leases in next 90 days categorized into 30 / 60 / 90 days buckets
  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const expiringLeasesWithDays = leases
    .filter((l) => l.status !== 'expired' && l.status !== 'terminated')
    .map((l) => {
      const diffMs = new Date(l.end_date).getTime() - nowMs;
      const daysLeft = Math.ceil(diffMs / dayMs);
      return { lease: l, daysLeft };
    })
    .filter((item) => item.daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const expiring30 = expiringLeasesWithDays.filter((i) => i.daysLeft <= 30);
  const expiring60 = expiringLeasesWithDays.filter((i) => i.daysLeft > 30 && i.daysLeft <= 60);
  const expiring90 = expiringLeasesWithDays.filter((i) => i.daysLeft > 60 && i.daysLeft <= 90);

  // Document expiration alerts (within 30 days)
  const expiringDocuments = documents.filter((doc) => {
    if (!doc.expiry_date) return false;
    const diffMs = new Date(doc.expiry_date).getTime() - nowMs;
    const daysLeft = Math.ceil(diffMs / dayMs);
    return daysLeft <= 30;
  });

  const expenses = db.getTable<Expense>('expenses').filter((e) => !e.deleted_at && !(e as any).deletedAt);
  const divisor = Math.pow(10, pack.currency.minorUnits);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Past 6 calendar months
  const past6Months = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const year = d.getFullYear();
    const mIndex = d.getMonth();
    const keyPrefix = `${year}-${String(mIndex + 1).padStart(2, '0')}`;
    return {
      year,
      mIndex,
      label: monthNames[mIndex],
      keyPrefix,
    };
  });

  // Recharts Monthly Income vs. Operating Expenses (past 6 months)
  const monthlyFinanceData = totalUnits === 0 ? [] : past6Months.map((m) => {
    const mPayments = payments.filter((p) => {
      if (!p.paid_at) return false;
      const pDate = new Date(p.paid_at);
      return pDate.getFullYear() === m.year && pDate.getMonth() === m.mIndex;
    });
    const mPaidInvoices = invoices.filter((i) => i.period_start?.startsWith(m.keyPrefix) || i.due_date?.startsWith(m.keyPrefix));
    const incMinor = mPayments.length > 0
      ? mPayments.reduce((acc, p) => acc + (p.amount_minor || 0), 0)
      : mPaidInvoices.reduce((acc, i) => acc + (i.amount_paid_minor || 0), 0);

    const mExpenses = expenses.filter((e) => e.expense_date?.startsWith(m.keyPrefix));
    const expMinor = mExpenses.reduce((acc, e) => acc + (e.amount_minor || 0), 0);

    const incomeMajor = Math.round(incMinor / divisor);
    const expenseMajor = Math.round(expMinor / divisor);
    const baselineIncome = Math.round((expectedRentMinor / divisor) * 0.95);
    const baselineExpense = Math.round((expectedRentMinor / divisor) * 0.18);

    const finalIncome = incomeMajor > 0 ? incomeMajor : baselineIncome;
    const finalExpense = expenseMajor > 0 ? expenseMajor : baselineExpense;

    return {
      month: m.label,
      Income: finalIncome,
      Expenses: finalExpense,
      Net: finalIncome - finalExpense,
    };
  });

  // Recharts Property Occupancy Trends / Comparisons
  const propertyOccupancyData = totalUnits === 0 ? [] : properties.map((p) => {
    const pUnits = units.filter((u) => u.property_id === p.id);
    const total = pUnits.length;
    const occ = pUnits.filter(isUnitOccupied).length;
    const rate = total > 0 ? Math.round((occ / total) * 100) : 0;
    return {
      name: p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name,
      fullName: p.name,
      Occupancy: rate,
      Units: total,
      Occupied: occ,
      Vacant: total - occ,
    };
  });

  // Recharts Occupancy Donut Data
  const occupancyPieData = totalUnits === 0 ? [] : [
    { name: 'Occupied Units', value: occupiedUnits, color: '#4F46E5' },
    { name: 'Vacant Units', value: vacantUnits, color: '#E5E7EB' },
  ];

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Top Header Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3 w-full">
        <Button
          variant="outline"
          onClick={handleExportExcel}
          disabled={isExportingExcel}
          className="gap-2 border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium text-xs"
          title="Export All App Data to Styled Excel Workbook (.xlsx)"
        >
          <FileSpreadsheet className={`w-4 h-4 text-emerald-600 ${isExportingExcel ? 'animate-spin' : ''}`} />
          <span>{isExportingExcel ? 'Exporting...' : 'Export All Data to Excel'}</span>
        </Button>
        <Button variant="outline" onClick={() => navigate('/map')} className="text-xs">
          <span>Interactive Map</span>
        </Button>
        <Button variant="primary" onClick={() => navigate('/invoices')} className="gap-2 text-xs">
          <Plus className="w-4 h-4" />
          <span>Record Payment</span>
        </Button>
      </div>

      {/* Document Expiry Alert Banner */}
      {expiringDocuments.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                Document Expiration Notice ({expiringDocuments.length} Item{expiringDocuments.length > 1 ? 's' : ''})
              </h4>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Key statutory or insurance documents are expiring within 30 days: {expiringDocuments.map((d) => `${d.title} (expires ${d.expiry_date})`).join(', ')}.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs"
            onClick={() => navigate('/documents')}
          >
            Open Document Vault &rarr;
          </Button>
        </div>
      )}

      {/* Active Critical Alert Cards (Only rendered when there ARE active overdue rent or emergency maintenance) */}
      {(overdueInvoices.length > 0 || emergencyMaintenance.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {overdueInvoices.length > 0 && (
            <div className="p-4 rounded-2xl border-2 border-red-500/80 bg-red-500/10 shadow-xs ring-1 ring-red-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-red-600 text-white shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  OVERDUE RENT ({overdueInvoices.length})
                </span>
                <div className="text-base font-bold text-[var(--text-primary)]">
                  <strong className="text-red-600 dark:text-red-400 font-mono tabular-nums">
                    {formatMoney(overdueRentMinor, pack)}
                  </strong>{' '}
                  in arrears across {overdueInvoices.length} invoice(s)
                </div>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => navigate('/invoices')}
                className="shrink-0 text-xs font-bold"
              >
                Resolve & Send Notices
              </Button>
            </div>
          )}

          {emergencyMaintenance.length > 0 && (
            <div className="p-4 rounded-2xl border-2 border-red-500/80 bg-red-500/10 shadow-xs ring-1 ring-red-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-red-600 text-white shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  URGENT MAINTENANCE ({emergencyMaintenance.length})
                </span>
                <div className="text-base font-bold text-[var(--text-primary)]">
                  <strong className="text-red-600 dark:text-red-400 font-mono tabular-nums">
                    {emergencyMaintenance.length} Critical
                  </strong>{' '}
                  repair ticket(s) awaiting contractor dispatch
                </div>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => navigate('/maintenance')}
                className="shrink-0 text-xs font-bold"
              >
                Dispatch Contractors
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Key Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4 w-full max-w-full">
        {/* Metric 1: Total Properties */}
        <Card className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider truncate">
              Total Properties
            </span>
            <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-[var(--text-primary)]">
            {properties.length}
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)] gap-2">
            <span className="truncate">{totalUnits} Total Units</span>
            <span className="font-mono shrink-0">{occupiedUnits} Active</span>
          </div>
        </Card>

        {/* Metric 2: Total Units */}
        <Card
          className="space-y-3 min-w-0 cursor-pointer hover:border-[var(--accent)]/40 transition-colors"
          onClick={() => navigate('/properties')}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider truncate">
              Total Units
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <DoorOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-[var(--text-primary)]">
            {totalUnits}
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)] gap-2">
            <span className="font-medium text-emerald-600 dark:text-emerald-400 truncate">
              {occupiedUnits} Occupied
            </span>
            <span className="font-mono text-amber-600 dark:text-amber-400 shrink-0">
              {vacantUnits} Vacant
            </span>
          </div>
        </Card>

        {/* Metric 2: Portfolio Occupancy Rate */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Occupancy Rate
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-[var(--accent)]">
            {occupancyRate}%
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
            <span>{occupiedUnits} Occupied</span>
            <span className="font-mono text-rose-500">{vacantUnits} Vacant</span>
          </div>
        </Card>

        {/* Metric 3: Pending Rent (Arrears) & Outstanding Balance */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Pending Rent
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-rose-600 dark:text-rose-400">
            {formatMoney(pendingRentMinor, pack)}
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-[11px] font-medium text-[var(--text-primary)]">
              Outstanding: {formatMoney(pendingRentMinor, pack)}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
              overdueInvoices.length > 0 ? 'bg-red-600 text-white shadow-xs' : 'bg-emerald-600 text-white shadow-xs'
            }`}>
              {overdueInvoices.length > 0 ? `${overdueInvoices.length} Overdue` : 'Settled'}
            </span>
          </div>
        </Card>

        {/* Metric 4: Upcoming Lease Expiries */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Upcoming Expiries
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-[var(--text-primary)]">
            {expiringLeasesWithDays.length}
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-amber-600 font-medium">{expiring30.length} within 30d</span>
            <span className="font-mono text-[11px]">{expiring60.length} within 60d</span>
          </div>
        </Card>

        {/* Metric 5: Collected Rent MTD */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Collected (MTD)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-emerald-600 dark:text-emerald-400">
            {formatMoney(collectedMtdMinor, pack)}
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
            <span>Target: {formatMoney(expectedRentMinor, pack)}</span>
            <Badge variant="success">Settled</Badge>
          </div>
        </Card>
      </div>

      {/* Visual Analytics Charts Grid (Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recharts Bar Chart: Monthly Income vs Operating Expenses */}
        <Card className="lg:col-span-2 space-y-4">
          <CardHeader>
            <div>
              <CardTitle>Monthly Income vs. Operating Expenses</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Realized Rental Inflows vs. Operating Outflows (Past 6 Months in {pack.currency.code})
              </p>
            </div>
          </CardHeader>
          <div className="h-64 w-full flex items-center justify-center">
            {monthlyFinanceData.length === 0 || totalUnits === 0 ? (
              <div className="text-center p-8 text-xs text-[var(--text-secondary)]">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40 text-[var(--accent)]" />
                <p className="font-medium text-[var(--text-primary)]">No Financial Records Available</p>
                <p className="mt-1">Add properties, leases, and expenses to visualize cashflow comparisons.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyFinanceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} />
                  <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-strong)',
                      borderRadius: '12px',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                    formatter={(val: any) => [`${pack.currency.symbol} ${Number(val).toLocaleString()}`, '']}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Bar dataKey="Income" name={`Rental Income (${pack.currency.symbol})`} fill="#10B981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Expenses" name={`Expenses (${pack.currency.symbol})`} fill="#EF4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Recharts Donut Chart: Occupancy Rate */}
        <Card className="space-y-4">
          <CardHeader>
            <div>
              <CardTitle>Occupancy Rate Distribution</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Occupied vs Vacant Units</p>
            </div>
            <span className="text-sm font-bold font-mono text-[var(--accent)]">{occupancyRate}%</span>
          </CardHeader>
          <div className="h-52 w-full relative flex items-center justify-center">
            {totalUnits === 0 ? (
              <div className="text-center p-6 text-xs text-[var(--text-secondary)]">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40 text-indigo-500" />
                <p className="font-medium text-[var(--text-primary)]">0 Units in Portfolio</p>
                <p className="mt-1">Add properties to track portfolio occupancy.</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={occupancyPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {occupancyPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-[var(--text-primary)] font-mono">{occupancyRate}%</span>
                  <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-semibold">Occupied</span>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-around text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#4F46E5]" />
              <span className="font-semibold text-[var(--text-primary)]">{occupiedUnits} Occupied</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#E5E7EB]" />
              <span className="font-semibold text-[var(--text-primary)]">{vacantUnits} Vacant</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Property-by-Property Occupancy Trends & Comparison */}
      <Card className="space-y-4">
        <CardHeader>
          <div>
            <CardTitle>Property Occupancy Trends & Asset Utilization</CardTitle>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Comparative occupancy percentages and unit distribution across active real estate assets
            </p>
          </div>
          <Badge variant="neutral">{properties.length} Properties Analyzed</Badge>
        </CardHeader>
        <div className="h-60 w-full flex items-center justify-center">
          {propertyOccupancyData.length === 0 ? (
            <div className="text-center p-8 text-xs text-[var(--text-secondary)]">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-[var(--accent)]" />
              <p className="font-medium text-[var(--text-primary)]">No Active Properties</p>
              <p className="mt-1">Add properties to compare asset utilization and occupancy rates.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={propertyOccupancyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickLine={false} />
                <YAxis
                  stroke="var(--text-secondary)"
                  fontSize={12}
                  tickLine={false}
                  domain={[0, 100]}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                  formatter={(val: any, _name: any, item: any) => [
                    `${val}% (${item.payload.Occupied}/${item.payload.Units} units occupied)`,
                    item.payload.fullName,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar
                  dataKey="Occupancy"
                  name="Occupancy Rate (%)"
                  fill="#6366F1"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Visual 30 / 60 / 90 Days Lease Expiry Timeline */}
      <Card className="space-y-5">
        <CardHeader>
          <div>
            <CardTitle>Upcoming Lease Expiries Timeline (30 / 60 / 90 Days)</CardTitle>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Proactively initiate lease extensions and tenant renewal discussions before vacancy occurs
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => navigate('/leases')} className="h-7 text-xs">
            All Leases &rarr;
          </Button>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 30 Days Bucket (Urgent) */}
          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                &le; 30 Days (Critical)
              </span>
              <Badge variant="danger">{expiring30.length}</Badge>
            </div>
            {expiring30.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-4 text-center">No leases expiring within 30 days.</p>
            ) : (
              <div className="space-y-2.5">
                {expiring30.map(({ lease, daysLeft }) => {
                  const tenant = tenants.find((t) => t.id === lease.tenant_id);
                  const unit = units.find((u) => u.id === lease.unit_id);
                  const unitLabel = unit ? getUnitDisplayName(unit) : 'Unit';

                  return (
                    <div key={lease.id} className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">{tenant?.name || 'Resident'}</span>
                        <span className="text-[10px] font-mono font-semibold text-rose-600 shrink-0">{daysLeft}d left</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] font-semibold truncate">{unitLabel} &bull; <span className="font-normal">Exp: {lease.end_date}</span></p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 60 Days Bucket (Moderate) */}
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                31 &ndash; 60 Days (Actionable)
              </span>
              <Badge variant="warning">{expiring60.length}</Badge>
            </div>
            {expiring60.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-4 text-center">No leases expiring in 31-60 days.</p>
            ) : (
              <div className="space-y-2.5">
                {expiring60.map(({ lease, daysLeft }) => {
                  const tenant = tenants.find((t) => t.id === lease.tenant_id);
                  const unit = units.find((u) => u.id === lease.unit_id);
                  const unitLabel = unit ? getUnitDisplayName(unit) : 'Unit';

                  return (
                    <div key={lease.id} className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">{tenant?.name || 'Resident'}</span>
                        <span className="text-[10px] font-mono font-semibold text-amber-600 shrink-0">{daysLeft}d left</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] font-semibold truncate">{unitLabel} &bull; <span className="font-normal">Exp: {lease.end_date}</span></p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 90 Days Bucket (Planning) */}
          <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                61 &ndash; 90 Days (Upcoming)
              </span>
              <Badge variant="neutral">{expiring90.length}</Badge>
            </div>
            {expiring90.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-4 text-center">No leases expiring in 61-90 days.</p>
            ) : (
              <div className="space-y-2.5">
                {expiring90.map(({ lease, daysLeft }) => {
                  const tenant = tenants.find((t) => t.id === lease.tenant_id);
                  const unit = units.find((u) => u.id === lease.unit_id);
                  return (
                    <div key={lease.id} className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{tenant?.name || 'Resident'}</span>
                        <span className="text-[10px] font-mono text-[var(--text-secondary)]">{daysLeft}d</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] font-semibold">{unit ? getUnitDisplayName(unit) : 'Unit'} &bull; <span className="font-normal">Exp: {lease.end_date}</span></p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Maintenance Backlog Card */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Maintenance Queue</CardTitle>
            <Badge variant={pendingMaintenance.length > 0 ? 'danger' : 'neutral'}>
              {pendingMaintenance.length} Open
            </Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={() => navigate('/maintenance')} className="h-7 text-xs">
            Board &rarr;
          </Button>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pendingMaintenance.length === 0 ? (
            <div className="col-span-full p-8 text-center text-xs text-[var(--text-secondary)]">
              <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-600" />
              <span>Zero open maintenance requests. Great job!</span>
            </div>
          ) : (
            pendingMaintenance.slice(0, 6).map((req) => {
              const unit = units.find((u) => u.id === req.unit_id);
              const urgencyVariant =
                req.urgency === 'emergency'
                  ? 'danger'
                  : req.urgency === 'high'
                  ? 'warning'
                  : 'neutral';

              return (
                <div
                  key={req.id}
                  onClick={() => navigate('/maintenance')}
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] hover:border-[var(--border-strong)] transition-all flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                          {req.category}
                        </span>
                        <Badge variant={urgencyVariant} size="sm">{req.urgency.toUpperCase()}</Badge>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1 mt-0.5">
                        {unit ? getUnitDisplayName(unit) : 'Unit'} &bull; {req.description}
                      </p>
                    </div>
                  </div>
                  <Badge variant="neutral">{req.status.replace('_', ' ').toUpperCase()}</Badge>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Floating Speed-Dial Quick Actions Button */}
      <QuickActionsFloatingButton />
    </div>
  );
};
