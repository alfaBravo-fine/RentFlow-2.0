import { CountryPack } from '../countries/types';
import { roundMinor } from './money';

export interface AccrueDepositInterestParams {
  principalMinor: number;
  pack: CountryPack;
  from: Date | string | number;
  to: Date | string | number;
  referenceRates?: Record<string, number>; // e.g. { "BOE_BASE": 5.25, "ECB_MAIN": 4.5 }
}

/**
 * Calculates interest accrued on a security deposit in accordance with CountryPack regulations.
 * Rule 8.2 & BGB §551 / statutory interest laws.
 */
export function accrueDepositInterest(params: AccrueDepositInterestParams): number {
  const { principalMinor, pack, referenceRates = {} } = params;
  const rule = pack.deposit;

  // Check legal permissions
  if (!rule.interestPermitted || !rule.interestRequired || rule.interestType === 'none') {
    return 0;
  }

  const startDate = new Date(params.from);
  const endDate = new Date(params.to);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
    return 0;
  }

  // Determine effective interest rate percentage
  let annualRatePercent = rule.interestRate;
  if (rule.interestType === 'reference-rate') {
    const refKey = rule.interestReferenceRate || 'BASE';
    const baseRate = referenceRates[refKey] ?? 3.5; // Default fallback reference rate if unprovided
    annualRatePercent = baseRate + (rule.interestMargin || 0);
  }

  if (annualRatePercent === null || annualRatePercent === undefined || annualRatePercent <= 0) {
    return 0;
  }

  const annualRate = annualRatePercent / 100;

  // Calculate day difference
  const diffTime = endDate.getTime() - startDate.getTime();
  const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  const basisDays = rule.dayCountBasis === '360' ? 360 : 365;
  const yearFraction = diffDays / basisDays;

  let accruedMinor = 0;

  if (rule.compounding === 'none') {
    // Simple Interest
    accruedMinor = principalMinor * annualRate * yearFraction;
  } else if (rule.compounding === 'daily') {
    accruedMinor = principalMinor * (Math.pow(1 + annualRate / basisDays, diffDays) - 1);
  } else if (rule.compounding === 'monthly') {
    const months = diffDays / (basisDays / 12);
    accruedMinor = principalMinor * (Math.pow(1 + annualRate / 12, months) - 1);
  } else {
    // Annual compounding
    accruedMinor = principalMinor * (Math.pow(1 + annualRate, yearFraction) - 1);
  }

  return roundMinor(accruedMinor, pack);
}
