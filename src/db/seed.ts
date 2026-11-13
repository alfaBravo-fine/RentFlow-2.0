import { db } from './client';
import {
  Organization,
  User,
  Owner,
  Property,
  Unit,
  Tenant,
  Lease,
  Invoice,
  Payment,
  Deposit,
  MaintenanceRequest,
  Vendor,
  Expense,
  DocumentVaultItem,
  TenantContactLog,
} from './schema';

export function seedInitialData(force = false) {
  const orgs = db.getTable<Organization>('organizations');
  if (orgs.length > 0 && !force) return;

  console.log('Seeding RentFlow initial database and demo fixtures...');

  // 1. Organization
  const orgId = 'org_demo_1';
  db.insertItem<Organization>('organizations', {
    id: orgId,
    name: 'Horizon Property Management',
    country_code: 'US',
    display_currency: 'USD',
    timezone: 'America/New_York',
    locale: 'en-US',
    plan: 'agency',
  });

  // 2. User
  db.insertItem<User>('users', {
    id: 'user_sara',
    org_id: orgId,
    google_sub: 'google_109283748293',
    email: 'sara.landlord@example.com',
    name: 'Sara Miller',
    role: 'admin',
    auth_provider: 'google',
    status: 'active',
  });

  // 3. Owners
  const owner1 = db.insertItem<Owner>('owners', {
    id: 'owner_1',
    org_id: orgId,
    name: 'Apex Real Estate Holdings LLC',
    email: 'payouts@apexholdings.com',
    phone: '+1 555-0192',
    payout_details: 'Chase Bank Checking *4829',
    commission_type: 'percentage',
    commission_value: 8, // 8%
  });

  // 4. Properties (with latitude & longitude for interactive map)
  const prop1 = db.insertItem<Property>('properties', {
    id: 'prop_oak_ridge',
    org_id: orgId,
    owner_id: owner1.id,
    name: 'Oak Ridge Executive Apartments',
    address: '742 Evergreen Terrace, Springfield, IL 62704',
    type: 'residential_apartment',
    country_code: 'US',
    lat: 39.7817,
    lng: -89.6501,
    latitude: 39.7817,
    longitude: -89.6501,
    notes: '12-unit residential building built in 2018.',
  });

  const prop2 = db.insertItem<Property>('properties', {
    id: 'prop_marina_wharf',
    org_id: orgId,
    owner_id: owner1.id,
    name: 'Marina Bay Commercial & Loft Center',
    address: '100 Ocean Boulevard, San Francisco, CA 94105',
    type: 'mixed_use',
    country_code: 'US',
    lat: 37.788,
    lng: -122.399,
    latitude: 37.788,
    longitude: -122.399,
    notes: 'Prime waterfront commercial office and loft units.',
  });

  const prop3 = db.insertItem<Property>('properties', {
    id: 'prop_london_mews',
    org_id: orgId,
    owner_id: owner1.id,
    name: 'Kensington Mews Residences',
    address: '14 Kensington Mews, London SW7 2AZ, UK',
    type: 'residential_apartment',
    country_code: 'GB',
    lat: 51.4988,
    lng: -0.1789,
    latitude: 51.4988,
    longitude: -0.1789,
    notes: 'Luxury townhouse suites in Central London.',
  });

  // 5. Units
  const unit1 = db.insertItem<Unit>('units', {
    id: 'unit_101',
    property_id: prop1.id,
    name: 'Apt 101 - Ground Floor Garden',
    size: 850,
    area_unit: 'sqft',
    bedrooms: 2,
    bathrooms: 1,
    rent_minor: 185000, // $1,850.00
    currency_code: 'USD',
    status: 'occupied',
  });

  const unit2 = db.insertItem<Unit>('units', {
    id: 'unit_102',
    property_id: prop1.id,
    name: 'Apt 102 - Deluxe Corner Suite',
    size: 1100,
    area_unit: 'sqft',
    bedrooms: 2,
    bathrooms: 2,
    rent_minor: 220000, // $2,200.00
    currency_code: 'USD',
    status: 'occupied',
  });

  const unit3 = db.insertItem<Unit>('units', {
    id: 'unit_201',
    property_id: prop1.id,
    name: 'Apt 201 - Penthouse Loft',
    size: 1400,
    area_unit: 'sqft',
    bedrooms: 3,
    bathrooms: 2,
    rent_minor: 295000, // $2,950.00
    currency_code: 'USD',
    status: 'vacant',
  });

  // 6. Tenants
  const tenant1 = db.insertItem<Tenant>('tenants', {
    id: 'tenant_john_doe',
    org_id: orgId,
    name: 'Johnathan Doe',
    email: 'john.doe@example.com',
    phone: '+1 555-0144',
    id_type: 'State Driver License',
    id_number: 'DL-982310492',
    occupants: 2,
  });

  const tenant2 = db.insertItem<Tenant>('tenants', {
    id: 'tenant_emily_smith',
    org_id: orgId,
    name: 'Dr. Emily Smith',
    email: 'emily.smith@example.com',
    phone: '+1 555-0188',
    id_type: 'US Passport',
    id_number: 'P-98213891',
    occupants: 1,
  });

  // 7. Leases
  const lease1 = db.insertItem<Lease>('leases', {
    id: 'lease_101',
    unit_id: unit1.id,
    tenant_id: tenant1.id,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    rent_minor: 185000, // $1,850.00
    currency_code: 'USD',
    country_code_snapshot: 'US',
    pack_version_snapshot: 1,
    billing_cycle: 'monthly',
    due_day: 1,
    deposit_minor: 185000,
    late_fee_type: 'percent',
    late_fee_value: 5,
    grace_days: 5,
    status: 'active',
  });

  const lease2 = db.insertItem<Lease>('leases', {
    id: 'lease_102',
    unit_id: unit2.id,
    tenant_id: tenant2.id,
    start_date: '2026-02-01',
    end_date: '2026-11-30', // Expiring in 30 days!
    rent_minor: 220000,
    currency_code: 'USD',
    country_code_snapshot: 'US',
    pack_version_snapshot: 1,
    billing_cycle: 'monthly',
    due_day: 1,
    deposit_minor: 220000,
    late_fee_type: 'flat',
    late_fee_value: 50,
    grace_days: 5,
    status: 'expiring',
  });

  // 8. Deposits
  db.insertItem<Deposit>('deposits', {
    id: 'dep_101',
    lease_id: lease1.id,
    amount_minor: 185000,
    currency_code: 'USD',
    received_at: '2026-01-01',
    status: 'held',
    interest_accrued_minor: 1250, // $12.50 accrued
    returned_minor: 0,
  });

  // 9. Invoices & Payments
  const inv1 = db.insertItem<Invoice>('invoices', {
    id: 'inv_101_oct',
    lease_id: lease1.id,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    due_date: '2026-10-01',
    subtotal_minor: 185000,
    late_fee_minor: 0,
    total_minor: 185000,
    amount_paid_minor: 185000,
    currency_code: 'USD',
    status: 'paid',
  });

  db.insertItem<Payment>('payments', {
    id: 'pay_101_oct',
    invoice_id: inv1.id,
    amount_minor: 185000,
    currency_code: 'USD',
    method: 'ACH Bank Transfer',
    reference: 'ACH-8892104',
    paid_at: '2026-10-01T10:00:00Z',
  });

  const inv2 = db.insertItem<Invoice>('invoices', {
    id: 'inv_102_sep',
    lease_id: lease2.id,
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    due_date: '2026-09-01',
    subtotal_minor: 220000,
    late_fee_minor: 5000, // $50 late fee
    total_minor: 225000,
    amount_paid_minor: 100000, // $1,000 paid, $1,250 overdue
    currency_code: 'USD',
    status: 'overdue',
  });

  // 10. Vendors
  const vendor1 = db.insertItem<Vendor>('vendors', {
    id: 'vendor_plumbing',
    org_id: orgId,
    name: 'Rapid Response Plumbing Services',
    category: 'plumbing',
    phone: '+1 555-0122',
    email: 'service@rapidplumbing.com',
    rating: 4.9,
    notes: 'Available 24/7 emergency dispatch.',
  });

  // 11. Maintenance Requests
  db.insertItem<MaintenanceRequest>('maintenance_requests', {
    id: 'maint_101',
    unit_id: unit1.id,
    tenant_id: tenant1.id,
    category: 'plumbing',
    description: 'Master bathroom sink drain leaking onto cabinet base floor.',
    urgency: 'high',
    status: 'in_progress',
    vendor_id: vendor1.id,
    cost_minor: 18500, // $185.00
    paid_by: 'landlord',
  });

  // 12. Expenses
  db.insertItem<Expense>('expenses', {
    id: 'exp_roof_repair',
    org_id: orgId,
    property_id: prop1.id,
    unit_id: null,
    category: 'repairs_and_maintenance',
    amount_minor: 45000, // $450.00
    currency_code: 'USD',
    expense_date: '2026-10-15',
    vendor_id: vendor1.id,
    notes: 'Gutter cleaning and flashing reseal before winter.',
  });

  // 13. Documents
  const in20Days = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const in180Days = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  db.insertItem<DocumentVaultItem>('documents', {
    id: 'doc_insurance_oak',
    org_id: orgId,
    title: 'Property Hazard & Fire Insurance Policy',
    category: 'insurance_policy',
    related_entity_type: 'property',
    related_entity_id: prop1.id,
    file_name: 'OakRidge_Policy_2026.pdf',
    file_data_or_url: 'data:application/pdf;base64,JVBERi0xLjQK...',
    file_size_bytes: 245000,
    expiry_date: in20Days, // Expires soon! Triggers alert
    notes: 'Annual policy renewal required before expiration date.',
  });

  db.insertItem<DocumentVaultItem>('documents', {
    id: 'doc_lease_michael',
    org_id: orgId,
    title: 'Signed Tenancy Agreement - Unit 101',
    category: 'lease_agreement',
    related_entity_type: 'lease',
    related_entity_id: lease1.id,
    file_name: 'Lease_MichaelChen_Apt101.pdf',
    file_data_or_url: 'data:application/pdf;base64,JVBERi0xLjQK...',
    file_size_bytes: 512000,
    expiry_date: in180Days,
    notes: 'Countersigned digital copy stored on local device.',
  });

  // 14. Tenant Contact Logs
  db.insertItem<TenantContactLog>('tenant_contact_logs', {
    id: 'log_chen_1',
    tenant_id: tenant1.id,
    channel: 'whatsapp',
    summary: 'Sent monthly invoice reminder and receipt confirmation',
    details: 'Tenant confirmed online transfer via bank portal.',
    user_name: 'Sara Miller',
    created_at: Date.now() - 3 * 24 * 60 * 60 * 1000,
  });

  console.log('Seed completed successfully!');
}
