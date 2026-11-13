import { z } from 'zod';

const safeInt = (fallback = 0) =>
  z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return fallback;
    const num = Number(val);
    return Number.isFinite(num) ? Math.round(num) : fallback;
  }, z.number().int());

const nonNegativeInt = (fallback = 0) =>
  z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return fallback;
    const num = Number(val);
    return Number.isFinite(num) ? Math.max(0, Math.round(num)) : fallback;
  }, z.number().int().min(0));

const safeNumber = (fallback = 0) =>
  z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return fallback;
    const num = Number(val);
    return Number.isFinite(num) ? num : fallback;
  }, z.number());

const trimmedString = (fallback = '') =>
  z.preprocess((val) => {
    if (val === null || val === undefined) return fallback;
    return String(val).trim();
  }, z.string());

const nullableString = () =>
  z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return null;
    return String(val);
  }, z.string().nullable());

const currencyCodeSchema = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() ? val.trim().toUpperCase() : 'USD'),
  z.string().min(1)
);

const deletedAtSchema = z
  .preprocess((val) => (val === undefined ? null : val), z.number().nullable())
  .optional();

const baseInsertSchema = z
  .object({
    id: trimmedString('').refine((v) => v.length > 0, 'Record id is required'),
    updated_at: safeInt(Date.now()).optional(),
    device_id: trimmedString('local').optional(),
    deleted_at: deletedAtSchema,
  })
  .passthrough();

const organizationInsertSchema = baseInsertSchema
  .extend({
    name: trimmedString('RentFlow Portfolio'),
    country_code: trimmedString('US'),
    display_currency: currencyCodeSchema,
    timezone: trimmedString('UTC'),
    locale: trimmedString('en-US'),
    plan: z.enum(['landlord', 'agency', 'enterprise']).catch('landlord'),
  })
  .passthrough();

const ownerInsertSchema = baseInsertSchema
  .extend({
    org_id: trimmedString('default_org'),
    name: trimmedString('Property Owner'),
    email: nullableString().optional(),
    phone: nullableString().optional(),
    payout_details: nullableString().optional(),
    commission_type: z.enum(['flat', 'percentage']).catch('percentage'),
    commission_value: safeNumber(0),
  })
  .passthrough();

const propertyInsertSchema = baseInsertSchema
  .extend({
    org_id: trimmedString('default_org'),
    owner_id: nullableString().optional(),
    name: trimmedString('Untitled Property'),
    address_line1: nullableString().optional(),
    address_line2: nullableString().optional(),
    address: trimmedString('').optional(),
    city: nullableString().optional(),
    region: nullableString().optional(),
    postal_code: nullableString().optional(),
    type: z
      .enum(['residential_apartment', 'single_family', 'commercial', 'mixed_use', 'land'])
      .catch('residential_apartment'),
    country_code: trimmedString('US'),
    notes: nullableString().optional(),
    photo_url: nullableString().optional(),
  })
  .passthrough();

const unitInsertSchema = baseInsertSchema
  .extend({
    property_id: trimmedString(''),
    name: trimmedString('Unit'),
    size: safeNumber(0),
    area_unit: z.enum(['sqft', 'sqm']).catch('sqft'),
    bedrooms: nonNegativeInt(1),
    bathrooms: safeNumber(1),
    rent_minor: nonNegativeInt(0),
    currency_code: currencyCodeSchema,
    status: z.enum(['vacant', 'occupied', 'maintenance']).catch('vacant'),
    amenities_json: nullableString().optional(),
  })
  .passthrough();

const tenantInsertSchema = baseInsertSchema
  .extend({
    org_id: trimmedString('default_org'),
    name: trimmedString('Unnamed Resident'),
    phone: trimmedString(''),
    email: trimmedString(''),
    id_type: trimmedString('National ID'),
    id_number: trimmedString(''),
    emergency_contact: nullableString().optional(),
    occupants: nonNegativeInt(1).nullable().optional(),
  })
  .passthrough();

const leaseInsertSchema = baseInsertSchema
  .extend({
    unit_id: trimmedString(''),
    tenant_id: trimmedString(''),
    start_date: trimmedString(new Date().toISOString().slice(0, 10)),
    end_date: trimmedString(new Date().toISOString().slice(0, 10)),
    rent_minor: nonNegativeInt(0),
    currency_code: currencyCodeSchema,
    country_code_snapshot: trimmedString('US'),
    pack_version_snapshot: nonNegativeInt(1),
    billing_cycle: z.enum(['monthly', 'quarterly', 'bi-annual', 'annual']).catch('monthly'),
    due_day: z.preprocess((v) => {
      const n = Math.round(Number(v) || 1);
      return Math.min(28, Math.max(1, n));
    }, z.number().int().min(1).max(28)),
    deposit_minor: nonNegativeInt(0),
    late_fee_type: z.enum(['flat', 'percent', 'none']).catch('none'),
    late_fee_value: safeNumber(0),
    grace_days: nonNegativeInt(5),
    status: z.enum(['draft', 'active', 'expiring', 'expired', 'terminated']).catch('active'),
    terms_notes: nullableString().optional(),
  })
  .passthrough();

