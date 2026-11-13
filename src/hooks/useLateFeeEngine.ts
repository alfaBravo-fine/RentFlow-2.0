import { useEffect, useRef } from 'react';
import { db } from '../db/client';
import { Invoice } from '../db/schema';
import { CountryPack } from '../countries/types';
import { getMinorFactor } from '../lib/money';

/**
 * Automated Late Fee Engine
 * Runs on app startup to inspect overdue invoices, applies statutory Country Pack
 * grace periods and late fee structures (flat/percent), and updates invoice totals.
 * Respects Islamic Finance Tenancy Mode (no interest penalties).
 */
export function useLateFeeEngine(pack: CountryPack, onAssessed?: (count: number) => void) {
  const hasExecutedRef = useRef(false);

  useEffect(() => {
    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;

    try {
      const now = Date.now();
      const invoices = db.getTable<Invoice>('invoices');
      const minorMultiplier = getMinorFactor(pack);

      let assessedCount = 0;

      const graceDays = pack.lateFee?.graceDaysDefault ?? 5;
      const graceMs = graceDays * 24 * 60 * 60 * 1000;

      invoices.forEach((inv) => {
        if (inv.deleted_at || (inv as any).deletedAt) return;
        if (inv.status === 'paid' || inv.status === 'voided') return;
        if (!inv.due_date) return;

        const dueMs = new Date(inv.due_date + 'T23:59:59').getTime();
        const isPastDue = now > dueMs;

        if (!isPastDue) return;

        // If unpaid and past due, mark status as overdue if currently 'unpaid'
        if (inv.status === 'unpaid') {
          db.updateItem<Invoice>('invoices', inv.id, { status: 'overdue' });
        }

        // Check if past statutory grace period
        const isPastGrace = now > dueMs + graceMs;
        if (!isPastGrace) return;

        // If late fee already assessed, skip re-assessment (idempotency guard)
        if ((inv.late_fee_minor || 0) > 0) return;

        // Check Country Pack late fee policies
        if (pack.lateFee?.islamicFinanceMode) {
          return;
        }

        if (pack.lateFee?.allowed === 'no') {
          return;
        }

        let feeMinor = 0;
        if (pack.lateFee?.type === 'percent') {
          const pct = pack.lateFee.maxValue || 5;
          feeMinor = Math.round((inv.subtotal_minor * pct) / 100);
        } else {
          const flatMajor = pack.lateFee?.maxValue || (pack.currency.code === 'PKR' ? 1000 : 50);
          feeMinor = Math.round(flatMajor * minorMultiplier);
        }

        if (feeMinor > 0) {
          const updatedTotal = Math.round((inv.total_minor || inv.subtotal_minor) + feeMinor);
          db.updateItem<Invoice>('invoices', inv.id, {
            late_fee_minor: feeMinor,
            total_minor: updatedTotal,
            status: 'overdue',
          });

          db.recordAudit(
            'ASSESS_AUTOMATED_LATE_FEE',
            'invoices',
            inv.id,
            { old_total: inv.total_minor, old_fee: inv.late_fee_minor },
            { new_total: updatedTotal, late_fee_minor: feeMinor, jurisdiction: pack.code }
          );

          assessedCount++;
        }
      });

      if (assessedCount > 0 && onAssessed) {
        onAssessed(assessedCount);
      }
    } catch (err) {
      console.error('[LateFeeEngine] Error processing overdue fees:', err);
    }
  }, [pack, onAssessed]);
}
