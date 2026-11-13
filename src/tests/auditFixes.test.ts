import { beforeEach, describe, expect, it } from 'vitest';
import { DBClient } from '../db/client';
import {
  Credit,
  Deposit,
  DepositDeduction,
  Invoice,
  Lease,
  MaintenanceRequest,
  Payment,
  Property,
  Tenant,
  Unit,
} from '../db/schema';
import { validateInsertRecord, validateUpdatePatch } from '../db/validation';
import { getCountryPack } from '../countries/resolver';
import { computeLateFee } from '../lib/lateFee';
import { getMinorFactor, minorToMajorNumber, parseMajorToMinor } from '../lib/money';
import { applyUtilitySplit, distributeMinorUnits } from '../lib/utilitySplitter';
import { getUnitDisplayName } from '../lib/formatNames';

describe('RentFlow Production Audit Verification', () => {
  let testDb: DBClient;

  beforeEach(async () => {
    testDb = new DBClient();
    await testDb.wipeAllDataAsync();
  });

  describe('1. Database & Data Integrity (Zod Validation, Soft-Deletes, Cascading Deletes)', () => {
    it('populates safe defaults and sanitizes money/due_day on insert and update', () => {
      const normalizedUnit = testDb.insertItem<Unit>('units', {
        id: 'unit-zod-1',
        property_id: 'prop-1',
        name: '  Suite 101  ',
        size: 900,
        area_unit: 'sqft',
        bedrooms: 2,
        bathrooms: 1,
        rent_minor: -5000 as any,
        currency_code: 'pkr',
        status: 'invalid_status' as any,
      });

      expect(normalizedUnit.name).toBe('Suite 101');
      expect(normalizedUnit.rent_minor).toBe(0);
      expect(normalizedUnit.currency_code).toBe('PKR');
      expect(normalizedUnit.status).toBe('vacant');
      expect(normalizedUnit.deleted_at).toBeNull();

      const leaseNormalized = validateInsertRecord('leases', {
        id: 'lease-zod-1',
        unit_id: 'unit-zod-1',
        tenant_id: 'tenant-1',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        rent_minor: 150000,
        currency_code: 'usd',
        country_code_snapshot: 'US',
        pack_version_snapshot: 1,
        billing_cycle: 'monthly',
        due_day: 31, // clamped to 28
        deposit_minor: 150000,
        late_fee_type: 'flat',
        late_fee_value: 25,
        grace_days: 5,
        status: 'active',
      }) as Lease;

      expect(leaseNormalized.due_day).toBe(28);
      expect(leaseNormalized.currency_code).toBe('USD');

      const sanitizedPatch = validateUpdatePatch<Invoice>('invoices', {
        late_fee_minor: -200,
        total_minor: 1999.6,
        currency_code: ' eur ',
      });

      expect(sanitizedPatch.late_fee_minor).toBe(0);
      expect(sanitizedPatch.total_minor).toBe(2000);
      expect(sanitizedPatch.currency_code).toBe('EUR');

      const unitFromNumberField = testDb.insertItem<Unit>('units', {
        id: 'unit-num-1',
        property_id: 'prop-1',
        number: 'Unit 101',
        rent_minor: 5000000,
        currency_code: 'PKR',
        status: 'vacant',
      } as any);
      expect(unitFromNumberField.name).toBe('Unit 101');
      expect(getUnitDisplayName(unitFromNumberField)).toBe('Unit 101');
      expect(getUnitDisplayName({ number: 'Apt 1A' })).toBe('Apt 1A');
    });

    it('filters out records with deleted_at or legacy deletedAt across getTable and getItem', () => {
      testDb.insertItem<Property>('properties', {
        id: 'prop-active',
        org_id: 'org-1',
        name: 'Active Tower',
        address_line1: '100 Main St',
        city: 'Austin',
        country_code: 'US',
        type: 'residential_apartment',
      });
      testDb.insertItem<Property>('properties', {
        id: 'prop-deleted',
        org_id: 'org-1',
        name: 'Archived Tower',
        address_line1: '200 Old St',
        city: 'Austin',
        country_code: 'US',
        type: 'residential_apartment',
      });

      testDb.softDeleteItem<Property>('properties', 'prop-deleted');

      const active = testDb.getTable<Property>('properties');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('prop-active');
      expect(testDb.getItem<Property>('properties', 'prop-deleted')).toBeNull();
    });

    it('cascades soft-deletes from Property to Units, Leases, Invoices, Payments, Maintenance, Credits, Deposits, and Deductions', async () => {
      testDb.insertItem<Property>('properties', {
        id: 'prop-cascade',
        org_id: 'org-1',
        name: 'Cascade Plaza',
        address_line1: '10 Oak Ave',
        city: 'Seattle',
        country_code: 'US',
        type: 'residential_apartment',
      });
      testDb.insertItem<Unit>('units', {
        id: 'unit-cascade',
        property_id: 'prop-cascade',
        name: 'Apt 1A',
        size: 850,
        area_unit: 'sqft',
        bedrooms: 2,
        bathrooms: 1,
        rent_minor: 200000,
        currency_code: 'USD',
        status: 'vacant',
      });
      testDb.insertItem<Tenant>('tenants', {
        id: 'tenant-cascade',
        org_id: 'org-1',
        name: 'Alice Walker',
        phone: '555-0100',
        email: 'alice@example.com',
        id_type: 'Passport',
        id_number: 'P123',
      });
      testDb.insertItem<Lease>('leases', {
        id: 'lease-cascade',
        unit_id: 'unit-cascade',
        tenant_id: 'tenant-cascade',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        rent_minor: 200000,
        currency_code: 'USD',
        country_code_snapshot: 'US',
        pack_version_snapshot: 1,
        billing_cycle: 'monthly',
        due_day: 1,
        deposit_minor: 200000,
        late_fee_type: 'flat',
        late_fee_value: 25,
        grace_days: 5,
        status: 'active',
      });
      testDb.insertItem<Invoice>('invoices', {
        id: 'inv-cascade',
        lease_id: 'lease-cascade',
        period_start: '2026-01-01',
        period_end: '2026-01-31',
        due_date: '2026-01-05',
        subtotal_minor: 200000,
        late_fee_minor: 0,
        total_minor: 200000,
        amount_paid_minor: 0,
        currency_code: 'USD',
        status: 'unpaid',
      });
      testDb.recordInvoicePayment('inv-cascade', 250000, 'bank_transfer', 'OVERPAY-1');
      testDb.recordDeduction('lease-cascade', [{ reason: 'Key replacement', amountMinor: 2500 }]);
      testDb.insertItem<MaintenanceRequest>('maintenance_requests', {
        id: 'maint-cascade',
        unit_id: 'unit-cascade',
        category: 'plumbing',
        description: 'Leaky faucet',
        urgency: 'medium',
        status: 'new',
        cost_minor: 0,
        paid_by: 'landlord',
      });

      expect(testDb.getTable<Credit>('credits')).toHaveLength(1);
      expect(testDb.getTable<Deposit>('deposits')).toHaveLength(1);
      expect(testDb.getTable<DepositDeduction>('deposit_deductions')).toHaveLength(1);

      await testDb.deletePropertyCascadingAsync('prop-cascade');

      expect(testDb.getTable<Property>('properties')).toHaveLength(0);
      expect(testDb.getTable<Unit>('units')).toHaveLength(0);
      expect(testDb.getTable<Lease>('leases')).toHaveLength(0);
      expect(testDb.getTable<Invoice>('invoices')).toHaveLength(0);
      expect(testDb.getTable<Payment>('payments')).toHaveLength(0);
      expect(testDb.getTable<MaintenanceRequest>('maintenance_requests')).toHaveLength(0);
      expect(testDb.getTable<Credit>('credits')).toHaveLength(0);
      expect(testDb.getTable<Deposit>('deposits')).toHaveLength(0);
      expect(testDb.getTable<DepositDeduction>('deposit_deductions')).toHaveLength(0);
    });

    it('cascades tenant deletion and vacates leased units', async () => {
      testDb.insertItem<Property>('properties', {
        id: 'prop-t',
        org_id: 'org-1',
        name: 'Maple House',
        address_line1: '1 Maple',
        city: 'Denver',
        country_code: 'US',
        type: 'single_family',
      });
      testDb.insertItem<Unit>('units', {
        id: 'unit-t',
        property_id: 'prop-t',
        name: 'Main House',
        size: 1200,
        area_unit: 'sqft',
        bedrooms: 3,
        bathrooms: 2,
        rent_minor: 250000,
        currency_code: 'USD',
        status: 'vacant',
      });
      testDb.insertItem<Tenant>('tenants', {
        id: 'tenant-t',
        org_id: 'org-1',
        name: 'Bob Ross',
        phone: '555-0199',
        email: 'bob@example.com',
        id_type: 'ID',
        id_number: 'ID-99',
      });
      testDb.insertItem<Lease>('leases', {
        id: 'lease-t',
        unit_id: 'unit-t',
        tenant_id: 'tenant-t',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        rent_minor: 250000,
        currency_code: 'USD',
        country_code_snapshot: 'US',
        pack_version_snapshot: 1,
        billing_cycle: 'monthly',
        due_day: 1,
        deposit_minor: 250000,
        late_fee_type: 'none',
        late_fee_value: 0,
        grace_days: 5,
        status: 'active',
      });

      expect(testDb.getItem<Unit>('units', 'unit-t')?.status).toBe('occupied');

      await testDb.deleteTenantCascadingAsync('tenant-t');

      expect(testDb.getTable<Tenant>('tenants')).toHaveLength(0);
      expect(testDb.getTable<Lease>('leases')).toHaveLength(0);
      expect(testDb.getItem<Unit>('units', 'unit-t')?.status).toBe('vacant');
    });
  });

  describe('2. Financial Engine (Idempotency, Largest Remainder & Floating-Point Precision)', () => {
    it('prevents binary floating-point errors across 0, 2, and 3 decimal currencies', () => {
      expect(parseMajorToMinor('19.99', 'USD')).toBe(1999);
      expect(parseMajorToMinor(19.99, 'USD')).toBe(1999);
      expect(parseMajorToMinor('10.10', 'USD')).toBe(1010);
      expect(parseMajorToMinor('19.99', 'JPY')).toBe(20);
      expect(parseMajorToMinor('10.125', 'KWD')).toBe(10125);
      expect(minorToMajorNumber(10125, 'KWD')).toBe(10.125);
      expect(getMinorFactor('JPY')).toBe(1);
      expect(getMinorFactor('KWD')).toBe(1000);
      expect(getMinorFactor('USD')).toBe(100);
    });

    it('keeps late fee computation idempotent when run repeatedly on already-assessed invoices', () => {
      const usPack = getCountryPack('US');
      const jpPack = getCountryPack('JP');

      const lease = {
        grace_days: 5,
        late_fee_type: 'flat' as const,
        late_fee_value: 25,
        rent_minor: 150000,
      };

      const unassessedInvoice = {
        due_date: '2026-01-01',
        subtotal_minor: 150000,
        total_minor: 150000,
        amount_paid_minor: 0,
        late_fee_minor: 0,
      };

      const firstPass = computeLateFee(unassessedInvoice, lease, usPack, new Date('2026-01-20T12:00:00Z'));
      expect(firstPass.feeMinor).toBe(2500);

      // Once late_fee_minor > 0 is persisted on invoice, re-evaluating never adds another fee
      const alreadyAssessedInvoice = {
        ...unassessedInvoice,
        late_fee_minor: firstPass.feeMinor,
        total_minor: unassessedInvoice.subtotal_minor + firstPass.feeMinor,
      };

      const secondPass = computeLateFee(alreadyAssessedInvoice, lease, usPack, new Date('2026-02-01T12:00:00Z'));
      expect(secondPass.reason).toMatch(/already assessed/i);
      expect(secondPass.feeMinor).toBe(2500);

      // Dynamic minor units for 0-decimal JPY currency (statutory annual_interest_cap = Math.round(120000 * 0.146 * 18 / 365) = 864)
      const jpFeeBelowCap = computeLateFee(
        {
          due_date: '2026-01-01',
          subtotal_minor: 120000,
          total_minor: 120000,
          amount_paid_minor: 0,
          late_fee_minor: 0,
        },
        {
          grace_days: 5,
          late_fee_type: 'flat',
          late_fee_value: 500,
          rent_minor: 120000,
        },
        jpPack,
        new Date('2026-01-20T12:00:00Z')
      );
      expect(jpFeeBelowCap.feeMinor).toBe(500);

      const jpFeeCapped = computeLateFee(
        {
          due_date: '2026-01-01',
          subtotal_minor: 120000,
          total_minor: 120000,
          amount_paid_minor: 0,
          late_fee_minor: 0,
        },
        {
          grace_days: 5,
          late_fee_type: 'flat',
          late_fee_value: 2000,
          rent_minor: 120000,
        },
        jpPack,
        new Date('2026-01-20T12:00:00Z')
      );
      expect(jpFeeCapped.feeMinor).toBe(864);
    });

    it('distributes odd minor units cleanly without penny drift and enforces applyUtilitySplit idempotency', () => {
      const shares = distributeMinorUnits(1000, [
        { id: 'u1', weight: 1 },
        { id: 'u2', weight: 1 },
        { id: 'u3', weight: 1 },
      ]);
      expect(shares.u1 + shares.u2 + shares.u3).toBe(1000);
      expect([shares.u1, shares.u2, shares.u3].sort((a, b) => a - b)).toEqual([333, 333, 334]);

      testDb.insertItem<Property>('properties', {
        id: 'prop-util',
        org_id: 'org-1',
        name: 'Utility House',
        address_line1: '50 Water St',
        city: 'Boston',
        country_code: 'US',
        type: 'residential_apartment',
      });
      testDb.insertItem<Unit>('units', {
        id: 'unit-u1',
        property_id: 'prop-util',
        name: 'U1',
        size: 500,
        area_unit: 'sqft',
        bedrooms: 1,
        bathrooms: 1,
        rent_minor: 120000,
        currency_code: 'USD',
        status: 'occupied',
      });
      testDb.insertItem<Unit>('units', {
        id: 'unit-u2',
        property_id: 'prop-util',
        name: 'U2',
        size: 500,
        area_unit: 'sqft',
        bedrooms: 1,
        bathrooms: 1,
        rent_minor: 120000,
        currency_code: 'USD',
        status: 'occupied',
      });
      testDb.insertItem<Tenant>('tenants', {
        id: 'ten-u1',
        org_id: 'org-1',
        name: 'Tenant 1',
        phone: '555-1',
        email: 't1@example.com',
        id_type: 'ID',
        id_number: '1',
      });
      testDb.insertItem<Tenant>('tenants', {
        id: 'ten-u2',
        org_id: 'org-1',
        name: 'Tenant 2',
        phone: '555-2',
        email: 't2@example.com',
        id_type: 'ID',
        id_number: '2',
      });
      testDb.insertItem<Lease>('leases', {
        id: 'lease-u1',
        unit_id: 'unit-u1',
        tenant_id: 'ten-u1',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        rent_minor: 120000,
        currency_code: 'USD',
        country_code_snapshot: 'US',
        pack_version_snapshot: 1,
        billing_cycle: 'monthly',
        due_day: 1,
        deposit_minor: 0,
        late_fee_type: 'none',
        late_fee_value: 0,
        grace_days: 5,
        status: 'active',
      });
      testDb.insertItem<Lease>('leases', {
        id: 'lease-u2',
        unit_id: 'unit-u2',
        tenant_id: 'ten-u2',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        rent_minor: 120000,
        currency_code: 'USD',
        country_code_snapshot: 'US',
        pack_version_snapshot: 1,
        billing_cycle: 'monthly',
        due_day: 1,
        deposit_minor: 0,
        late_fee_type: 'none',
        late_fee_value: 0,
        grace_days: 5,
        status: 'active',
      });

      const run1 = applyUtilitySplit({
        propertyId: 'prop-util',
        utilityType: 'water',
        billPeriod: '2026-04',
        totalBillMinor: 10001,
        splitMethod: 'by_sqft',
        currencyCode: 'USD',
        dbClient: testDb,
      });

      expect(run1.alreadyApplied).toBe(false);
      expect(run1.appliedCount).toBe(2);

      const invoicesAfterRun1 = testDb.getTable<Invoice>('invoices');
      expect(invoicesAfterRun1).toHaveLength(2);
      const sumApplied = invoicesAfterRun1.reduce((acc, inv) => acc + inv.total_minor, 0);
      expect(sumApplied).toBe(10001);

      // Re-running with same (propertyId, utilityType, billPeriod) must NOT double-charge
      const run2 = applyUtilitySplit({
        propertyId: 'prop-util',
        utilityType: 'water',
        billPeriod: '2026-04',
        totalBillMinor: 10001,
        splitMethod: 'by_sqft',
        currencyCode: 'USD',
        dbClient: testDb,
      });

      expect(run2.alreadyApplied).toBe(true);
      expect(run2.appliedCount).toBe(0);
      expect(testDb.getTable<Invoice>('invoices')).toHaveLength(2);
    });

    it('caps invoice amount_paid_minor and creates exact Credit balance on overpayment without float drift', () => {
      testDb.insertItem<Lease>('leases', {
        id: 'lease-pay',
        unit_id: 'unit-pay',
        tenant_id: 'tenant-pay',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        rent_minor: 100000,
        currency_code: 'USD',
        country_code_snapshot: 'US',
        pack_version_snapshot: 1,
        billing_cycle: 'monthly',
        due_day: 1,
        deposit_minor: 0,
        late_fee_type: 'none',
        late_fee_value: 0,
        grace_days: 5,
        status: 'active',
      });
      testDb.insertItem<Invoice>('invoices', {
        id: 'inv-pay',
        lease_id: 'lease-pay',
        period_start: '2026-04-01',
        period_end: '2026-04-30',
        due_date: '2026-04-05',
        subtotal_minor: 1999,
        late_fee_minor: 0,
        total_minor: 1999,
        amount_paid_minor: 0,
        currency_code: 'USD',
        status: 'unpaid',
      });

      const paidMinor = parseMajorToMinor('25.00', 'USD');
      const result = testDb.recordInvoicePayment('inv-pay', paidMinor, 'card', 'CARD-99');

      expect(result.invoice.status).toBe('paid');
      expect(result.invoice.amount_paid_minor).toBe(1999);
      expect(result.credit?.amount_minor).toBe(501);
      expect(result.credit?.tenant_id).toBe('tenant-pay');
      expect(result.credit?.status).toBe('active');
    });
  });
});