const invoiceInsertSchema = baseInsertSchema
  .extend({
    lease_id: trimmedString(''),
    period_start: trimmedString(new Date().toISOString().slice(0, 10)),
    period_end: trimmedString(new Date().toISOString().slice(0, 10)),
    due_date: trimmedString(new Date().toISOString().slice(0, 10)),
    subtotal_minor: nonNegativeInt(0),
    late_fee_minor: nonNegativeInt(0),
    total_minor: nonNegativeInt(0),
    amount_paid_minor: nonNegativeInt(0),
    currency_code: currencyCodeSchema,
    status: z.enum(['unpaid', 'partially_paid', 'paid', 'overdue', 'voided']).catch('unpaid'),
    voided_reason: nullableString().optional(),
    line_items_json: nullableString().optional(),
  })
  .passthrough();

const paymentInsertSchema = baseInsertSchema
  .extend({
    invoice_id: trimmedString('unallocated'),
    amount_minor: nonNegativeInt(0),
    currency_code: currencyCodeSchema,
    method: trimmedString('Bank Transfer'),
    reference: nullableString().optional(),
    paid_at: trimmedString(new Date().toISOString()),
    receipt_path: nullableString().optional(),
    reversal_of_id: nullableString().optional(),
  })
  .passthrough();

const creditInsertSchema = baseInsertSchema
  .extend({
    tenant_id: trimmedString('').optional(),
    lease_id: trimmedString('').optional(),
    amount_minor: nonNegativeInt(0),
    currency_code: currencyCodeSchema.optional(),
    reason: trimmedString('Credit').optional(),
    applied_invoice_id: nullableString().optional(),
    source_payment_id: nullableString().optional(),
    status: z.enum(['active', 'used', 'partially_used', 'refunded']).catch('active'),
  })
  .passthrough();

const depositInsertSchema = baseInsertSchema
  .extend({
    lease_id: trimmedString(''),
    amount_minor: nonNegativeInt(0),
    currency_code: currencyCodeSchema,
    received_at: trimmedString(new Date().toISOString().slice(0, 10)),
    status: z.enum(['held', 'returned', 'partially_returned', 'forfeited']).catch('held'),
    interest_accrued_minor: nonNegativeInt(0),
    returned_minor: nonNegativeInt(0),
    deductions_json: nullableString().optional(),
  })
  .passthrough();

const depositDeductionInsertSchema = baseInsertSchema
  .extend({
    deposit_id: trimmedString(''),
    lease_id: trimmedString(''),
    tenant_id: nullableString().optional(),
    amount_minor: nonNegativeInt(0),
    currency_code: currencyCodeSchema,
    reason: trimmedString('Security Deposit Deduction'),
    receipt_note: nullableString().optional(),
    deducted_at: trimmedString(new Date().toISOString()),
    created_at: safeInt(Date.now()),
  })
  .passthrough();

