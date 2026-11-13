import { create } from 'zustand';
import { CountryPack } from './types';
import { getCountryPack, resolvePack, ResolvePackOptions } from './resolver';
import { db } from '../db/client';
import { Organization } from '../db/schema';

interface PackStoreState {
  countryCode: string;
  packVersion: number;
  setCountryCode: (code: string) => void;
  incrementVersion: () => void;
}

export const usePackStore = create<PackStoreState>((set) => {
  // Initialize from db organization or localStorage
  const savedOrg = db.getTable<Organization>('organizations')[0];
  const initialCode =
    savedOrg?.country_code ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('rentflow_active_country_code') : null) ||
    'US';

  return {
    countryCode: initialCode,
    packVersion: 1,
    setCountryCode: (code: string) => {
      const upper = (code || 'US').toUpperCase();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('rentflow_active_country_code', upper);
      }

      // Update in organizations table if exists
      const org = db.getTable<Organization>('organizations')[0];
      if (org) {
        const pack = getCountryPack(upper);
        db.updateItem<Organization>('organizations', org.id, {
          country_code: upper,
          display_currency: pack.currency.code,
          locale: pack.locale,
        });
      }

      set((state) => ({
        countryCode: upper,
        packVersion: state.packVersion + 1,
      }));
    },
    incrementVersion: () =>
      set((state) => ({ packVersion: state.packVersion + 1 })),
  };
});

/**
 * Section 7.3: usePack hook that reactive subscribers consume.
 * Recomputes whenever org.country_code OR country_packs version changes!
 */
export function usePack(opts?: ResolvePackOptions | null): CountryPack {
  const activeCode = usePackStore((s) => s.countryCode);
  const packVersion = usePackStore((s) => s.packVersion);

  const effectiveCode = opts?.countryCode || activeCode;
  return resolvePack({
    countryCode: effectiveCode,
    currencyCode: opts?.currencyCode,
    packVersion: opts?.packVersion ?? packVersion,
  });
}
