import React from 'react';
import { Invoice, Payment, Lease, Tenant, Property, Unit, Organization } from '../../db/schema';
import { CountryPack } from '../../countries/types';
import { formatMoney } from '../../lib/money';
import { formatDate } from '../../lib/format';
import { formatInvoiceNumber } from '../../lib/formatNames';
import { printReceiptDocument } from '../../lib/pdf';
import { Printer, X, FileText, CheckCircle2 } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { handlePrint as triggerSystemPrint } from '../../lib/print';

export interface PrintReceiptProps {
  organization: Organization;
  property: Property;
  unit: Unit;
  tenant: Tenant;
  lease: Lease;
  invoice: Invoice;
  payment?: Payment;
  pack: CountryPack;
  onClose: () => void;
}

export const PrintReceipt: React.FC<PrintReceiptProps> = ({
  organization,
  property,
  unit,
  tenant,
  lease,
  invoice,
  payment,
  pack,
  onClose,
}) => {
  const formattedInvoiceNo = formatInvoiceNumber(invoice.id, invoice.period_start);
  const paidDate = payment ? formatDate(payment.paid_at, pack) : formatDate(invoice.due_date, pack);

  const handlePrint = () => {
    triggerSystemPrint();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col items-center overflow-y-auto p-4 sm:p-8 print:static print:inset-auto print:overflow-visible print:block print:p-0 print:bg-white print:z-auto">
      {/* Floating Pill Print Toolbar (no-print) */}
      <div className="no-print sticky top-4 z-50 mb-6 bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--border-strong)] rounded-full px-5 py-2.5 flex items-center justify-between gap-6 modal-shadow max-w-2xl w-full">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="truncate">
            <span className="text-xs font-bold text-[var(--text-primary)] block truncate">
              {formattedInvoiceNo} &bull; {tenant.name}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)] font-mono">
              Ready for Print & PDF Export
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] cursor-pointer"
            title="Close Preview"
          >
            <X className="w-4 h-4" />
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={handlePrint}
            className="h-8 px-4 rounded-full text-xs gap-1.5 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </Button>
        </div>
      </div>

      {/* 800px Paper-Styled Sheet */}
      <div className="print-area print-container w-full max-w-[800px] bg-white text-[#111827] rounded-2xl print:rounded-none paper-shadow p-10 sm:p-12 font-[Inter,system-ui,sans-serif] my-auto space-y-8">
        {/* Header: Company & 32px Prominent INVOICE / RECEIPT Title */}
        <div className="flex justify-between items-start pb-6 border-b border-[#E5E7EB] gap-6">
          {/* Left: Company Details */}
          <div className="space-y-1.5 max-w-[420px]">
            <h1 className="text-2xl font-bold text-[#111827] tracking-tight">
              {organization.name || 'Horizon Property Management'}
            </h1>
            <p className="text-xs text-[#4B5563] leading-relaxed">
              {property.address_line1 || property.address || '1200 Horizon Boulevard, Suite 400'}
            </p>
            <p className="text-xs text-[#6B7280]">
              {property.city ? `${property.city}, ` : ''}{pack.name} &bull; Tenancy Ledger Account
            </p>
          </div>

          {/* Right: Prominent 32px INVOICE Title */}
          <div className="text-right shrink-0 space-y-1">
            <h2 className="text-[32px] font-black text-[#111827] tracking-tight leading-none">
              INVOICE
            </h2>
            <div className="text-sm font-bold font-mono text-[#4F46E5] tracking-tight pt-1">
              {formattedInvoiceNo}
            </div>
            <div className="text-xs text-[#6B7280]">
              Issue Date: <span className="font-semibold text-[#111827]">{paidDate}</span>
            </div>
            <div className="text-xs text-[#6B7280]">
              Due Date: <span className="font-semibold text-[#111827]">{formatDate(invoice.due_date, pack)}</span>
            </div>
          </div>
        </div>

        {/* 2-Column Resident & Premises Grid */}
        <div className="grid grid-cols-2 gap-8 py-2 border-b border-[#E5E7EB]">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider block">
              Billed To (Tenant)
            </span>
            <div className="text-base font-bold text-[#111827]">{tenant.name}</div>
            <div className="text-xs text-[#4B5563]">{tenant.phone} &bull; {tenant.email || 'No email on record'}</div>
            <div className="text-xs text-[#6B7280]">
              ID: {tenant.id_number ? `${tenant.id_type?.toUpperCase() || 'ID'}: ${tenant.id_number}` : tenant.id}
            </div>
          </div>

          <div className="text-right space-y-1">
            <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider block">
              Premises & Unit
            </span>
            <div className="text-base font-bold text-[#111827]">{property.name}</div>
            <div className="text-xs text-[#4B5563]">{unit.name} ({unit.bedrooms} Bed &bull; {unit.bathrooms} Bath)</div>
            <div className="text-xs text-[#6B7280]">
              Period: {formatDate(invoice.period_start, pack)} &rarr; {formatDate(invoice.period_end, pack)}
            </div>
          </div>
        </div>

        {/* Itemized Table with 24px Gap and Solid 2px Black Line above Total */}
        <div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-[#E5E7EB] text-[#6B7280] text-xs font-bold uppercase tracking-wider">
                <th className="py-3.5 pr-6 text-left">Description</th>
                <th className="py-3.5 pl-6 text-right w-48">Amount</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-[#F3F4F6]">
              <tr>
                <td className="py-4 pr-6 text-[#111827]">
                  <span className="font-semibold block text-sm">Monthly Tenancy Rent</span>
                  <span className="text-xs text-[#6B7280]">
                    Period: {formatDate(invoice.period_start, pack)} to {formatDate(invoice.period_end, pack)}
                  </span>
                </td>
                <td className="py-4 pl-6 text-right font-mono font-semibold text-[#111827] tabular-nums whitespace-nowrap">
                  {formatMoney(invoice.subtotal_minor, pack)}
                </td>
              </tr>

              {invoice.late_fee_minor > 0 && (
                <tr>
                  <td className="py-4 pr-6 text-[#B91C1C]">
                    <span className="font-semibold block text-sm">Late Payment Fee</span>
                    <span className="text-xs text-[#6B7280]">Statutory late charge assessed</span>
                  </td>
                  <td className="py-4 pl-6 text-right font-mono font-semibold text-[#B91C1C] tabular-nums whitespace-nowrap">
                    {formatMoney(invoice.late_fee_minor, pack)}
                  </td>
                </tr>
              )}

              {/* Solid 2px Divider Above Total */}
              <tr className="border-t-2 border-[#111827]">
                <td className="pt-5 pb-2 pr-6 text-sm font-bold text-[#111827] uppercase tracking-wide">
                  Total Rent Charged
                </td>
                <td className="pt-5 pb-2 pl-6 text-right text-lg font-black font-mono text-[#111827] tabular-nums whitespace-nowrap">
                  {formatMoney(invoice.total_minor, pack)}
                </td>
              </tr>

              {/* Amount Paid */}
              <tr className="text-[#15803D]">
                <td className="py-2.5 pr-6 text-sm font-bold">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 inline-block text-[#15803D] shrink-0" />
                    <span>Amount Settled ({payment?.method || 'Direct Settlement'})</span>
                  </div>
                </td>
                <td className="py-2.5 pl-6 text-right text-base font-bold font-mono text-[#15803D] tabular-nums whitespace-nowrap">
                  {formatMoney(payment?.amount_minor || invoice.amount_paid_minor, pack)}
                </td>
              </tr>

              {/* Outstanding Balance */}
              <tr className="border-t border-[#E5E7EB] text-xs text-[#6B7280]">
                <td className="py-3 pr-6 font-medium">Remaining Outstanding Balance</td>
                <td className="py-3 pl-6 text-right font-mono font-bold tabular-nums whitespace-nowrap text-[#111827]">
                  {formatMoney(Math.max(0, invoice.total_minor - invoice.amount_paid_minor), pack)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer & Authorized Signatures */}
        <div className="pt-6 border-t border-[#E5E7EB] flex justify-between items-end text-xs text-[#6B7280] gap-6">
          <div className="space-y-1">
            <p className="font-semibold text-[#111827]">Payment Information:</p>
            <p>Method: {payment?.method || 'Bank Transfer / Cash / Check'}</p>
            {payment?.reference && <p>Reference: <span className="font-mono">{payment.reference}</span></p>}
            <p className="text-[11px] text-[#9CA3AF] mt-2">
              Generated by RentFlow Desktop &bull; Non-repudiable audit ledger
            </p>
          </div>

          <div className="text-right shrink-0">
            <div className="w-40 h-12 border-b border-[#9CA3AF] mb-1 flex items-end justify-center">
              <span className="text-[10px] text-[#9CA3AF] italic pb-1">Authorized Signature</span>
            </div>
            <p className="text-[11px] text-[#6B7280] font-medium">Property Manager / Authorized Agent</p>
          </div>
        </div>
      </div>
    </div>
  );
};