const maintenanceInsertSchema = baseInsertSchema
  .extend({
    unit_id: trimmedString(''),
    tenant_id: nullableString().optional(),
    category: z.enum(['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'other']).catch('other'),
    description: trimmedString('Maintenance request'),
    urgency: z.enum(['low', 'medium', 'high', 'emergency']).catch('medium'),
    status: z.enum(['new', 'assigned', 'in_progress', 'completed', 'closed']).catch('new'),
    vendor_id: nullableString().optional(),
    cost_minor: nonNegativeInt(0),
    paid_by: z.enum(['landlord', 'tenant', 'owner']).catch('landlord'),
    completed_at: nullableString().optional(),
    photo_url: nullableString().optional(),
  })
  .passthrough();

const documentInsertSchema = baseInsertSchema
  .extend({
    org_id: trimmedString('default_org'),
    title: trimmedString('Untitled Document'),
    category: z
      .enum([
        'lease_agreement',
        'tenant_id',
        'property_deed',
        'insurance_policy',
        'inspection_report',
        'tax_certificate',
        'utility_bill',
        'other',
      ])
      .catch('other'),
    related_entity_id: nullableString().optional(),
    file_name: trimmedString('document'),
    file_data_or_url: z.preprocess((v) => (v == null ? '' : String(v)), z.string()),
    file_size_bytes: nonNegativeInt(0).optional(),
    expiry_date: nullableString().optional(),
    notes: nullableString().optional(),
  })
  .passthrough();

const vendorInsertSchema = baseInsertSchema
  .extend({
    org_id: trimmedString('default_org'),
    name: trimmedString('Vendor'),
    category: trimmedString('general'),
    phone: trimmedString(''),
    email: trimmedString(''),
    rating: safeNumber(5).nullable().optional(),
    notes: nullableString().optional(),
  })
  .passthrough();

const expenseInsertSchema = baseInsertSchema
  .extend({
    org_id: trimmedString('default_org'),
    property_id: nullableString().optional(),
    unit_id: nullableString().optional(),
    category: trimmedString('repairs_and_maintenance'),
    amount_minor: nonNegativeInt(0),
    currency_code: currencyCodeSchema,
    expense_date: trimmedString(new Date().toISOString().slice(0, 10)),
    vendor_id: nullableString().optional(),
    receipt_path: nullableString().optional(),
    notes: nullableString().optional(),
  })
  .passthrough();

const rentIncreaseInsertSchema = baseInsertSchema
  .extend({
    unit_id: trimmedString(''),
    old_amount_minor: nonNegativeInt(0),
    new_amount_minor: nonNegativeInt(0),
    effective_date: trimmedString(new Date().toISOString().slice(0, 10)),
    reason: nullableString().optional(),
    user_id: nullableString().optional(),
    created_at: safeInt(Date.now()),
  })
  .passthrough();

const utilityBillInsertSchema = baseInsertSchema
  .extend({
    property_id: trimmedString(''),
    utility_type: z.enum(['electricity', 'water', 'gas', 'trash', 'internet']).catch('electricity'),
    bill_period: trimmedString(new Date().toISOString().slice(0, 7)),
    total_amount_minor: nonNegativeInt(0),
    split_method: z.enum(['by_sqft', 'equal_headcount']).catch('by_sqft'),
    splits_json: z.preprocess((v) => (typeof v === 'string' ? v : JSON.stringify(v ?? [])), z.string()),
    created_at: safeInt(Date.now()),
  })
  .passthrough();

const INSERT_SCHEMAS: Record<string, z.ZodType<any>> = {
  organizations: organizationInsertSchema,
  owners: ownerInsertSchema,
  properties: propertyInsertSchema,
  units: unitInsertSchema,
  tenants: tenantInsertSchema,
  leases: leaseInsertSchema,
  invoices: invoiceInsertSchema,
  payments: paymentInsertSchema,
  credits: creditInsertSchema,
  deposits: depositInsertSchema,
  deposit_deductions: depositDeductionInsertSchema,
  maintenance_requests: maintenanceInsertSchema,
  documents: documentInsertSchema,
  vendors: vendorInsertSchema,
  expenses: expenseInsertSchema,
  rent_increases: rentIncreaseInsertSchema,
  utility_bills: utilityBillInsertSchema,
};

const NON_NEGATIVE_MINOR_KEYS = new Set([
  'rent_minor',
  'deposit_minor',
  'subtotal_minor',
  'late_fee_minor',
  'total_minor',
  'amount_paid_minor',
  'amount_minor',
  'interest_accrued_minor',
  'returned_minor',
  'cost_minor',
  'old_amount_minor',
  'new_amount_minor',
  'total_amount_minor',
]);

/**
 * Validates and normalizes a new record before inserting into DBClient / SQLite.
 * Gracefully populates missing optional/default fields and enforces integer minor units.
 */
export function validateInsertRecord<T extends Record<string, any>>(tableName: string, record: T): T {
  const schema = INSERT_SCHEMAS[tableName] || baseInsertSchema;
  const parsed = schema.safeParse(record);
  if (parsed.success) {
    return parsed.data as T;
  }
  const reason = parsed.error.issues.map((i) => `${i.path.join('.') || 'record'}: ${i.message}`).join('; ');
  throw new Error(`Invalid ${tableName} record: ${reason}`);
}

/**
 * Sanitizes and normalizes partial update patches before merging into an existing record.
 */
export function validateUpdatePatch<T extends Record<string, any>>(
  _tableName: string,
  patch: Partial<T>
): Partial<T> {
  if (!patch || typeof patch !== 'object') {
    throw new Error('Update patch must be a valid object');
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (NON_NEGATIVE_MINOR_KEYS.has(key)) {
      const n = Number(value);
      cleaned[key] = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    } else if (key === 'due_day') {
      const n = Math.round(Number(value) || 1);
      cleaned[key] = Math.min(28, Math.max(1, n));
    } else if (key === 'currency_code' && typeof value === 'string') {
      cleaned[key] = value.trim().toUpperCase() || 'USD';
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned as Partial<T>;
}
