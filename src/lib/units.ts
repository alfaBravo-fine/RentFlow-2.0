/**
 * Section 8.4: Land Area Units & Conversions
 * Conversion factors to square meters (sqm)
 */

export type AreaUnit =
  | 'sqm'
  | 'sqft'
  | 'sqyd'
  | 'marla_pk'
  | 'marla_in'
  | 'kanal_pk'
  | 'kanal_in'
  | 'acre'
  | 'hectare'
  | 'bigha_up'
  | 'bigha_bd';

export const AREA_FACTORS_TO_SQM: Record<AreaUnit, number> = {
  sqm: 1,
  sqft: 0.092903,
  sqyd: 0.836127,
  marla_pk: 25.2929, // Punjab standard: 272.25 sqft
  marla_in: 25.2929, // Same as Pakistan for most states
  kanal_pk: 505.857, // 20 marla
  kanal_in: 505.857,
  acre: 4046.86,
  hectare: 10000,
  bigha_up: 2529.29, // UP standard, 1/5 acre
  bigha_bd: 1337.8,
};

export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  sqm: 'Square Meters (m²)',
  sqft: 'Square Feet (sq ft)',
  sqyd: 'Square Yards (Gaj)',
  marla_pk: 'Marla (Pakistan, 272.25 sqft)',
  marla_in: 'Marla (India)',
  kanal_pk: 'Kanal (Pakistan, 20 Marla)',
  kanal_in: 'Kanal (India)',
  acre: 'Acres',
  hectare: 'Hectares (ha)',
  bigha_up: 'Bigha (Uttar Pradesh)',
  bigha_bd: 'Bigha (Bengal/Bihar)',
};

/**
 * Converts area value between two units, returning rounded to 2 decimal places.
 */
export function convertArea(
  value: number,
  fromUnit: AreaUnit,
  toUnit: AreaUnit
): number {
  if (value === 0 || isNaN(value)) return 0;
  if (fromUnit === toUnit) return Math.round(value * 100) / 100;

  const valueInSqm = value * (AREA_FACTORS_TO_SQM[fromUnit] || 1);
  const targetFactor = AREA_FACTORS_TO_SQM[toUnit] || 1;
  const result = valueInSqm / targetFactor;

  return Math.round(result * 100) / 100;
}
