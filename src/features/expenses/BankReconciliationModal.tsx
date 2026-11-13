import React, { useState } from 'react';
import { db } from '../../db/client';
import { Tenant, Invoice, Lease, Property, Unit } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney, parseMajorToMinor } from '../../lib/money';
import { useToast } from '../../components/toast/ToastContext';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  RefreshCw,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  Search,
  Check,
} from '../../components/icons';

interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number; // in major units
  matchedTenant?: Tenant;
  matchedInvoice?: Invoice;
  confidenceScore: number; // 0 - 100
  isReconciled: boolean;
}

interface BankReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReconciled?: () => void;
}

export const BankReconciliationModal: React.FC<BankReconciliationModalProps> = ({
  isOpen,
  onClose,
  onReconciled,
}) => {
  const pack = usePack();
  const { showToast } = useToast();

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Queries
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at && !(t as any).deletedAt);
  const leases = db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt);
  const invoices = db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt);

  // Auto-Match Engine
  const matchTransactions = (rawTxs: Array<{ id: string; date: string; description: string; amount: number }>) => {
    const matched: BankTransaction[] = rawTxs.map((tx) => {
      const cleanDesc = tx.description.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
      let bestTenant: Tenant | undefined = undefined;
      let bestInvoice: Invoice | undefined = undefined;
      let highestScore = 0;

      tenants.forEach((tenant) => {
        const nameTokens = tenant.name.toLowerCase().split(/\s+/).filter(Boolean);
        let tokenMatches = 0;

        nameTokens.forEach((tok) => {
          if (tok.length > 2 && cleanDesc.includes(tok)) {
            tokenMatches++;
          }
        });

        if (tokenMatches > 0) {
          let score = Math.round((tokenMatches / nameTokens.length) * 75);

          // Find unpaid or partially paid invoice for this tenant
          const tenantLeases = leases.filter((l) => l.tenant_id === tenant.id);
          const tenantLeaseIds = tenantLeases.map((l) => l.id);
          const tenantInvoices = invoices.filter(
            (inv) => tenantLeaseIds.includes(inv.lease_id) && inv.status !== 'paid' && inv.status !== 'voided'
          );

          // Amount matching bonus
          const txMinor = parseMajorToMinor(tx.amount, pack);
          const exactInvoice = tenantInvoices.find(
            (inv) => Math.abs((inv.total_minor - inv.amount_paid_minor) - txMinor) < 5
          );

          if (exactInvoice) {
            score = 99; // Exact tenant and exact unpaid invoice amount match!
            bestInvoice = exactInvoice;
          } else if (tenantInvoices.length > 0) {
            score = Math.min(score + 15, 88);
            bestInvoice = tenantInvoices[0];
          }

          if (score > highestScore) {
            highestScore = score;
            bestTenant = tenant;
          }
        }
      });

      return {
        ...tx,
        matchedTenant: bestTenant,
        matchedInvoice: bestInvoice,
        confidenceScore: highestScore,
        isReconciled: false,
      };
    });

    setTransactions(matched);
  };

  const handleLoadSampleStatement = () => {
    const sampleTenant = tenants[0];
    const sampleTenant2 = tenants[1];
    const sampleName1 = sampleTenant ? sampleTenant.name.toUpperCase() : 'SARAH JENKINS';
    const sampleName2 = sampleTenant2 ? sampleTenant2.name.toUpperCase() : 'DAVID VANCE';

    const raw = [
      {
        id: 'tx-1',
        date: new Date().toISOString().slice(0, 10),
        description: `ACH CREDIT - DIRECT DEP RENT ${sampleName1} WEB_PAY`,
        amount: 1850.0,
      },
      {
        id: 'tx-2',
        date: new Date().toISOString().slice(0, 10),
        description: `INCOMING WIRE TRANSFER - ${sampleName2} MONTHLY RENT`,
        amount: 2200.0,
      },
      {
        id: 'tx-3',
        date: new Date().toISOString().slice(0, 10),
        description: 'ONLINE BANKING TRANSFER - UNKNOWN REF #993182',
        amount: 750.0,
      },
    ];

    matchTransactions(raw);
    showToast({ type: 'info', message: 'Loaded sample bank statement with auto-matching' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          throw new Error('CSV must contain a header row and data rows.');
        }

        const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/["']/g, ''));
        const dateIdx = headers.findIndex((h) => h.includes('date'));
        const descIdx = headers.findIndex((h) => h.includes('desc') || h.includes('memo') || h.includes('narrative'));
        const amtIdx = headers.findIndex((h) => h.includes('amount') || h.includes('credit') || h.includes('deposit'));

        if (descIdx === -1 || amtIdx === -1) {
          throw new Error('CSV must contain at least "Description" and "Amount" columns.');
        }

        const parsedTxs: Array<{ id: string; date: string; description: string; amount: number }> = [];

        lines.slice(1).forEach((line, idx) => {
          const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
          const desc = cols[descIdx];
          const rawAmt = parseFloat(cols[amtIdx]?.replace(/[^0-9.-]/g, '') || '0');
          const date = dateIdx !== -1 ? cols[dateIdx] : new Date().toISOString().slice(0, 10);

          if (desc && rawAmt > 0) {
            parsedTxs.push({
              id: `csv-${idx}-${Date.now()}`,
              date: date || new Date().toISOString().slice(0, 10),
              description: desc,
              amount: rawAmt,
            });
          }
        });

        matchTransactions(parsedTxs);
        showToast({ type: 'success', message: `Parsed & auto-matched ${parsedTxs.length} bank statement rows!` });
      } catch (err: any) {
        showToast({ type: 'error', message: err.message || 'Failed to parse CSV statement.' });
      } finally {
        setIsProcessing(false);
        e.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  const handleReconcileSingle = (tx: BankTransaction) => {
    if (!tx.matchedInvoice && !tx.matchedTenant) {
      showToast({ type: 'error', message: 'No tenant matched for this transaction' });
      return;
    }

    const paymentAmountMinor = parseMajorToMinor(tx.amount, pack);

    try {
      if (tx.matchedInvoice) {
        db.recordInvoicePayment(
          tx.matchedInvoice.id,
          paymentAmountMinor,
          'bank_transfer',
          `RECON-${tx.id.slice(-6)}`
        );
      } else if (tx.matchedTenant) {
        // Allocate to tenant's active lease
        const lease = leases.find((l) => l.tenant_id === tx.matchedTenant?.id);
        if (lease) {
          db.allocatePayment(lease.id, paymentAmountMinor, 'bank_transfer', `RECON-${tx.id.slice(-6)}`);
        }
      }

      setTransactions((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, isReconciled: true } : t))
      );

      showToast({
        type: 'success',
        message: `Reconciled! ${formatMoney(paymentAmountMinor, pack)} recorded for ${tx.matchedTenant?.name || 'Tenant'}`,
      });

      if (onReconciled) onReconciled();
    } catch (err: any) {
      showToast({ type: 'error', message: err.message || 'Reconciliation failed.' });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bank Statement Reconciliation & Auto-Match Engine"
      description="Upload your banking CSV statement. Fuzzy string matching automatically attributes incoming deposits to active tenants and unpaid rent invoices."
      maxWidth="4xl"
    >
      <div className="space-y-6">
        {/* Upload & Sample Statement Controls */}
        <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)]">
              Import Bank Statement (CSV)
            </h4>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Supports statements with Date, Description / Memo, and Credit / Deposit Amount columns.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleLoadSampleStatement} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Load Sample Statement</span>
            </Button>

            <label className="inline-flex cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="hidden"
              />
              <span className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Processing...' : 'Upload Statement (.csv)'}</span>
              </span>
            </label>
          </div>
        </div>

        {/* Matched Transactions Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              Statement Transactions ({transactions.length})
            </span>
            {transactions.length > 0 && (
              <span className="text-xs text-[var(--text-secondary)]">
                {transactions.filter((t) => t.isReconciled).length} of {transactions.length} reconciled
              </span>
            )}
          </div>

          {transactions.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]">
              <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-40 text-emerald-600" />
              <span>Upload a bank statement CSV or click "Load Sample Statement" to review automated tenant matches.</span>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--bg-base)] text-[var(--text-secondary)] uppercase">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Bank Description</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Deposit</th>
                    <th className="py-2.5 px-3 font-semibold">Matched Tenant</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Confidence</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-[var(--bg-surface-sunken)] transition-colors">
                      <td className="py-3 px-3 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="py-3 px-3 font-medium text-[var(--text-primary)] max-w-xs truncate">
                        {tx.description}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-600 text-right whitespace-nowrap">
                        {formatMoney(parseMajorToMinor(tx.amount, pack), pack)}
                      </td>
                      <td className="py-3 px-3">
                        {tx.matchedTenant ? (
                          <div>
                            <span className="font-bold text-[var(--text-primary)] block">
                              {tx.matchedTenant.name}
                            </span>
                            {tx.matchedInvoice && (
                              <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                                Invoice #{tx.matchedInvoice.id.slice(-6)} ({formatMoney(tx.matchedInvoice.total_minor - tx.matchedInvoice.amount_paid_minor, pack)} due)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">No match found</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {tx.confidenceScore >= 90 ? (
                          <Badge variant="success">{tx.confidenceScore}% Exact</Badge>
                        ) : tx.confidenceScore >= 70 ? (
                          <Badge variant="warning">{tx.confidenceScore}% Probable</Badge>
                        ) : (
                          <Badge variant="neutral">No Match</Badge>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {tx.isReconciled ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Settled</span>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!tx.matchedTenant}
                            onClick={() => handleReconcileSingle(tx)}
                            className="h-7 text-xs px-2.5 gap-1 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <Check className="w-3 h-3" />
                            <span>1-Click Reconcile</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <div className="text-[11px] text-[var(--text-secondary)]">
            Automatically applies payments to tenant accounts using FIFO allocation.
          </div>
        </div>
      </div>
    </Modal>
  );
};
