import { CountryPack } from './types';
import USPack from './packs/US.json';
import GBPack from './packs/GB.json';
import DEPack from './packs/DE.json';
import AUPack from './packs/AU.json';
import INPack from './packs/IN.json';
import PKPack from './packs/PK.json';
import AEPack from './packs/AE.json';
import JPPack from './packs/JP.json';
import KWPack from './packs/KW.json';

const COUNTRY_PACKS: Record<string, CountryPack> = {
  US: USPack as unknown as CountryPack,
  GB: GBPack as unknown as CountryPack,
  DE: DEPack as unknown as CountryPack,
  AU: AUPack as unknown as CountryPack,
  IN: INPack as unknown as CountryPack,
  PK: PKPack as unknown as CountryPack,
  AE: AEPack as unknown as CountryPack,
  JP: JPPack as unknown as CountryPack,
  KW: KWPack as unknown as CountryPack,
};

export function getCountryPack(code: string): CountryPack {
  const normalized = (code || 'US').toUpperCase();
  return COUNTRY_PACKS[normalized] || COUNTRY_PACKS.US;
}

export function listAllPacks(): CountryPack[] {
  return Object.values(COUNTRY_PACKS);
}

export const AVAILABLE_PACKS = listAllPacks();

export interface ResolvePackOptions {
  countryCode?: string | null;
  currencyCode?: string | null;
  packVersion?: number | null;
}

/**
 * Resolves the appropriate CountryPack while preserving frozen currency rules.
 * Rule 11: Country pack defaults only affect NEW records.
 * Existing invoices, payments, and leases keep their frozen currency_code and pack_version.
 */
export function resolvePack(opts?: ResolvePackOptions | null): CountryPack {
  const basePack = getCountryPack(opts?.countryCode || 'US');

  // If a frozen currency code is specified on an invoice/payment/lease that differs
  // from the base pack's default currency, return a mutated pack copy with the overridden currency code.
  if (opts?.currencyCode && opts.currencyCode !== basePack.currency.code) {
    const overrideCode = opts.currencyCode.toUpperCase();
    // Check if another pack uses this currency to inherit correct minorUnits
    const matchingPack = Object.values(COUNTRY_PACKS).find((p) => p.currency.code === overrideCode);
    
    return {
      ...basePack,
      currency: matchingPack
        ? { ...matchingPack.currency }
        : {
            ...basePack.currency,
            code: overrideCode,
            symbol: overrideCode === 'EUR' ? '€' : overrideCode === 'GBP' ? '£' : '$',
          },
    };
  }

  return basePack;
}
