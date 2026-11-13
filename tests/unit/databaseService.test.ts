import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { DBClient } from '../../src/db/client';
import { databaseService } from '../../src/db/DatabaseService';
import { OwnerStatementPrintable } from '../../src/components/print/OwnerStatementPrintable';
import { AuditReportPrintable } from '../../src/components/print/AuditReportPrintable';
import { getCountryPack } from '../../src/countries/resolver';
import { Invoice, Lease, Payment, Credit, Property, Unit } from '../../src/db/schema';

describe('DatabaseService & Transactional Integrity Unit Tests', () => {
  let client: DBClient;

  beforeEach(() => {
    client = new DBClient();
  });

  it('atomically records invoice payment and updates invoice status to partially_paid and paid', async () => {
    const inv = client.insertItem<Invoice>('invoices', {
      id: 'inv_tx_1',
      lease_id: 'lease_tx_1',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      due_date: '2026-10-01',
      subtotal_minor: 200000,
      late_fee_minor: 0,
      total_minor: 200000,
      amount_paid_minor: 0,
      currency_code: 'USD',
      status: 'unpaid',
    });

    expect(inv.status).toBe('unpaid');

    const partial = await client.recordInvoicePaymentAsync(
      inv.id,
      80000,
      'ACH Bank Transfer',
      'REF-PARTIAL-1'
    );
    expect(partial.invoice.amount_paid_minor).toBe(80000);
    expect(partial.invoice.status).toBe('partially_paid');
    expect(partial.payment.amount_minor).toBe(80000);

    const settled = await client.recordInvoicePaymentAsync(
      inv.id,
      120000,
      'ACH Bank Transfer',
      'REF-FINAL-2'
    );
    expect(settled.invoice.amount_paid_minor).toBe(200000);
    expect(settled.invoice.status).toBe('paid');

    const payments = client.getTable<Payment>('payments');
    expect(payments).toHaveLength(2);
  });

  it('allocates FIFO payments across multiple open invoices and creates overpayment credit', async () => {
    client.insertItem<Lease>('leases', {
      id: 'lease_fifo_1',
      unit_id: 'unit_1',
      tenant_id: 'tenant_1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_minor: 100000,
      currency_code: 'USD',
      country_code_snapshot: 'US',
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 1,
      deposit_minor: 100000,
      late_fee_type: 'none',
      late_fee_value: 0,
      grace_days: 5,
      status: 'active',
    });

    client.insertItem<Invoice>('invoices', {
      id: 'inv_aug',
      lease_id: 'lease_fifo_1',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      due_date: '2026-08-01',
      subtotal_minor: 100000,
      late_fee_minor: 0,
      total_minor: 100000,
      amount_paid_minor: 0,
      currency_code: 'USD',
      status: 'overdue',
    });

    client.insertItem<Invoice>('invoices', {
      id: 'inv_sep',
      lease_id: 'lease_fifo_1',
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      due_date: '2026-09-01',
      subtotal_minor: 100000,
      late_fee_minor: 0,
      total_minor: 100000,
      amount_paid_minor: 0,
      currency_code: 'USD',
      status: 'unpaid',
    });

    const result = await client.allocatePaymentAsync(
      'lease_fifo_1',
      235000,
      'Wire Transfer',
      'WIRE-991'
    );

    expect(result.allocatedInvoices).toHaveLength(2);
    expect(result.allocatedInvoices[0].id).toBe('inv_aug');
    expect(result.allocatedInvoices[0].status).toBe('paid');
    expect(result.allocatedInvoices[1].id).toBe('inv_sep');
    expect(result.allocatedInvoices[1].status).toBe('paid');

    const credits = client.getTable<Credit>('credits');
    expect(credits).toHaveLength(1);
    expect(credits[0].amount_minor).toBe(35000);
  });

  it('cascades soft deletes across property -> units -> leases -> invoices', async () => {
    client.insertItem<Property>('properties', {
      id: 'prop_del',
      org_id: 'org_1',
      name: 'Sunset Villas',
      type: 'residential_apartment',
      country_code: 'US',
    });

    client.insertItem<Unit>('units', {
      id: 'unit_del',
      property_id: 'prop_del',
      name: 'Villa 1',
      size: 1200,
      area_unit: 'sqft',
      bedrooms: 2,
      bathrooms: 2,
      rent_minor: 150000,
      currency_code: 'USD',
      status: 'occupied',
    });

    client.insertItem<Lease>('leases', {
      id: 'lease_del',
      unit_id: 'unit_del',
      tenant_id: 'ten_1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_minor: 150000,
      currency_code: 'USD',
      country_code_snapshot: 'US',
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 1,
      deposit_minor: 150000,
      late_fee_type: 'none',
      late_fee_value: 0,
      grace_days: 5,
      status: 'active',
    });

    await client.deletePropertyCascadingAsync('prop_del');

    expect(client.getTable<Property>('properties')).toHaveLength(0);
    expect(client.getTable<Unit>('units')).toHaveLength(0);
    expect(client.getTable<Lease>('leases')).toHaveLength(0);
  });

  it('auto-generates an invoice for the current billing cycle if no open invoices exist when allocating payment', async () => {
    client.insertItem<Lease>('leases', {
      id: 'lease_no_inv_1',
      unit_id: 'unit_auto_1',
      tenant_id: 'tenant_auto_1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_minor: 120000,
      currency_code: 'USD',
      country_code_snapshot: 'US',
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 1,
      deposit_minor: 120000,
      late_fee_type: 'none',
      late_fee_value: 0,
      grace_days: 5,
      status: 'active',
    });

    // Verify 0 invoices initially
    const initialInvoices = client.getTable<Invoice>('invoices');
    expect(initialInvoices.filter((i) => i.lease_id === 'lease_no_inv_1')).toHaveLength(0);

    // Record payment of $1,200.00
    const result = await client.allocatePaymentAsync(
      'lease_no_inv_1',
      120000,
      'ACH Bank Transfer',
      'REF-AUTO-INV-1'
    );

    // Should auto-generate invoice and settle it
    expect(result.allocatedInvoices).toHaveLength(1);
    const autoInv = result.allocatedInvoices[0];
    expect(autoInv.lease_id).toBe('lease_no_inv_1');
    expect(autoInv.total_minor).toBe(120000);
    expect(autoInv.amount_paid_minor).toBe(120000);
    expect(autoInv.status).toBe('paid');

    // Payments ledger should have linked invoice
    const payments = client.getTable<Payment>('payments');
    const pmt = payments.find((p) => p.reference === 'REF-AUTO-INV-1');
    expect(pmt).toBeDefined();
    expect(pmt?.invoice_id).toBe(autoInv.id);
  });

  it('deletes a payment, reverses the linked invoice balance, and restores unpaid/overdue status', () => {
    const inv = client.insertItem<Invoice>('invoices', {
      id: 'inv_rev_1',
      lease_id: 'lease_rev_1',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      due_date: '2026-10-01',
      subtotal_minor: 150000,
      late_fee_minor: 0,
      total_minor: 150000,
      amount_paid_minor: 150000,
      currency_code: 'USD',
      status: 'paid',
    });

    const pmt = client.insertItem<Payment>('payments', {
      id: 'pmt_rev_1',
      invoice_id: inv.id,
      amount_minor: 150000,
      currency_code: 'USD',
      method: 'Credit Card',
      reference: 'REF-REV-01',
      paid_at: new Date().toISOString(),
    });

    const success = client.deletePayment(pmt.id);
    expect(success).toBe(true);

    // Payment should be soft deleted
    const activePayments = client.getTable<Payment>('payments');
    expect(activePayments.find((p) => p.id === pmt.id)).toBeUndefined();

    // Linked invoice should have balance reversed to 0 and status set to overdue/unpaid
    const updatedInvoices = client.getTable<Invoice>('invoices');
    const revertedInv = updatedInvoices.find((i) => i.id === inv.id);
    expect(revertedInv).toBeDefined();
    expect(revertedInv?.amount_paid_minor).toBe(0);
    expect(['unpaid', 'overdue']).toContain(revertedInv?.status);
  });

  it('exposes typed domain operations through DatabaseService singleton', async () => {
    await databaseService.initialize();
    expect(databaseService.backend).toBe('memory');

    const createdTenant = await databaseService.addTenant({
      org_id: 'org_test',
      name: 'Clara Vance',
      phone: '+1 555-0177',
      email: 'clara@example.com',
      id_type: 'Passport',
      id_number: 'P-441122',
      occupants: 1,
    });

    const tenants = await databaseService.getTenants();
    expect(tenants.some((t) => t.id === createdTenant.id && t.name === 'Clara Vance')).toBe(true);
  });

  it('automatically syncs unit status to occupied on active lease creation, and reverts to vacant on termination/deletion', () => {
    // 1. Create a vacant unit
    const unit = client.insertItem<Unit>('units', {
      id: 'unit_occ_test',
      property_id: 'prop_occ_test',
      name: 'Apt 1A',
      size: 750,
      area_unit: 'sqft',
      bedrooms: 1,
      bathrooms: 1,
      rent_minor: 180000,
      currency_code: 'USD',
      status: 'vacant',
    });
    expect(unit.status).toBe('vacant');

    // 2. Create an active lease for this unit
    const lease = client.insertItem<Lease>('leases', {
      id: 'lease_occ_test',
      unit_id: 'unit_occ_test',
      tenant_id: 'tenant_occ_test',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_minor: 180000,
      currency_code: 'USD',
      country_code_snapshot: 'US',
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 1,
      deposit_minor: 180000,
      late_fee_type: 'none',
      late_fee_value: 0,
      grace_days: 5,
      status: 'active',
    });

    // Unit should automatically be updated to occupied
    const updatedUnit = client.getTable<Unit>('units').find((u) => u.id === 'unit_occ_test');
    expect(updatedUnit?.status).toBe('occupied');

    // 3. Update lease status to terminated
    client.updateItem<Lease>('leases', lease.id, { status: 'terminated' });
    const unitAfterTermination = client.getTable<Unit>('units').find((u) => u.id === 'unit_occ_test');
    expect(unitAfterTermination?.status).toBe('vacant');

    // 4. Reactivate lease -> unit becomes occupied again
    client.updateItem<Lease>('leases', lease.id, { status: 'active' });
    const unitAfterReactivation = client.getTable<Unit>('units').find((u) => u.id === 'unit_occ_test');
    expect(unitAfterReactivation?.status).toBe('occupied');

    // 5. Delete lease -> unit reverts to vacant
    client.softDeleteItem<Lease>('leases', lease.id);
    const unitAfterDeletion = client.getTable<Unit>('units').find((u) => u.id === 'unit_occ_test');
    expect(unitAfterDeletion?.status).toBe('vacant');
  });
});

