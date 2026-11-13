import React from 'react';
import { Owner, Property } from '../../db/schema';
import { CountryPack } from '../../countries/types';
import { formatMoney } from '../../lib/money';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Printer } from '../../components/icons';
import { handlePrint } from '../../lib/print';

export interface OwnerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgName: string;
  owner: Owner | null;
  statementMonth: string;
  onChangeStatementMonth?: (month: string) => void;
  ownerProps: Property[];
  rentCollectedMinor: number;
  commissionMinor: number;
  totalExpensesMinor: number;
  netPayoutMinor: number;
  pack: CountryPack;
  onPrintStatement: () => void;
}

export const OwnerStatementModal: React.FC<OwnerStatementModalProps> = ({
  isOpen,
  onClose,
  orgName,
  owner,
  statementMonth,
  onChangeStatementMonth,
  ownerProps,
  rentCollectedMinor,
  commissionMinor,
  totalExpensesMinor,
  netPayoutMinor,
  pack,
  onPrintStatement,
}) => {
  if (!owner) return null;

  const issueDate = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const verificationRef = `${owner.id.slice(0, 8).toUpperCase()}-${statementMonth}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Owner Disbursement Statement"
      description="Formal monthly rental revenue, management commission, and net payout ledger."
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Document Preview Stage */}
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-3 sm:p-6 print:hidden">
          {/* White A4 Paper Container - print:hidden so only #print-root is sent to printer */}
          <div className="flex flex-col bg-white text-black border border-gray-200 rounded-lg p-8 sm:p-10 shadow-xs space-y-6 max-w-[720px] mx-auto break-words">
            {/* Institutional Letterhead */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b-2 border-gray-900">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                    aria-hidden="true"
                  >
                    <path d="M3 21h18" />
                    <path d="M5 21V7l8-4v18" />
                    <path d="M19 21V11l-6-4" />
                    <path d="M9 9v.01" />
                    <path d="M9 12v.01" />
                    <path d="M9 15v.01" />
                    <path d="M9 18v.01" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-gray-950">
                    {orgName || 'Horizon Property Management'}
                  </h3>
                  <p className="text-xs font-bold text-gray-900 mt-0.5 leading-relaxed">
                    Owner Disbursement Statement
                  </p>
                  <p className="text-xs text-gray-500 mt-1 tabular-nums leading-relaxed">
                    Period: {statementMonth}
                  </p>
                </div>
              </div>

              <div className="sm:text-right space-y-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                  Prepared For
                </span>
                <div className="text-base font-bold text-gray-950">{owner.name}</div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {owner.payout_details || 'ACH Direct Bank Transfer'}
                </p>
                <p className="text-xs text-gray-500 tabular-nums pt-0.5 leading-relaxed">
                  Issued: {issueDate}
                </p>
              </div>
            </div>

            {/* Portfolio Scope Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6 border-b border-gray-200 text-xs">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                  Property Ownership Summary
                </span>
                <span className="text-sm font-bold text-gray-900 mt-1 block break-words leading-relaxed">
                  {ownerProps.map((p) => p.name).join(', ') || 'All Assigned Portfolio Units'}
                </span>
              </div>
              <div className="sm:text-right">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                  Jurisdiction
                </span>
                <span className="text-sm font-bold text-gray-900 mt-1 block leading-relaxed">
                  {pack.name} ({pack.code})
                </span>
              </div>
            </div>

            {/* Itemized Accounting Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-xs font-bold uppercase tracking-wider text-gray-800">
                    <th className="py-2.5 px-3 font-bold">Accounting Line Item</th>
                    <th className="py-2.5 px-3 font-bold">Calculation Basis</th>
                    <th className="py-2.5 px-3 text-right tabular-nums w-44 font-bold">
                      Amount ({pack.currency.code})
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-gray-900">
                      Gross Rental Revenue Collected
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-500">
                      {ownerProps.length} active {ownerProps.length === 1 ? 'property' : 'properties'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-950 tabular-nums whitespace-nowrap">
                      +{formatMoney(rentCollectedMinor, pack)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 px-3 font-bold text-gray-900">
                      Agency Management Commission
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-500">
                      {owner.commission_type === 'percentage'
                        ? `${owner.commission_value}% of gross collections`
                        : 'Flat monthly management retainer'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700 tabular-nums whitespace-nowrap">
                      -{formatMoney(commissionMinor, pack)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 px-3 font-bold text-gray-900">
                      Property Repairs &amp; Operating Expenses
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-500">
                      Approved maintenance &amp; operating outlays
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700 tabular-nums whitespace-nowrap">
                      -{formatMoney(totalExpensesMinor, pack)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t-[3px] border-black bg-gray-50/60">
                    <td
                      colSpan={2}
                      className="py-4 px-3 text-sm font-bold uppercase tracking-wide text-gray-950"
                    >
                      Total Net Owner Disbursement
                    </td>
                    <td className="py-4 px-3 text-right font-mono text-base font-bold text-gray-950 tabular-nums whitespace-nowrap">
                      {formatMoney(netPayoutMinor, pack)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Authorization & Ledger Footer */}
            <div className="pt-4 border-t border-gray-200 text-xs text-gray-600 space-y-1.5 break-words">
              <div className="font-bold text-gray-900">
                Disbursement Authorization &amp; Trust Account Policy
              </div>
              <p className="leading-relaxed">
                Funds are held in a designated trust account and disbursed strictly in accordance with approved property management agreement instructions to{' '}
                <strong className="text-gray-900 font-bold">
                  {owner.payout_details || 'registered direct deposit instructions'}
                </strong>
                .
              </p>
              <div className="pt-2 flex items-center justify-end text-[11px] text-gray-500">
                <span className="font-mono tabular-nums font-semibold">Verification Ref: {verificationRef}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="no-print flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-[var(--border-subtle)]">
          {onChangeStatementMonth ? (
            <div className="flex items-center gap-2">
              <label
                htmlFor="owner-statement-month"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                Statement Period
              </label>
              <input
                id="owner-statement-month"
                type="month"
                value={statementMonth}
                onChange={(e) => onChangeStatementMonth(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)] tabular-nums focus-ring"
              />
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3 ml-auto">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={onPrintStatement}
              className="gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Print Formal Statement</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
