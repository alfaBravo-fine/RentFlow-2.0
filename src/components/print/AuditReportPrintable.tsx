import React from 'react';
import { CountryPack } from '../../countries/types';
import { formatMoney } from '../../lib/money';

interface AuditReportPrintableProps {
  pack: CountryPack;
  selectedYear: string;
  totalRentCollectedMinor: number;
  totalExpensesMinor: number;
  netOperatingIncomeMinor: number;
  estimatedWithholdingTaxMinor: number;
  paidInvoicesCount: number;
  expensesCount: number;
  expensesByCategory: Record<string, number>;
}

export const AuditReportPrintable: React.FC<AuditReportPrintableProps> = ({
  pack,
  selectedYear,
  totalRentCollectedMinor,
  totalExpensesMinor,
  netOperatingIncomeMinor,
  estimatedWithholdingTaxMinor,
  paidInvoicesCount,
  expensesCount,
  expensesByCategory,
}) => {
  const currentDate = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const documentHash = `${selectedYear}-${pack.code}-AUDIT-${paidInvoicesCount}I-${expensesCount}E`;

  return (
    <div className="print-area bg-white text-black w-full max-w-[800px] mx-auto font-sans p-10 leading-normal space-y-8">
      {/* Header with Emblem and Audit Metadata */}
      <div className="flex items-start justify-between pb-6 border-b-2 border-gray-900 gap-6">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <path d="M3 21h18" />
              <path d="M5 21V7l8-4v18" />
              <path d="M19 21V11l-6-4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-950 uppercase">
              RentFlow Audit Statement
            </h1>
            <p className="text-xs text-gray-600 mt-0.5">
              Official Tax &amp; Financial P&amp;L Statement &middot; Calendar Year {selectedYear}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-600 space-y-0.5">
          <div className="font-bold text-gray-950 text-sm">Official Record</div>
          <div>
            Jurisdiction: {pack.name} ({pack.code})
          </div>
          <div className="tabular-nums">
            Currency: {pack.currency.code} ({pack.currency.symbol})
          </div>
          <div className="tabular-nums">Generated: {currentDate}</div>
        </div>
      </div>

      {/* Executive Summary Strip */}
      <div className="grid grid-cols-4 gap-6 pb-6 border-b border-gray-200">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
            Gross Collections
          </span>
          <div className="text-lg font-bold text-gray-950 mt-1 font-mono tabular-nums">
            {formatMoney(totalRentCollectedMinor, pack)}
          </div>
          <span className="text-[11px] text-gray-500 mt-0.5 block tabular-nums">
            {paidInvoicesCount} settled invoices
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
            Operating Expenses
          </span>
          <div className="text-lg font-bold text-gray-950 mt-1 font-mono tabular-nums">
            {formatMoney(totalExpensesMinor, pack)}
          </div>
          <span className="text-[11px] text-gray-500 mt-0.5 block tabular-nums">
            {expensesCount} logged disbursements
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
            Net Operating Income
          </span>
          <div className="text-lg font-bold text-gray-950 mt-1 font-mono tabular-nums">
            {formatMoney(netOperatingIncomeMinor, pack)}
          </div>
          <span className="text-[11px] text-gray-500 mt-0.5 block">
            Collections less outgoings
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
            Statutory Tax Note
          </span>
          <div className="text-xs font-bold text-gray-950 mt-1 tabular-nums">
            {pack.tax.withholdingTaxOnRent
              ? `Withholding: ${formatMoney(estimatedWithholdingTaxMinor, pack)}`
              : 'Zero Withholding Tax'}
          </div>
          <span className="text-[11px] text-gray-500 mt-0.5 block">
            {pack.tax.propertyTaxNote}
          </span>
        </div>
      </div>

      {/* Itemized P&L Table */}
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-300 text-gray-800 font-bold uppercase text-xs tracking-wider">
            <th className="py-3 pr-4">Accounting Line Item</th>
            <th className="py-3 px-4">Classification</th>
            <th className="py-3 px-4 text-right tabular-nums w-40">Debit (Expense)</th>
            <th className="py-3 pl-4 text-right tabular-nums w-40">Credit (Income)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          <tr>
            <td className="py-3.5 pr-4 font-medium text-gray-900">
              Residential &amp; Commercial Collected Rents
            </td>
            <td className="py-3.5 px-4 text-xs text-gray-600">Operating Revenue</td>
            <td className="py-3.5 px-4 text-right font-mono text-gray-400 tabular-nums">—</td>
            <td className="py-3.5 pl-4 text-right font-mono font-semibold text-gray-950 tabular-nums whitespace-nowrap">
              {formatMoney(totalRentCollectedMinor, pack)}
            </td>
          </tr>

          {Object.entries(expensesByCategory).map(([cat, amtMinor]) => (
            <tr key={cat}>
              <td className="py-3.5 pr-4 text-gray-900">
                {cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </td>
              <td className="py-3.5 px-4 text-xs text-gray-600">Property Outgoings</td>
              <td className="py-3.5 px-4 text-right font-mono font-medium text-rose-700 tabular-nums whitespace-nowrap">
                {formatMoney(amtMinor, pack)}
              </td>
              <td className="py-3.5 pl-4 text-right font-mono text-gray-400 tabular-nums">—</td>
            </tr>
          ))}

          {pack.tax.withholdingTaxOnRent && (
            <tr>
              <td className="py-3.5 pr-4 text-gray-900 italic">
                Estimated Statutory Withholding Tax (10%)
              </td>
              <td className="py-3.5 px-4 text-xs text-gray-600">Tax Provisioning</td>
              <td className="py-3.5 px-4 text-right font-mono font-medium text-gray-900 tabular-nums whitespace-nowrap">
                {formatMoney(estimatedWithholdingTaxMinor, pack)}
              </td>
              <td className="py-3.5 pl-4 text-right font-mono text-gray-400 tabular-nums">—</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-bold text-sm border-t-2 border-gray-900">
            <td className="py-4 pr-4 text-gray-950 uppercase tracking-wide" colSpan={2}>
              Net Operating Income (NOI)
            </td>
            <td className="py-4 px-4 text-right font-mono text-rose-700 tabular-nums whitespace-nowrap">
              -{formatMoney(totalExpensesMinor, pack)}
            </td>
            <td className="py-4 pl-4 text-right font-mono text-base text-gray-950 tabular-nums whitespace-nowrap">
              {formatMoney(netOperatingIncomeMinor, pack)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Certified Footer */}
      <div className="pt-6 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-500">
        <span>RentFlow Property Accounting Suite &middot; Certified Audit Ledger</span>
        <span className="font-mono tabular-nums">Document Hash: {documentHash}</span>
      </div>
    </div>
  );
};