describe('Print Statement Templates Render Tests', () => {
  it('renders OwnerStatementPrintable cleanly with tabular numbers and formal headers', () => {
    const usPack = getCountryPack('US');
    const html = renderToString(
      React.createElement(OwnerStatementPrintable, {
        orgName: 'Horizon Property Management',
        statementOwner: {
          id: 'owner_test_1',
          org_id: 'org_1',
          name: 'Apex Holdings LLC',
          payout_details: 'Chase *4829',
          commission_type: 'percentage',
          commission_value: 8,
          updated_at: Date.now(),
          device_id: 'dev_1',
        },
        statementMonth: '2026-10',
        ownerProps: [],
        rentCollectedMinor: 405000,
        commissionMinor: 32400,
        totalExpensesMinor: 45000,
        netPayoutMinor: 327600,
        pack: usPack,
      })
    );

    expect(html).toContain('Apex Holdings LLC');
    expect(html).toContain('Total Net Owner Disbursement');
    expect(html).toContain('tabular-nums');
    expect(html).toContain('border-b border-gray-300');
  });

  it('renders AuditReportPrintable cleanly with P&L figures and tabular alignment', () => {
    const usPack = getCountryPack('US');
    const html = renderToString(
      React.createElement(AuditReportPrintable, {
        pack: usPack,
        selectedYear: '2026',
        totalRentCollectedMinor: 500000,
        totalExpensesMinor: 120000,
        netOperatingIncomeMinor: 380000,
        estimatedWithholdingTaxMinor: 0,
        paidInvoicesCount: 3,
        expensesCount: 2,
        expensesByCategory: { repairs_and_maintenance: 120000 },
      })
    );

    expect(html).toContain('RentFlow Audit Statement');
    expect(html).toContain('Net Operating Income (NOI)');
    expect(html).toContain('tabular-nums');
    expect(html).toContain('border-b border-gray-300');
  });
});
