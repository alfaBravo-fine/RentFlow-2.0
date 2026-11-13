import { CountryPack } from '../countries/types';
import { getMinorFactor, roundMinor } from './money';

export interface InvoiceLike {
  due_date: string | number | Date;
  subtotal_minor: number;
  total_minor: number;
  amount_paid_minor: number;
  late_fee_minor?: number | null;
}

export interface LeaseLike {
  grace_days?: number | null;
  late_fee_type?: 'flat' | 'percent' | 'none' | null;
  late_fee_value?: number | null; // e.g., $25 or 5%
  rent_minor: number;
}

export interface LateFeeResult {
  feeMinor: number;
  isCharity: boolean;
  reason: string;
}

function toEndOfDayMs(input: string | number | Date): number {
  if (input instanceof Date) {
    return input.getTime();
  }
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return new Date(`${input.trim()}T23:59:59`).getTime();
  }
  return new Date(input).getTime();
}

/**
 * Calculates late fee for an invoice based on lease parameters, country limits, and grace periods.
 * Idempotent: returns 0 if a late fee has already been assessed on the invoice.
 */
export function computeLateFee(
  invoice: InvoiceLike,
  lease: LeaseLike,
  pack: CountryPack,
  today: Date | string | number = new Date()
): LateFeeResult {
  const lateRule = pack.lateFee;

  if (lateRule.allowed === 'no') {
    return { feeMinor: 0, isCharity: false, reason: 'Late fees prohibited by country regulations' };
  }

  if ((invoice.late_fee_minor || 0) > 0) {
    return {
      feeMinor: Math.round(invoice.late_fee_minor || 0),
      isCharity: !!lateRule.islamicFinanceMode,
      reason: 'Late fee already assessed on invoice',
    };
  }

  const dueMs = toEndOfDayMs(invoice.due_date);
  const currentMs = today instanceof Date ? today.getTime() : new Date(today).getTime();

  if (!Number.isFinite(dueMs) || !Number.isFinite(currentMs) || currentMs <= dueMs) {
    return { feeMinor: 0, isCharity: false, reason: 'Invoice not yet overdue' };
  }

  // Grace days check
  const graceDays = Math.max(0, lease.grace_days ?? lateRule.graceDaysDefault ?? 5);
  const graceEndDate = new Date(dueMs);
  graceEndDate.setDate(graceEndDate.getDate() + graceDays);

  if (currentMs <= graceEndDate.getTime()) {
    return { feeMinor: 0, isCharity: false, reason: `Within grace period (${graceDays} days)` };
  }

  // Calculate base fee
  const feeType = lease.late_fee_type || lateRule.type || 'none';
  const feeVal = lease.late_fee_value ?? 0;

  if (feeType === 'none' || feeVal <= 0) {
    return { feeMinor: 0, isCharity: false, reason: 'No late fee configured on lease' };
  }

  const unpaidMinor = Math.max(0, Math.round(invoice.total_minor - invoice.amount_paid_minor));
  if (unpaidMinor <= 0) {
    return { feeMinor: 0, isCharity: false, reason: 'Invoice is fully paid' };
  }

  const factor = getMinorFactor(pack);
  let rawFeeMinor = 0;
  if (feeType === 'flat') {
    rawFeeMinor = Math.round(feeVal * factor);
  } else if (feeType === 'percent') {
    rawFeeMinor = (unpaidMinor * feeVal) / 100;
  }

  // Apply Country Pack Cap (maxValue & maxBasis)
  let clampedFeeMinor = rawFeeMinor;
  if (lateRule.maxValue !== null && lateRule.maxValue !== undefined && lateRule.maxValue > 0) {
    if (lateRule.maxBasis === 'fixed_amount') {
      const capMinor = Math.round(lateRule.maxValue * factor);
      clampedFeeMinor = Math.min(clampedFeeMinor, capMinor);
    } else if (lateRule.maxBasis === 'rent_percentage') {
      const capMinor = (lease.rent_minor * lateRule.maxValue) / 100;
      clampedFeeMinor = Math.min(clampedFeeMinor, capMinor);
    } else if (lateRule.maxBasis === 'annual_interest_cap') {
      const daysOverdue = Math.max(1, Math.floor((currentMs - dueMs) / (1000 * 60 * 60 * 24)));
      const annualInterestCap = (unpaidMinor * (lateRule.maxValue / 100) * daysOverdue) / 365;
      clampedFeeMinor = Math.min(clampedFeeMinor, annualInterestCap);
    }
  }

  const finalFeeMinor = roundMinor(Math.max(0, clampedFeeMinor), pack);
  const isCharity = !!lateRule.islamicFinanceMode;

  return {
    feeMinor: finalFeeMinor,
    isCharity,
    reason: isCharity
      ? 'Late fee accrued under Islamic finance rules (allocated to charity)'
      : `Late fee calculated (${feeType === 'flat' ? 'flat' : feeVal + '%'})`,
  };
}

export const calculateLateFee = computeLateFee;

