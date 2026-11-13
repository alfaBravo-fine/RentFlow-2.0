export interface Organization {
  id: string;
  name: string;
  country_code: string;
  display_currency: string;
  timezone: string;
  locale: string;
  plan: 'landlord' | 'agency' | 'enterprise';
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface User {
  id: string;
  org_id: string;
  google_sub: string;
  email: string;
  name: string;
  picture?: string | null;
  role: 'owner' | 'admin' | 'manager' | 'accountant';
  auth_provider: 'google' | 'pin' | 'local';
  status: 'active' | 'suspended';
  last_login_at?: number | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Workspace {
  id: string;
  org_id: string;
  storage_model: 'personal' | 'shared';
  drive_folder_id?: string | null;
  drive_owner_email?: string | null;
  encryption_salt: string;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface DeviceRegistry {
  id: string;
  user_id: string;
  workspace_id: string;
  device_name: string;
  os: string;
  last_sync_at?: number | null;
  revoked_at?: number | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Owner {
  id: string;
  org_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  payout_details?: string | null;
  commission_type: 'flat' | 'percentage';
  commission_value: number; // e.g. 10 = 10% or $100 flat
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Property {
  id: string;
  org_id: string;
  owner_id?: string | null;
  name: string;
  address_line1?: string | null;
  address_line2?: string | null;
  address?: string;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  type: 'residential_apartment' | 'single_family' | 'commercial' | 'mixed_use' | 'land';
  country_code: string;
  notes?: string | null;
  photo_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Unit {
  id: string;
  property_id: string;
  name: string; // e.g. "Apt 4B"
  size: number;
  area_unit: 'sqft' | 'sqm';
  bedrooms: number;
  bathrooms: number;
  rent_minor: number;
  currency_code: string;
  status: 'vacant' | 'occupied' | 'maintenance';
  amenities_json?: string | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Tenant {
  id: string;
  org_id: string;
  name: string;
  phone: string;
  email: string;
  id_type: string;
  id_number: string;
  emergency_contact?: string | null;
  occupants?: number | null;
  notes_json?: string | null;
  tags_json?: string | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Lease {
  id: string;
  unit_id: string;
  tenant_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  rent_minor: number;
  currency_code: string;
  country_code_snapshot: string;
  pack_version_snapshot: number;
  billing_cycle: 'monthly' | 'quarterly' | 'bi-annual' | 'annual';
  due_day: number; // 1-28
  deposit_minor: number;
  late_fee_type: 'flat' | 'percent' | 'none';
  late_fee_value: number;
  grace_days: number;
  status: 'draft' | 'active' | 'expiring' | 'expired' | 'terminated';
  terms_notes?: string | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Invoice {
  id: string;
  lease_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  subtotal_minor: number;
  late_fee_minor: number;
  total_minor: number;
  amount_paid_minor: number;
  currency_code: string;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'voided';
  voided_reason?: string | null;
  line_items_json?: string | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount_minor: number;
  currency_code: string;
  method: string;
  reference?: string | null;
  paid_at: string;
  receipt_path?: string | null;
  reversal_of_id?: string | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Credit {
  id: string;
  tenant_id?: string;
  tenantId?: string;
  lease_id?: string;
  leaseId?: string;
  amount_minor: number;
  amount?: number;
  currency_code?: string;
  reason?: string;
  applied_invoice_id?: string | null;
  source_payment_id?: string | null;
  status: 'active' | 'used' | 'partially_used' | 'refunded';
  created_at?: number;
  createdAt?: number;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Deposit {
  id: string;
  lease_id: string;
  amount_minor: number;
  currency_code: string;
  received_at: string;
  status: 'held' | 'returned' | 'partially_returned' | 'forfeited';
  interest_accrued_minor: number;
  returned_minor: number;
  deductions_json?: string | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface DepositDeduction {
  id: string;
  deposit_id: string;
  lease_id: string;
  tenant_id?: string | null;
  amount_minor: number;
  currency_code: string;
  reason: string;
  receipt_note?: string | null;
  deducted_at: string;
  created_at: number;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface MaintenanceRequest {
  id: string;
  unit_id: string;
  tenant_id?: string | null;
  category: 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'other';
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  status: 'new' | 'assigned' | 'in_progress' | 'completed' | 'closed';
  vendor_id?: string | null;
  cost_minor: number;
  paid_by: 'landlord' | 'tenant' | 'owner';
  completed_at?: string | null;
  photo_url?: string | null;
  needs_approval?: boolean;
  approved_by?: string | null;
  approved_at?: string | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface DocumentVaultItem {
  id: string;
  org_id: string;
  title: string;
  category: 'lease_agreement' | 'tenant_id' | 'property_deed' | 'insurance_policy' | 'inspection_report' | 'tax_certificate' | 'utility_bill' | 'other';
  related_entity_type?: 'property' | 'unit' | 'tenant' | 'lease' | 'owner';
  related_entity_id?: string | null;
  file_name: string;
  file_data_or_url: string; // Base64 or local blob URL
  file_size_bytes?: number;
  expiry_date?: string | null; // YYYY-MM-DD
  notes?: string | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface TenantContactLog {
  id: string;
  tenant_id: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'phone_call' | 'in_person';
  summary: string;
  details?: string | null;
  user_name?: string;
  created_at: number;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Vendor {
  id: string;
  org_id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  rating?: number | null;
  notes?: string | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface Expense {
  id: string;
  org_id: string;
  property_id?: string | null;
  unit_id?: string | null;
  category: string;
  amount_minor: number;
  currency_code: string;
  expense_date: string;
  vendor_id?: string | null;
  receipt_path?: string | null;
  notes?: string | null;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface RentIncrease {
  id: string;
  unit_id: string;
  old_amount_minor: number;
  new_amount_minor: number;
  effective_date: string;
  reason?: string | null;
  user_id?: string | null;
  created_at: number;
  updated_at?: number;
  device_id?: string;
  deleted_at?: number | null;
}

export interface UtilityBill {
  id: string;
  property_id: string;
  utility_type: 'electricity' | 'water' | 'gas' | 'trash' | 'internet';
  bill_period: string;
  total_amount_minor: number;
  split_method: 'by_sqft' | 'equal_headcount';
  splits_json: string; // Tenant breakdown
  created_at: number;
  updated_at: number;
  device_id: string;
  deleted_at?: number | null;
}

export interface AuditLog {
  id: string;
  org_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json?: string | null;
  after_json?: string | null;
  created_at: number;
}

export interface SyncQueueItem {
  id: number;
  table_name: string;
  record_id: string;
  op: 'insert' | 'update' | 'delete';
  payload_json: string;
  synced: boolean;
  file_id?: string | null;
  created_at: number;
}
