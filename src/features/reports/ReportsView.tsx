import React, { useState } from 'react';
import { db } from '../../db/client';
import { Invoice, Expense, Unit, Property, Lease } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney, minorToMajorNumber, getCurrencyMinorUnits } from '../../lib/money';
import { exportToXLSX } from '../../lib/xlsx';
import { useToast } from '../../components/toast/ToastContext';
import { usePrint } from '../../components/print/PrintContext';
import { AuditReportPrintable } from '../../components/print/AuditReportPrintable';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  BarChart3,
  Download,
  FileText,
  Printer,
  FileSpreadsheet,
  Shield,
  TrendingUp,
  Receipt,
  Building2,
  Calendar,
} from '../../components/icons';

export const ReportsView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();
  const { printReport } = usePrint();

  const invoices = db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at);
  const expenses = db.getTable<Expense>('expenses').filter((e) => !e.deleted_at);
  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at);
  const units = db.getTable<Unit>('units').filter((u) => !u.deleted_at);

  const [selectedYear, setSelectedYear] = useState('2026');

  // Calculations strictly in minor units
  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const totalRentCollectedMinor = paidInvoices.reduce((acc, i) => acc + i.amount_paid_minor, 0);
  const totalExpensesMinor = expenses.reduce((acc, e) => acc + e.amount_minor, 0);
  const netOperatingIncomeMinor = totalRentCollectedMinor - totalExpensesMinor;

  // Statutory Tax & Withholding calculations
  const taxNotes = pack.tax;
  const estimatedWithholdingTaxMinor = taxNotes.withholdingTaxOnRent
    ? Math.round(totalRentCollectedMinor * 0.1)
    : 0;

  // Expenses grouped by category
  const expensesByCategory = expenses.reduce<Record<string, number>>((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + exp.amount_minor;
    return acc;
  }, {});

  const handleExportPnLCSV = () => {
    const decimals = getCurrencyMinorUnits(pack);
    const csvContent =
      `Category,Amount (${pack.currency.code})\n` +
      `Gross Rental Income,${minorToMajorNumber(totalRentCollectedMinor, pack).toFixed(decimals)}\n` +
      `Total Operating Expenses,${minorToMajorNumber(totalExpensesMinor, pack).toFixed(decimals)}\n` +
      `Net Operating Income (NOI),${minorToMajorNumber(netOperatingIncomeMinor, pack).toFixed(decimals)}\n` +
      `Estimated Withholding Tax,${minorToMajorNumber(estimatedWithholdingTaxMinor, pack).toFixed(decimals)}\n\n` +
      `--- Expense Breakdown ---\n` +
      Object.entries(expensesByCategory)
        .map(([cat, amt]) => `${cat.replace('_', ' ')},${minorToMajorNumber(amt, pack).toFixed(decimals)}`)
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pnl_report_${pack.code}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ type: 'success', message: 'P&L Statement exported to CSV' });
  };

  const handleExportExcel = () => {
    const summaryData = [
      { Metric: 'Gross Rental Collections', Amount: minorToMajorNumber(totalRentCollectedMinor, pack), Currency: pack.currency.code },
      { Metric: 'Operating Expenses', Amount: minorToMajorNumber(totalExpensesMinor, pack), Currency: pack.currency.code },
      { Metric: 'Net Operating Income (NOI)', Amount: minorToMajorNumber(netOperatingIncomeMinor, pack), Currency: pack.currency.code },
      { Metric: 'Statutory Withholding Estimate', Amount: minorToMajorNumber(estimatedWithholdingTaxMinor, pack), Currency: pack.currency.code },
    ];

    const categoryData = Object.entries(expensesByCategory).map(([cat, amt]) => ({
      Category: cat.replace('_', ' ').toUpperCase(),
      'Amount Disbursed': minorToMajorNumber(amt, pack),
      Currency: pack.currency.code,
    }));

    exportToXLSX(`RentFlow_Financial_Statement_${pack.code}_${new Date().toISOString().slice(0, 10)}`, [
      { name: 'P&L Executive Summary', data: summaryData },
      { name: 'Expense Breakdown', data: categoryData },
    ]);

    showToast({ type: 'success', message: 'Full Multi-Sheet Excel (.xlsx) statement generated!' });
  };

  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  const printAuditStatement = () => {
    printReport(
      <AuditReportPrintable
        pack={pack}
        selectedYear={selectedYear}
        totalRentCollectedMinor={totalRentCollectedMinor}
        totalExpensesMinor={totalExpensesMinor}
        netOperatingIncomeMinor={netOperatingIncomeMinor}
        estimatedWithholdingTaxMinor={estimatedWithholdingTaxMinor}
        paidInvoicesCount={paidInvoices.length}
        expensesCount={expenses.length}
        expensesByCategory={expensesByCategory}
      />
    );
  };

  const handlePrintAudit = () => {
    setIsAuditModalOpen(true);
  };

  return (
    <div className="space-y-8">
      {/* Top Header - hidden during print */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Tax & Financial P&L Statements
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Jurisdiction: <strong>{pack.name}</strong> ({pack.code}) &bull; Currency: <strong>{pack.currency.code} ({pack.currency.symbol})</strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleExportPnLCSV} className="gap-2">
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Excel (.xlsx)</span>
          </Button>
          <Button variant="primary" onClick={handlePrintAudit} className="gap-2 shadow-sm">
            <Printer className="w-4 h-4" />
            <span>Print Audit Statement</span>
          </Button>
        </div>
      </div>

      {/* Audit Content */}
      <div className="space-y-8">
        {/* KPI Cards in Active Pack Currency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="space-y-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Gross Rental Collections
          </span>
          <div className="text-2xl font-black number-tabular text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalRentCollectedMinor, pack)}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] block">
            {paidInvoices.length} Verified settled invoices
          </span>
        </Card>

        <Card className="space-y-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Operating Expenses
          </span>
          <div className="text-2xl font-black number-tabular text-rose-600 dark:text-rose-400">
            {formatMoney(totalExpensesMinor, pack)}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] block">
            {expenses.length} Logged disbursements
          </span>
        </Card>

        <Card className="space-y-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Net Operating Income (NOI)
          </span>
          <div className="text-2xl font-black number-tabular text-[var(--accent)]">
            {formatMoney(netOperatingIncomeMinor, pack)}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] block">
            Rent collected minus operating outgoings
          </span>
        </Card>

        <Card className="space-y-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Statutory Tax Note
          </span>
          <div className="text-xs font-bold text-[var(--text-primary)]">
            {taxNotes.withholdingTaxOnRent
              ? `Estimated Withholding (10%): ${formatMoney(estimatedWithholdingTaxMinor, pack)}`
              : 'Zero Rent Withholding Tax'}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-1">
            {taxNotes.propertyTaxNote}
          </p>
        </Card>
      </div>

      {/* Itemized P&L Ledger Breakdown */}
      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              Annual Profit & Loss Summary ({selectedYear})
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Auditable breakdown aligned with local {pack.name} tenancy reporting requirements
            </p>
          </div>
          <Badge variant="accent">{pack.code} Compliant</Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="py-3.5 px-6">Accounting Line Item</th>
                <th className="py-3.5 px-6">Category Classification</th>
                <th className="py-3.5 px-6 text-right">Debit (Expense)</th>
                <th className="py-3.5 px-6 text-right">Credit (Income)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
              {/* Income Rows */}
              <tr className="h-12 hover:bg-[var(--bg-base)] transition-colors">
                <td className="py-3 px-6 font-semibold text-[var(--text-primary)]">
                  Residential & Commercial Collected Rents
                </td>
                <td className="py-3 px-6 text-xs text-[var(--text-secondary)]">Operating Revenue</td>
                <td className="py-3 px-6 text-right font-mono text-[var(--text-secondary)]">—</td>
                <td className="py-3 px-6 text-right font-mono font-bold number-tabular text-emerald-600">
                  {formatMoney(totalRentCollectedMinor, pack)}
                </td>
              </tr>

              {/* Expense Category Rows */}
              {Object.entries(expensesByCategory).map(([cat, amtMinor]) => (
                <tr key={cat} className="h-12 hover:bg-[var(--bg-base)] transition-colors">
                  <td className="py-3 px-6 text-[var(--text-primary)]">
                    {cat.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </td>
                  <td className="py-3 px-6 text-xs text-[var(--text-secondary)]">Property Outgoings</td>
                  <td className="py-3 px-6 text-right font-mono font-bold number-tabular text-rose-600">
                    {formatMoney(amtMinor, pack)}
                  </td>
                  <td className="py-3 px-6 text-right font-mono text-[var(--text-secondary)]">—</td>
                </tr>
              ))}

              {/* Tax estimation row if applicable */}
              {taxNotes.withholdingTaxOnRent && (
                <tr className="h-12 hover:bg-[var(--bg-base)] transition-colors bg-amber-50/20">
                  <td className="py-3 px-6 text-[var(--text-primary)] italic">
                    Estimated Statutory Withholding Tax (10%)
                  </td>
                  <td className="py-3 px-6 text-xs text-[var(--text-secondary)]">Tax Provisioning</td>
                  <td className="py-3 px-6 text-right font-mono font-bold number-tabular text-amber-600">
                    {formatMoney(estimatedWithholdingTaxMinor, pack)}
                  </td>
                  <td className="py-3 px-6 text-right font-mono text-[var(--text-secondary)]">—</td>
                </tr>
              )}

              {/* Net Operating Income Summary Row */}
              <tr className="h-14 bg-[var(--bg-base)] font-bold">
                <td className="py-4 px-6 text-sm text-[var(--text-primary)]" colSpan={2}>
                  Net Operating Income (NOI)
                </td>
                <td className="py-4 px-6 text-right font-mono text-rose-600">
                  -{formatMoney(totalExpensesMinor, pack)}
                </td>
                <td className="py-4 px-6 text-right font-mono text-base number-tabular text-[var(--accent)]">
                  {formatMoney(netOperatingIncomeMinor, pack)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      </div>

      {/* Audit Statement Preview & Print Modal */}
      <Modal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title={`Audit Statement Preview (CY ${selectedYear})`}
        description="Formal financial P&L statement certified for audit and compliance."
        maxWidth="2xl"
      >
        <div className="space-y-6">
          <div className="print:hidden bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-3 sm:p-6 overflow-x-auto">
            <div className="bg-white text-black border border-gray-200 rounded-lg p-6 sm:p-8 shadow-xs max-w-[760px] mx-auto">
              <AuditReportPrintable
                pack={pack}
                selectedYear={selectedYear}
                totalRentCollectedMinor={totalRentCollectedMinor}
                totalExpensesMinor={totalExpensesMinor}
                netOperatingIncomeMinor={netOperatingIncomeMinor}
                estimatedWithholdingTaxMinor={estimatedWithholdingTaxMinor}
                paidInvoicesCount={paidInvoices.length}
                expensesCount={expenses.length}
                expensesByCategory={expensesByCategory}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)] no-print">
            <Button variant="outline" onClick={() => setIsAuditModalOpen(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={printAuditStatement} className="gap-2">
              <Printer className="w-4 h-4" />
              <span>Print Audit Statement</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
