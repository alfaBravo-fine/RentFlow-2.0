import { describe, it, expect, beforeEach } from 'vitest';
import { db, parseDepositDeductions } from '../../src/db/client';
import { Property, Unit, Tenant, Lease, Deposit, DepositDeduction } from '../../src/db/schema';

describe('Security Deposit Deduction & Vacant Unit Filtering Tests', () => {
  beforeEach(() => {
    (db as any).setMemoryTable('deposit_deductions', []);
    (db as any).setMemoryTable('deposits', []);
    (db as any).setMemoryTable('expenses', []);
    (db as any).setMemoryTable('invoices', []);
    (db as any).setMemoryTable('leases', []);
    (db as any).setMemoryTable('tenants', []);
    (db as any).setMemoryTable('units', []);
    (db as any).setMemoryTable('properties', []);

    db.insertItem<Property>('properties', {
      id: 'prop_ded_1',
      org_id: 'org_1',
      name: 'Emerald Heights',
      type: 'residential_apartment',
      country_code: 'PK',
    });

    db.insertItem<Unit>('units', {
      id: 'unit_vacant_1',
      property_id: 'prop_ded_1',
      name: 'Unit 101',
      size: 1000,
      area_unit: 'sqft',
      bedrooms: 2,
      bathrooms: 2,
      rent_minor: 2000000,
      currency_code: 'PKR',
      status: 'vacant',
    });

    db.insertItem<Unit>('units', {
      id: 'unit_vacant_2',
      property_id: 'prop_ded_1',
      name: 'Unit 102',
      size: 1000,
      area_unit: 'sqft',
      bedrooms: 2,
      bathrooms: 2,
      rent_minor: 2500000,
      currency_code: 'PKR',
      status: 'vacant',
    });

    db.insertItem<Tenant>('tenants', {
      id: 'ten_ded_1',
      org_id: 'org_1',
      name: 'Sara Khan',
      phone: '+92 300 9988776',
      email: 'sara@example.com',
      id_type: 'CNIC',
      id_number: '37405-9988776-2',
    });

    db.insertItem<Lease>('leases', {
      id: 'lease_ded_1',
      unit_id: 'unit_vacant_1',
      tenant_id: 'ten_ded_1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_minor: 2000000,
      deposit_minor: 2000000, // Rs. 20,000
      currency_code: 'PKR',
      country_code_snapshot: 'PK',
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 1,
      late_fee_type: 'none',
      late_fee_value: 0,
      grace_days: 5,
      status: 'active',
    });

    db.insertItem<Deposit>('deposits', {
      id: 'dep_ded_1',
      lease_id: 'lease_ded_1',
      amount_minor: 2000000, // Rs. 20,000
      currency_code: 'PKR',
      received_at: '2026-01-01',
      status: 'held',
      interest_accrued_minor: 0,
      returned_minor: 0,
    });
  });

  it('hides occupied units when filtering for vacant units in lease dropdown', () => {
    const units = db.getTable<Unit>('units').filter((u) => !u.deleted_at);
    const vacant = units.filter((u) => u.status === 'vacant');

    expect(vacant.map((u) => u.id)).toEqual(['unit_vacant_2']);
  });

  it('records valid deductions on a Rs. 20,000 deposit, updates deposit status, and logs to deposit_deductions without creating expenses or invoices', () => {
    const result = db.recordDeduction(
      'lease_ded_1',
      [
        { reason: 'Wall painting', amountMinor: 350000 }, // Rs. 3,500
        { reason: 'Deep cleaning', amountMinor: 150000 }, // Rs. 1,500
      ],
      'Receipt #101'
    );

    expect(result.deposit.status).toBe('partially_returned');
    expect(result.deposit.returned_minor).toBe(1500000); // Rs. 15,000 remaining
    expect(result.remainingBalanceMinor).toBe(1500000);

    const ledgerRows = db.getTable<DepositDeduction>('deposit_deductions');
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows.reduce((s, r) => s + r.amount_minor, 0)).toBe(500000);
    expect(ledgerRows.every((r) => r.tenant_id === 'ten_ded_1')).toBe(true);
    expect(ledgerRows.every((r) => typeof r.deducted_at === 'string' && r.deducted_at.length > 0)).toBe(true);
    expect(ledgerRows.map((r) => r.reason).sort()).toEqual(['Deep cleaning', 'Wall painting']);

    // Ensure no records are created in expenses or invoices
    expect(db.getTable('expenses')).toHaveLength(0);
    expect(db.getTable('invoices')).toHaveLength(0);

    // Subsequent deduction within remaining Rs. 15,000 balance succeeds
    const second = db.recordDeduction('lease_ded_1', [
      { reason: 'Broken lock replacement', amountMinor: 1500000 },
    ]);
    expect(second.deposit.status).toBe('forfeited');
    expect(second.remainingBalanceMinor).toBe(0);
    expect(db.getTable<DepositDeduction>('deposit_deductions')).toHaveLength(3);
    expect(db.getTable('expenses')).toHaveLength(0);
    expect(db.getTable('invoices')).toHaveLength(0);
  });

  it('rejects deductions that exceed the remaining deposit balance', () => {
    expect(() =>
      db.recordDeduction('lease_ded_1', [{ reason: 'Excessive claim', amountMinor: 2500000 }])
    ).toThrow(/exceeds the remaining deposit balance/i);
  });

  it('parses deductions_json safely whether stored as JSON string, object payload, or array', () => {
    expect(parseDepositDeductions(null)).toEqual([]);
    expect(parseDepositDeductions('[{"id":"1","reason":"Test","amount_minor":500,"date":"2026-01-01"}]')).toHaveLength(1);
    expect(
      parseDepositDeductions({
        deductions: [{ id: '2', reason: 'Cleaning', amount_minor: 1000, date: '2026-01-02' }],
      })
    ).toHaveLength(1);
  });

  it('backfills legacy deductions_json entries into deposit_deductions with tenant_id on import', async () => {
    await db.importAllDataAsync({
      leases: db.getTable<Lease>('leases'),
      deposits: [
        {
          id: 'dep_legacy_1',
          lease_id: 'lease_ded_1',
          amount_minor: 444500,
          currency_code: 'PKR',
          received_at: '2026-01-01',
          status: 'partially_returned',
          interest_accrued_minor: 0,
          returned_minor: 439000,
          deductions_json: JSON.stringify({
            deductions: [
              { id: 'leg_ded_1', reason: 'Key replacement', amount_minor: 5500, date: '2026-11-12T10:00:00.000Z' },
            ],
          }),
          updated_at: Date.now(),
          device_id: 'dev_test',
          deleted_at: null,
        },
      ],
      deposit_deductions: [],
    });

    const rows = db.getTable<DepositDeduction>('deposit_deductions');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('leg_ded_1');
    expect(rows[0].tenant_id).toBe('ten_ded_1');
    expect(rows[0].amount_minor).toBe(5500);
    expect(rows[0].reason).toBe('Key replacement');
  });
});
