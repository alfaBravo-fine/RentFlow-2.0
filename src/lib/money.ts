import { CountryPack } from '../countries/types';

const CURRENCY_MINOR_UNITS_MAP: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AUD: 2,
  CAD: 2,
  INR: 2,
  PKR: 2,
  AED: 2,
  SAR: 2,
};

/**
 * Resolves the minor-unit decimal precision for a CountryPack, ISO currency code, or explicit integer count.
 */
export function getCurrencyMinorUnits(packOrCurrency?: CountryPack | string | number | null): number {
  if (typeof packOrCurrency === 'number' && Number.isFinite(packOrCurrency)) {
    return Math.max(0, Math.min(4, Math.trunc(packOrCurrency)));
  }
  if (typeof packOrCurrency === 'string' && packOrCurrency.trim().length > 0) {
    const upper = packOrCurrency.trim().toUpperCase();
    return CURRENCY_MINOR_UNITS_MAP[upper] ?? 2;
  }
  if (packOrCurrency && typeof packOrCurrency === 'object' && 'currency' in packOrCurrency) {
    const units = packOrCurrency.currency?.minorUnits;
    if (typeof units === 'number' && Number.isFinite(units)) {
      return Math.max(0, Math.min(4, Math.trunc(units)));
    }
    if (packOrCurrency.currency?.code) {
      return CURRENCY_MINOR_UNITS_MAP[packOrCurrency.currency.code.toUpperCase()] ?? 2;
    }
  }
  return 2;
}

/**
 * Returns 10^minorUnits (e.g., 100 for USD/PKR, 1 for JPY, 1000 for KWD).
 */
export function getMinorFactor(packOrCurrency?: CountryPack | string | number | null): number {
  return Math.pow(10, getCurrencyMinorUnits(packOrCurrency));
}

/**
 * Parses a major currency string or number into exact integer minor units without
 * binary IEEE-754 floating-point multiplication errors (e.g., '19.99' -> 1999).
 */
export function parseMajorToMinor(
  majorInput: string | number | null | undefined,
  packOrCurrency?: CountryPack | string | number | null
): number {
  if (majorInput === null || majorInput === undefined) return 0;
  const minorUnits = getCurrencyMinorUnits(packOrCurrency);

  const rawStr = typeof majorInput === 'number'
    ? (Number.isFinite(majorInput) ? majorInput.toString() : '0')
    : String(majorInput).trim().replace(/,/g, '');

  if (!rawStr) return 0;

  const isNegative = rawStr.startsWith('-');
  const unsigned = rawStr.replace(/^[+-]/, '');
  if (!/^\d*(\.\d*)?$/.test(unsigned)) {
    const fallback = Number(rawStr);
    if (!Number.isFinite(fallback)) return 0;
    return Math.round(fallback * Math.pow(10, minorUnits));
  }

  const [wholePartRaw = '0', fracPartRaw = ''] = unsigned.split('.');
  const wholePart = wholePartRaw === '' ? '0' : wholePartRaw;
  const paddedFrac = (fracPartRaw + '0'.repeat(minorUnits + 2)).slice(0, minorUnits);
  const nextDigit = Number((fracPartRaw + '0'.repeat(minorUnits + 2)).charAt(minorUnits) || '0');

  let magnitude = Number(wholePart) * Math.pow(10, minorUnits) + Number(paddedFrac || '0');
  if (nextDigit >= 5) {
    magnitude += 1;
  }

  return isNegative ? -magnitude : magnitude;
}

/**
 * Converts major currency unit (e.g., $10.50) to integer minor unit (e.g., 1050 cents).
 * Never stores money as float in database rows.
 */
export function toMinor(
  major: number,
  packOrCurrency?: CountryPack | string | number | null
): number {
  if (!Number.isFinite(major)) return 0;
  return parseMajorToMinor(major, packOrCurrency);
}

/**
 * Converts integer minor unit (e.g., 1050) back to major currency unit (e.g., 10.50).
 */
export function toMajor(
  minor: number,
  packOrCurrency?: CountryPack | string | number | null
): number {
  if (!Number.isFinite(minor)) return 0;
  const units = getCurrencyMinorUnits(packOrCurrency);
  const factor = Math.pow(10, units);
  return Math.round(minor) / factor;
}

/**
 * Converts integer minor units to an exact rounded major number for numeric inputs / CSV / Excel cells.
 */
export function minorToMajorNumber(
  minor: number,
  packOrCurrency?: CountryPack | string | number | null
): number {
  const units = getCurrencyMinorUnits(packOrCurrency);
  const major = toMajor(minor, units);
  return Number(major.toFixed(units));
}

/**
 * Round a number to the pack's minor unit precision using half-up method.
 */
export function roundMinor(val: number, _pack?: CountryPack): number {
  return Number.isFinite(val) ? Math.round(val) : 0;
}

/**
 * Converts minor amount from one currency to another using an FX rate.
 * Rounds to destination currency's minor units.
 */
export function convertMinor(
  amountMinor: number,
  fromPack: CountryPack,
  toPack: CountryPack,
  rate: number
): number {
  const fromMajor = toMajor(amountMinor, fromPack);
  const convertedMajor = fromMajor * rate;
  return toMinor(convertedMajor, toPack);
}

/**
 * Formats integer minor units into a human-readable string based on CountryPack currency settings.
 * Supports:
 * - JPY: 0 decimals (e.g., ¥150,000)
 * - KWD: 3 decimals (e.g., KWD 1,250.500)
 * - INR: Indian grouping system (e.g., ₹1,50,000.00)
 * - Standard USD/EUR/GBP (e.g., $1,500.00 / 1.500,00 €)
 */
export function formatMoney(minor: number, pack: CountryPack): string {
  const safeMinor = Number.isFinite(minor) ? Math.round(minor) : 0;
  const major = toMajor(safeMinor, pack);
  const decimals = pack.currency.minorUnits;

  const formattedNumber = new Intl.NumberFormat(pack.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(Math.abs(major));

  const symbol = pack.currency.symbol;
  const isNegative = safeMinor < 0;
  const prefix = isNegative ? '-' : '';

  const result =
    pack.currency.symbolPosition === 'before'
      ? `${prefix}${symbol} ${formattedNumber}`
      : `${prefix}${formattedNumber} ${symbol}`;

  return result.trim();
}
