import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/db/client';
import { Property, Unit, Tenant, Lease, Invoice, Credit, Payment } from '../../src/db/schema';
import { applyTenantCreditsToInvoice, generateFirstInvoice } from '../../src/lib/invoicing';

describe('Tenant Credits & Overpayment Logic Tests', () => {
  beforeEach(() => {
    (db as any).setMemoryTable('credits', []);
    (db as any).setMemoryTable('invoices', []);
    (db as any).setMemoryTable('payments', []);
    (db as any).setMemoryTable('leases', []);
    (db as any).setMemoryTable('tenants', []);
    (db as any).setMemoryTable('units', []);
    (db as any).setMemoryTable('properties', []);

    // 1. Setup Property, Unit, Tenant, and Lease
    db.insertItem<Property>('properties', {
      id: 'prop_cred_1',
      org_id: 'org_1',
      name: 'Central Plaza',
      type: 'residential_apartment',
      country_code: 'PK',
    });

    db.insertItem<Unit>('units', {
      id: 'unit_cred_1',
      property_id: 'prop_cred_1',
      name: 'Apt 5B',
      size: 1000,
      area_unit: 'sqft',
      bedrooms: 2,
      bathrooms: 2,
      rent_minor: 5000000, // Rs. 50,000
      currency_code: 'PKR',
      status: 'occupied',
    });

    db.insertItem<Tenant>('tenants', {
      id: 'ten_cred_1',
      org_id: 'org_1',
      name: 'Usman Riaz',
      phone: '+92 300 1122334',
      email: 'usman@example.com',
      id_type: 'CNIC',
      id_number: '37405-1122334-1',
    });

    db.insertItem<Lease>('leases', {
      id: 'lease_cred_1',
      unit_id: 'unit_cred_1',
      tenant_id: 'ten_cred_1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_minor: 5000000, // Rs. 50,000
      deposit_minor: 10000000,
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

    db.insertItem<Invoice>('invoices', {
      id: 'INV-CRED-001',
      lease_id: 'lease_cred_1',
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      due_date: '2026-01-01',
      subtotal_minor: 5000000, // Rs. 50,000
      late_fee_minor: 0,
      total_minor: 5000000,
      amount_paid_minor: 0,
      currency_code: 'PKR',
      status: 'unpaid',
    });
  });

  it('records overpayment of Rs. 60,000 for Rs. 50,000 invoice: caps invoice paid at Rs. 50,000 and creates Rs. 10,000 credit', () => {
    // Record payment of Rs. 60,000 (6,000,000 minor)
    const result = db.recordInvoicePayment('INV-CRED-001', 6000000, 'Cash', 'REF-60K');

    expect(result.invoice.status).toBe('paid');
    expect(result.invoice.amount_paid_minor).toBe(5000000); // capped at Rs. 50,000

    expect(result.credit).toBeDefined();
    expect(result.credit!.amount_minor).toBe(1000000); // Rs. 10,000 credit
    expect(result.credit!.status).toBe('active');

    // Verify credits table
    const activeCredits = db.getTable<Credit>('credits').filter((c) => c.status === 'active' && !c.deleted_at);
    expect(activeCredits.length).toBe(1);
    expect(activeCredits[0].amount_minor).toBe(1000000);
  });

  it('automatically applies Rs. 10,000 credit to a new Rs. 50,000 invoice (makes Paid: Rs. 10,000, Status: partially_paid)', () => {
    // 1. Record overpayment of Rs. 60,000 on first invoice
    db.recordInvoicePayment('INV-CRED-001', 6000000, 'Bank Transfer', 'REF-OVERPAY');

    // 2. Create second invoice for next month (Rs. 50,000)
    const secondInvoice = db.insertItem<Invoice>('invoices', {
      id: 'INV-CRED-002',
      lease_id: 'lease_cred_1',
      period_start: '2026-02-01',
      period_end: '2026-02-28',
      due_date: '2026-02-01',
      subtotal_minor: 5000000,
      late_fee_minor: 0,
      total_minor: 5000000,
      amount_paid_minor: 0,
      currency_code: 'PKR',
      status: 'unpaid',
    });

    // 3. Auto-apply credit
    const updatedInvoice = applyTenantCreditsToInvoice(secondInvoice);

    expect(updatedInvoice.amount_paid_minor).toBe(1000000); // Rs. 10,000 applied
    expect(updatedInvoice.status).toBe('partially_paid');

    // 4. Verify credit balance is reduced to 0 (status: used)
    const activeCredits = db.getTable<Credit>('credits').filter((c) => c.status === 'active' && !c.deleted_at && c.amount_minor > 0);
    expect(activeCredits.length).toBe(0);
  });

  it('creates a linked overpayment Credit via FIFO allocatePayment and reverses it when payment is deleted', () => {
    const fifoResult = db.allocatePayment('lease_cred_1', 6000000, 'Bank Transfer', 'FIFO-60K');

    expect(fifoResult.allocatedInvoices).toHaveLength(1);
    expect(fifoResult.allocatedInvoices[0].status).toBe('paid');
    expect(fifoResult.allocatedInvoices[0].amount_paid_minor).toBe(5000000);
    expect(fifoResult.credit).toBeDefined();
    expect(fifoResult.credit!.amount_minor).toBe(1000000);
    expect(fifoResult.credit!.tenant_id).toBe('ten_cred_1');
    expect(fifoResult.credit!.lease_id).toBe('lease_cred_1');
    expect(fifoResult.credit!.source_payment_id).toBe(fifoResult.payment.id);

    // Deleting the payment must reverse both the invoice balance and the overpayment credit
    db.deletePayment(fifoResult.payment.id);

    const refreshedInv = db.getItem<Invoice>('invoices', 'INV-CRED-001');
    expect(['unpaid', 'overdue']).toContain(refreshedInv?.status);
    expect(refreshedInv?.amount_paid_minor).toBe(0);

    const remainingCredits = db
      .getTable<Credit>('credits')
      .filter((c) => !c.deleted_at && c.amount_minor > 0);
    expect(remainingCredits).toHaveLength(0);
  });
});
