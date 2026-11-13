import { db } from '../db/client';
import { Lease, Invoice, Credit, Payment } from '../db/schema';
import { generateUUID } from './uuid';
import { minorToMajorNumber } from './money';

export interface InvoiceLineItem {
  id: string;
  description: string;
  amount_minor: number;
  category: 'rent' | 'utility' | 'late_fee' | 'deposit' | 'maintenance' | 'other';
}

/**
 * Automatically applies active tenant/lease credits to an invoice.
 * If a tenant has a credit balance, automatically applies it to the new invoice
 * (e.g. Paid: Rs. 10,000, Status: Partial or Paid), and reduces their credit balance.
 */
export function applyTenantCreditsToInvoice(invoice: Invoice): Invoice {
  try {
    if (!invoice || invoice.status === 'paid' || invoice.status === 'voided') {
      return invoice;
    }

    const lease = invoice.lease_id ? db.getItem<Lease>('leases', invoice.lease_id) : undefined;
    const tenantId = lease ? lease.tenant_id : undefined;

    const allCredits = db.getTable<Credit>('credits').filter(
      (c) => !c.deleted_at && !(c as any).deletedAt && c.status === 'active' && (c.amount_minor || 0) > 0
    );

    const activeCredits = allCredits.filter(
      (c) =>
        (invoice.lease_id && (c.lease_id === invoice.lease_id || (c as any).leaseId === invoice.lease_id)) ||
        (tenantId && (c.tenant_id === tenantId || (c as any).tenantId === tenantId))
    );

    if (activeCredits.length === 0) {
      return invoice;
    }

    const totalAvailableMinor = activeCredits.reduce((sum, c) => sum + (c.amount_minor || 0), 0);
    if (totalAvailableMinor <= 0) {
      return invoice;
    }

    const unpaidMinor = invoice.total_minor - invoice.amount_paid_minor;
    if (unpaidMinor <= 0) {
      return invoice;
    }

    const amountToApplyMinor = Math.min(unpaidMinor, totalAvailableMinor);
    let remainingToDeductMinor = amountToApplyMinor;

    for (const credit of activeCredits) {
      if (remainingToDeductMinor <= 0) break;

      const creditAmount = credit.amount_minor || 0;
      if (creditAmount <= 0) continue;

      if (creditAmount <= remainingToDeductMinor) {
        remainingToDeductMinor -= creditAmount;
        db.updateItem<Credit>('credits', credit.id, {
          amount_minor: 0,
          amount: 0,
          status: 'used',
          applied_invoice_id: invoice.id,
        });
      } else {
        const newCreditAmount = creditAmount - remainingToDeductMinor;
        db.updateItem<Credit>('credits', credit.id, {
          amount_minor: newCreditAmount,
          amount: minorToMajorNumber(newCreditAmount, credit.currency_code || invoice.currency_code),
          status: 'partially_used',
          applied_invoice_id: invoice.id,
        });
        remainingToDeductMinor = 0;
      }
    }

    const newPaidMinor = invoice.amount_paid_minor + amountToApplyMinor;
    const newStatus: Invoice['status'] = newPaidMinor >= invoice.total_minor ? 'paid' : 'partially_paid';

    const updatedInvoice: Invoice = {
      ...invoice,
      amount_paid_minor: newPaidMinor,
      amount_paid: minorToMajorNumber(newPaidMinor, invoice.currency_code),
      amountPaid: minorToMajorNumber(newPaidMinor, invoice.currency_code),
      status: newStatus,
      updated_at: Date.now(),
    } as any;

    db.updateItem<Invoice>('invoices', invoice.id, updatedInvoice);

    // Record system payment entry for the applied credit
    const now = Date.now();
    db.insertItem<Payment>('payments', {
      id: generateUUID(),
      invoice_id: invoice.id,
      amount_minor: amountToApplyMinor,
      currency_code: invoice.currency_code || 'PKR',
      method: 'Credit Auto-Deduct',
      reference: `CREDIT-${now.toString().slice(-6)}`,
      paid_at: new Date(now).toISOString(),
      updated_at: now,
      device_id: 'system',
      deleted_at: null,
    });

    db.notifyWrite();
    return updatedInvoice;
  } catch (err) {
    console.error('applyTenantCreditsToInvoice failed:', err);
    return invoice;
  }
}

/**
 * Automatically generates the first rent invoice for an active lease if the lease
 * start date is today or in the past. Automatically applies any active tenant credits.
 */
export function generateFirstInvoice(lease: Lease | null | undefined): Invoice | null {
  try {
    if (!lease) {
      console.error('generateFirstInvoice failed: lease is undefined or null');
      return null;
    }

    if (lease.status !== 'active') {
      return null;
    }

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    // 1. Check if the lease start date is today or in the past
    if (!lease.start_date || lease.start_date > todayIso) {
      // Lease starts in the future - do not generate first invoice yet
      return null;
    }

    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-indexed

    // 2. Billing period for the current month
    const periodStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const periodEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

    // Prevent duplicate invoices if one already exists for this lease and period
    const existingInvoices = db.getTable<Invoice>('invoices');
    const existing = existingInvoices.find(
      (inv) => inv.lease_id === lease.id && inv.period_start === periodStart && !inv.deleted_at
    );
    if (existing) {
      return applyTenantCreditsToInvoice(existing);
    }

    // 3. Set due date based on lease's due_day
    const dueDay = Math.min(Math.max(lease.due_day || 1, 1), lastDayOfMonth);
    const dueDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

    const rentMinor = lease.rent_minor || 0;

    // 4. Add line item for the Rent amount
    const lineItems: InvoiceLineItem[] = [
      {
        id: generateUUID(),
        description: 'Monthly Tenancy Rent',
        amount_minor: rentMinor,
        category: 'rent',
      },
    ];

    const initialStatus: Invoice['status'] = dueDate < todayIso ? 'overdue' : 'unpaid';

    // 5. Save to invoices table
    const invoiceId = generateUUID();
    const createdInvoice = db.insertItem<Invoice>('invoices', {
      id: invoiceId,
      lease_id: lease.id,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: dueDate,
      subtotal_minor: rentMinor,
      late_fee_minor: 0,
      total_minor: rentMinor,
      amount_paid_minor: 0,
      currency_code: lease.currency_code || 'PKR',
      status: initialStatus,
      line_items_json: JSON.stringify(lineItems),
    });

    // Auto-apply active tenant credits if available
    const finalInvoice = applyTenantCreditsToInvoice(createdInvoice);

    // Notify listeners so UI updates immediately
    db.notifyWrite();

    return finalInvoice;
  } catch (err) {
    console.error('generateFirstInvoice failed:', err);
    return null;
  }
}

