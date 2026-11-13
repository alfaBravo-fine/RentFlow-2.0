import { db } from '../db/client';
import { Invoice, Lease } from '../db/schema';
import { resolvePack } from '../countries/resolver';
import { computeLateFee } from './lateFee';

/**
 * Scans all active/unpaid invoices, assesses statutory late fees if past grace period,
 * and updates invoice totals and status automatically.
 */
export function runLateFeeEngine(): { assessedCount: number; totalFeeAddedMinor: number } {
  try {
    const invoices = db.getTable<Invoice>('invoices');
    const leases = db.getTable<Lease>('leases');
    const pack = resolvePack();
    const now = new Date();

    let assessedCount = 0;
    let totalFeeAddedMinor = 0;

    for (const inv of invoices) {
      if (inv.status === 'paid' || inv.status === 'voided') continue;
      if (inv.deleted_at || (inv as any).deletedAt) continue;

      const lease = leases.find((l) => l.id === inv.lease_id);
      if (!lease) continue;

      const alreadyHasFee = (inv.late_fee_minor || 0) > 0;
      const feeRes = alreadyHasFee
        ? { feeMinor: 0, isCharity: false, reason: 'Already assessed' }
        : computeLateFee(inv, lease, pack, now);

      if (!alreadyHasFee && feeRes.feeMinor > 0) {
        const feeToAdd = Math.round(feeRes.feeMinor);
        const newTotal = Math.round((inv.total_minor || inv.subtotal_minor) + feeToAdd);

        db.updateItem<Invoice>('invoices', inv.id, {
          late_fee_minor: feeToAdd,
          total_minor: newTotal,
          status: 'overdue',
        });

        db.recordAudit(
          'AUTO_LATE_FEE_APPLIED',
          'invoices',
          inv.id,
          { old_late_fee: inv.late_fee_minor || 0, old_total: inv.total_minor },
          { new_late_fee: feeToAdd, new_total: newTotal, reason: feeRes.reason, isCharity: feeRes.isCharity }
        );

        assessedCount++;
        totalFeeAddedMinor += feeToAdd;
      } else if (inv.status !== 'overdue' && inv.due_date) {
        const dueMs = /^\d{4}-\d{2}-\d{2}$/.test(inv.due_date)
          ? new Date(`${inv.due_date}T23:59:59`).getTime()
          : new Date(inv.due_date).getTime();
        const graceDays = Math.max(0, lease.grace_days ?? pack.lateFee.graceDaysDefault ?? 5);
        const graceEnd = new Date(dueMs);
        graceEnd.setDate(graceEnd.getDate() + graceDays);

        if (now.getTime() > graceEnd.getTime()) {
          db.updateItem<Invoice>('invoices', inv.id, {
            status: 'overdue',
          });
        }
      }
    }

    return { assessedCount, totalFeeAddedMinor };
  } catch (err) {
    console.error('Error running automated late fee engine:', err);
    return { assessedCount: 0, totalFeeAddedMinor: 0 };
  }
}

/**
 * Initializes the background scheduled job that runs on app boot and every 24 hours.
 */
export function initAutomatedLateFeeSchedule(): () => void {
  // Run on start
  runLateFeeEngine();

  // Run every 24 hours (86,400,000 ms)
  const intervalId = setInterval(() => {
    runLateFeeEngine();
  }, 24 * 60 * 60 * 1000);

  return () => clearInterval(intervalId);
}
