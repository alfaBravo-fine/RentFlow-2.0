// Mock localStorage for Node test runner
const storageMap = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageMap.get(key) || null,
    setItem: (key: string, val: string) => storageMap.set(key, String(val)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    get length() {
      return storageMap.size;
    },
    key: (i: number) => Array.from(storageMap.keys())[i] || null,
  };
}

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/db/client';
import {
  collectAppSettings,
  collectAppTheme,
  applyRestoredSettingsAndThemes,
  FullBackupPayload,
  APP_DATA_BACKUP_FILENAME,
} from '../../src/lib/googleDriveService';
import { encryptWithGoogleId, decryptWithGoogleId } from '../../src/lib/driveCrypto';
import { useThemeStore } from '../../src/stores/themeStore';
import { usePackStore } from '../../src/countries/usePack';
import { useUIStore } from '../../src/stores/uiStore';
import { useAppSettingsStore } from '../../src/stores/appSettingsStore';
import { Property, Unit, Tenant, Lease, Invoice, Payment, Expense, Vendor } from '../../src/db/schema';

describe('Comprehensive Google Drive Backup and Restore (RentFlow_FullBackup.enc)', () => {
  const testGoogleId = 'google_user_sub_987654321';

  beforeEach(() => {
    localStorage.clear();
    useAppSettingsStore.getState().resetSettings();
    usePackStore.getState().setCountryCode('US');
    useUIStore.getState().setUILayout('sidebar');
    useThemeStore.getState().setTheme({ mode: 'light', colorPalette: 'classic' });
  });

  it('uses RentFlow_FullBackup.enc as the standard backup filename', () => {
    expect(APP_DATA_BACKUP_FILENAME).toBe('RentFlow_FullBackup.enc');
  });

  it('collects and restores full theme and settings state', () => {
    // Set custom theme and settings through centralized Zustand stores
    useThemeStore.getState().setTheme({ mode: 'dark', colorPalette: 'midnight' });
    usePackStore.getState().setCountryCode('PK');
    useUIStore.getState().setUILayout('top-tabs');
    useAppSettingsStore.getState().applySettingsSnapshot({
      exportDestination: '/custom/exports/rentflow',
      autoSyncEnabled: true,
      agencyCommissionPct: 12,
      maintenanceApprovalThresholdMinor: 75000,
    });

    const theme = collectAppTheme();
    expect(theme.mode).toBe('dark');
    expect(theme.colorPalette).toBe('midnight');

    const settings = collectAppSettings();
    expect(settings.countryCode).toBe('PK');
    expect(settings.exportDestination).toBe('/custom/exports/rentflow');
    expect(settings.agencyCommissionPct).toBe(12);
    expect(settings.maintenanceApprovalThresholdMinor).toBe(75000);
    expect(settings.uiLayout).toBe('top-tabs');

    // Test restoring settings & themes on a fresh device
    localStorage.clear();
    useAppSettingsStore.getState().resetSettings();
    applyRestoredSettingsAndThemes({
      themes: { mode: 'dark', colorPalette: 'slate_emerald' },
      settings: {
        countryCode: 'GB',
        exportDestination: '/restored/path',
        agencyCommissionPct: 10,
        maintenanceApprovalThresholdMinor: 100000,
        uiLayout: 'sidebar',
      },
    });

    const activeTheme = useThemeStore.getState().theme;
    expect(activeTheme.mode).toBe('dark');
    expect(activeTheme.colorPalette).toBe('slate_emerald');
    expect(usePackStore.getState().countryCode).toBe('GB');
    expect(useUIStore.getState().uiLayout).toBe('sidebar');
    expect(useAppSettingsStore.getState().exportDestination).toBe('/restored/path');
    expect(useAppSettingsStore.getState().agencyCommissionPct).toBe(10);
    expect(useAppSettingsStore.getState().maintenanceApprovalThresholdMinor).toBe(100000);
  });

  it('wipes local database and repopulates all tables from full backup state', async () => {
    // 1. Seed some initial local data that will be wiped
    db.insertItem<Property>('properties', {
      id: 'old_prop_1',
      org_id: 'org_1',
      name: 'Old Property To Be Wiped',
      address_line1: '123 Old St',
      address_line2: null,
      city: 'Old City',
      region: 'CA',
      postal_code: '90001',
      country_code: 'US',
      type: 'residential_apartment',
      latitude: 34.05,
      longitude: -118.25,
    });

    expect(db.getTable('properties').length).toBeGreaterThan(0);

    // 2. Prepare comprehensive full-backup payload
    const mockBackupPayload: FullBackupPayload = {
      app: 'RentFlow',
      version: '2.0.0',
      backupType: 'full_application_state',
      exportedAt: new Date().toISOString(),
      userId: testGoogleId,
      userEmail: 'landlord@rentflow.dev',
      tables: {
        properties: [
          {
            id: 'restored_prop_1',
            org_id: 'org_1',
            name: 'Sunset Heights Apartments',
            address_line1: '789 Sunset Blvd',
            address_line2: null,
            city: 'Los Angeles',
            region: 'CA',
            postal_code: '90028',
            country_code: 'US',
            type: 'residential_apartment',
            latitude: 34.098,
            longitude: -118.32,
          },
        ],
        units: [
          {
            id: 'restored_unit_1',
            property_id: 'restored_prop_1',
            unit_number: 'Penthouse A',
            floor: 10,
            size_sqft: 1800,
            market_rent_minor: 450000,
            status: 'occupied',
            bedrooms: 3,
            bathrooms: 2,
          },
        ],
        tenants: [
          {
            id: 'restored_tenant_1',
            org_id: 'org_1',
            name: 'Sarah Connor',
            email: 'sarah@skynet.res',
            phone: '+1 555-0192',
            id_type: 'Passport',
            id_number: 'USA-998877',
            emergency_contact: 'John Connor',
            occupants: 2,
          },
        ],
        leases: [
          {
            id: 'restored_lease_1',
            org_id: 'org_1',
            unit_id: 'restored_unit_1',
            tenant_id: 'restored_tenant_1',
            start_date: '2026-01-01',
            end_date: '2027-01-01',
            rent_minor: 450000,
            deposit_minor: 450000,
            due_day: 1,
            late_fee_type: 'flat',
            late_fee_value_minor: 5000,
            grace_period_days: 5,
            status: 'active',
          },
        ],
        invoices: [
          {
            id: 'restored_inv_1',
            org_id: 'org_1',
            lease_id: 'restored_lease_1',
            invoice_number: 'INV-2026-001',
            issue_date: '2026-01-01',
            due_date: '2026-01-05',
            subtotal_minor: 450000,
            late_fee_minor: 0,
            total_minor: 450000,
            amount_paid_minor: 450000,
            status: 'PAID',
            line_items_json: JSON.stringify([{ description: 'Rent January 2026', amount_minor: 450000 }]),
          },
        ],
        payments: [
          {
            id: 'restored_pay_1',
            org_id: 'org_1',
            invoice_id: 'restored_inv_1',
            lease_id: 'restored_lease_1',
            amount_minor: 450000,
            paid_at: '2026-01-02',
            method: 'bank_transfer',
            reference: 'WIRE-88991',
          },
        ],
        expenses: [
          {
            id: 'restored_exp_1',
            org_id: 'org_1',
            property_id: 'restored_prop_1',
            unit_id: null,
            category: 'landscaping',
            amount_minor: 35000,
            incurred_on: '2026-01-15',
            vendor: 'Green Thumb Lawn Care',
            notes: 'Tree trimming and lawn care',
          },
        ],
        vendors: [
          {
            id: 'restored_ven_1',
            org_id: 'org_1',
            name: 'Green Thumb Lawn Care',
            category: 'landscaping',
            phone: '+1 555-4321',
            email: 'hello@greenthumb.com',
          },
        ],
        maintenance_requests: [
          {
            id: 'restored_maint_1',
            org_id: 'org_1',
            unit_id: 'restored_unit_1',
            title: 'HVAC Filter Replacement',
            description: 'Routine filter replacement',
            priority: 'low',
            status: 'completed',
            cost_minor: 8000,
          },
        ],
        documents: [],
      },
      data: {},
      settings: {
        currency: 'US',
        countryCode: 'US',
        exportDestination: '/documents/RentFlow',
        autoSyncEnabled: true,
        agencyCommissionPct: 8,
        maintenanceApprovalThresholdMinor: 50000,
        uiLayout: 'sidebar',
        calendarTodos: [],
        mapPosition: null,
        sidebarCollapsed: false,
        notificationsState: {},
      },
      themes: {
        mode: 'light',
        colorPalette: 'ocean',
      },
    };

    // 3. Perform wipe and restore
    const restoredCount = await db.wipeAndRestoreAllDataAsync(mockBackupPayload);
    expect(restoredCount).toBeGreaterThan(0);

    // Verify old property was wiped out
    const oldProps = db.getTable('properties').filter((p: any) => p.id === 'old_prop_1');
    expect(oldProps.length).toBe(0);

    // Verify all restored records are present
    const properties = db.getTable<Property>('properties');
    expect(properties.length).toBe(1);
    expect(properties[0].name).toBe('Sunset Heights Apartments');
    expect(properties[0].latitude).toBe(34.098);

    const units = db.getTable<Unit>('units');
    expect(units.length).toBe(1);
    expect(units[0].name).toBe('Penthouse A');
    expect(units[0].status).toBe('occupied');

    const tenants = db.getTable<Tenant>('tenants');
    expect(tenants.length).toBe(1);
    expect(tenants[0].name).toBe('Sarah Connor');

    const leases = db.getTable<Lease>('leases');
    expect(leases.length).toBe(1);
    expect(leases[0].status).toBe('active');

    const invoices = db.getTable<Invoice>('invoices');
    expect(invoices.length).toBe(1);
    expect(invoices[0].id).toBe('restored_inv_1');

    const payments = db.getTable<Payment>('payments');
    expect(payments.length).toBe(1);
    expect(payments[0].amount_minor).toBe(450000);

    const expenses = db.getTable<Expense>('expenses');
    expect(expenses.length).toBe(1);
    expect(expenses[0].notes).toBe('Tree trimming and lawn care');

    const vendors = db.getTable<Vendor>('vendors');
    expect(vendors.length).toBe(1);
    expect(vendors[0].name).toBe('Green Thumb Lawn Care');
  });

  it('encrypts full payload with AES-256-GCM and decrypts cleanly on fresh device', async () => {
    const rawBackup = {
      app: 'RentFlow',
      version: '2.0.0',
      tables: {
        properties: [{ id: 'p_alpha', name: 'Alpha Tower', units_count: 50 }],
        tenants: [{ id: 't_alpha', name: 'Alice Walker', phone: '+15551122' }],
      },
      settings: {
        countryCode: 'US',
        exportDestination: '/my/path',
      },
      themes: {
        mode: 'dark',
        colorPalette: 'midnight',
      },
    };

    const jsonStr = JSON.stringify(rawBackup);
    // Encrypt
    const encryptedBytes = await encryptWithGoogleId(jsonStr, testGoogleId);
    expect(encryptedBytes.length).toBeGreaterThan(12);

    // Decrypt on fresh simulated browser
    const decryptedJson = await decryptWithGoogleId(encryptedBytes, testGoogleId);
    const parsed = JSON.parse(decryptedJson);

    expect(parsed.app).toBe('RentFlow');
    expect(parsed.tables.properties[0].name).toBe('Alpha Tower');
    expect(parsed.themes.colorPalette).toBe('midnight');
  });
});
