import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateFirstInvoice } from '../../src/lib/invoicing';
import { db } from '../../src/db/client';
import { Lease, Invoice } from '../../src/db/schema';

describe('generateFirstInvoice Unit Tests', () => {
  beforeEach(() => {
    // Clear any test invoices
    const currentInvoices = db.getTable<Invoice>('invoices');
    currentInvoices.forEach((inv) => db.softDeleteItem('invoices', inv.id));
  });

  it('generates the first invoice when lease is active and starts in the past or today', () => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    const lease: Lease = {
      id: 'lease_active_current_1',
      unit_id: 'unit_inv_1',
      tenant_id: 'tenant_inv_1',
      start_date: todayIso,
      end_date: '2027-12-31',
      rent_minor: 185000,
      currency_code: 'USD',
      country_code_snapshot: 'US',
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 5,
      deposit_minor: 185000,
      late_fee_type: 'percent',
      late_fee_value: 5,
      grace_days: 5,
      status: 'active',
      updated_at: Date.now(),
      device_id: 'test_dev',
    };

    const invoice = generateFirstInvoice(lease);
    expect(invoice).toBeDefined();
    expect(invoice).not.toBeNull();

    expect(invoice?.lease_id).toBe('lease_active_current_1');
    expect(invoice?.subtotal_minor).toBe(185000);
    expect(invoice?.total_minor).toBe(185000);
    expect(invoice?.late_fee_minor).toBe(0);
    expect(invoice?.amount_paid_minor).toBe(0);

    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const expectedPeriodStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const expectedDueDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-05`;

    expect(invoice?.period_start).toBe(expectedPeriodStart);
    expect(invoice?.due_date).toBe(expectedDueDate);

    // Verify line item for rent amount
    expect(invoice?.line_items_json).toBeDefined();
    const lineItems = JSON.parse(invoice!.line_items_json!);
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].description).toBe('Monthly Tenancy Rent');
    expect(lineItems[0].amount_minor).toBe(185000);

    // Verify it was saved to db
    const savedInvoices = db.getTable<Invoice>('invoices');
    expect(savedInvoices.some((i) => i.id === invoice?.id)).toBe(true);
  });

  it('does NOT generate an invoice if lease start date is in the future', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureIso = futureDate.toISOString().slice(0, 10);

    const lease: Lease = {
      id: 'lease_future_1',
      unit_id: 'unit_inv_2',
      tenant_id: 'tenant_inv_2',
      start_date: futureIso,
      end_date: '2028-12-31',
      rent_minor: 220000,
      currency_code: 'USD',
      country_code_snapshot: 'US',
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 1,
      deposit_minor: 220000,
      late_fee_type: 'none',
      late_fee_value: 0,
      grace_days: 0,
      status: 'active',
      updated_at: Date.now(),
      device_id: 'test_dev',
    };

    const invoice = generateFirstInvoice(lease);
    expect(invoice).toBeNull();

    const savedInvoices = db.getTable<Invoice>('invoices');
    expect(savedInvoices.filter((i) => i.lease_id === 'lease_future_1')).toHaveLength(0);
  });

  it('does NOT generate an invoice if lease is in draft status', () => {
    const today = new Date().toISOString().slice(0, 10);

    const lease: Lease = {
      id: 'lease_draft_1',
      unit_id: 'unit_inv_3',
      tenant_id: 'tenant_inv_3',
      start_date: today,
      end_date: '2027-12-31',
      rent_minor: 150000,
      currency_code: 'USD',
      country_code_snapshot: 'US',
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 1,
      deposit_minor: 150000,
      late_fee_type: 'none',
      late_fee_value: 0,
      grace_days: 0,
      status: 'draft',
      updated_at: Date.now(),
      device_id: 'test_dev',
    };

    const invoice = generateFirstInvoice(lease);
    expect(invoice).toBeNull();
  });

  it('gracefully logs console.error and does not crash if invalid lease data is provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const invoice = generateFirstInvoice(null as any);
    expect(invoice).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
