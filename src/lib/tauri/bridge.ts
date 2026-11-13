/**
 * RentFlow Tauri v2 Desktop Bridge
 * Seamlessly interfaces React frontend with the Rust backend (SQLite & Loopback OAuth)
 * when running inside Tauri, with graceful non-Tauri memory fallback for tests.
 */

import { Invoice, Lease, Payment, Property, Tenant, Unit } from '../../db/schema';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
    throw new Error(`Tauri is not available in browser mode. Command '${cmd}' skipped.`);
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd, args);
  } catch (err: any) {
    console.error(`[Tauri Bridge] Error invoking command '${cmd}':`, err);
    throw err;
  }
}

// --- Database Operations (SQLite / SQLCipher AES-256) ---

export async function tauriDbGetTable<T>(tableName: string): Promise<T[]> {
  return invokeTauri<T[]>('db_get_table', { tableName });
}

export async function tauriDbInsertItem<T>(tableName: string, item: any): Promise<T> {
  return invokeTauri<T>('db_insert_item', { tableName, item });
}

export async function tauriDbUpdateItem<T>(tableName: string, id: string, updates: any): Promise<T> {
  return invokeTauri<T>('db_update_item', { tableName, id, updates });
}

export async function tauriDbDeleteItem(tableName: string, id: string): Promise<void> {
  return invokeTauri<void>('db_delete_item', { tableName, id });
}

export async function tauriDbDeletePropertyCascading(propertyId: string): Promise<void> {
  return invokeTauri<void>('db_delete_property_cascading', { propertyId });
}

export async function tauriDbDeleteUnitCascading(unitId: string): Promise<void> {
  return invokeTauri<void>('db_delete_unit_cascading', { unitId });
}

export async function tauriDbDeleteInvoiceCascading(invoiceId: string): Promise<void> {
  return invokeTauri<void>('db_delete_invoice_cascading', { invoiceId });
}

export async function tauriDbDeleteTenantCascading(tenantId: string): Promise<void> {
  return invokeTauri<void>('db_delete_tenant_cascading', { tenantId });
}

export async function tauriDbExportAll(): Promise<Record<string, any[]>> {
  return invokeTauri<Record<string, any[]>>('db_export_all');
}

export async function tauriDbImportAll(data: Record<string, any[]>): Promise<void> {
  return invokeTauri<void>('db_import_all', { data });
}

export async function tauriBackupDatabaseFile(destinationPath: string): Promise<string> {
  return invokeTauri<string>('db_backup_file', { destinationPath });
}

// --- Typed Domain SQLite Commands & Transactions ---

export async function tauriGetProperties(): Promise<Property[]> {
  return invokeTauri<Property[]>('get_properties');
}

export async function tauriAddProperty(property: Property): Promise<Property> {
  return invokeTauri<Property>('add_property', { property });
}

export async function tauriUpdateProperty(id: string, property: Partial<Property>): Promise<Property> {
  return invokeTauri<Property>('update_property', { id, property });
}

export async function tauriDeleteProperty(id: string): Promise<void> {
  return invokeTauri<void>('delete_property', { id });
}

export async function tauriGetUnits(): Promise<Unit[]> {
  return invokeTauri<Unit[]>('get_units');
}

export async function tauriAddUnit(unit: Unit): Promise<Unit> {
  return invokeTauri<Unit>('add_unit', { unit });
}

export async function tauriUpdateUnit(id: string, unit: Partial<Unit>): Promise<Unit> {
  return invokeTauri<Unit>('update_unit', { id, unit });
}

export async function tauriDeleteUnit(id: string): Promise<void> {
  return invokeTauri<void>('delete_unit', { id });
}

export async function tauriGetTenants(): Promise<Tenant[]> {
  return invokeTauri<Tenant[]>('get_tenants');
}

export async function tauriAddTenant(tenant: Tenant): Promise<Tenant> {
  return invokeTauri<Tenant>('add_tenant', { tenant });
}

export async function tauriUpdateTenant(id: string, tenant: Partial<Tenant>): Promise<Tenant> {
  return invokeTauri<Tenant>('update_tenant', { id, tenant });
}

export async function tauriDeleteTenant(id: string): Promise<void> {
  return invokeTauri<void>('delete_tenant', { id });
}

export async function tauriGetLeases(): Promise<Lease[]> {
  return invokeTauri<Lease[]>('get_leases');
}

export async function tauriAddLease(lease: Lease): Promise<Lease> {
  return invokeTauri<Lease>('add_lease', { lease });
}

export async function tauriUpdateLease(id: string, lease: Partial<Lease>): Promise<Lease> {
  return invokeTauri<Lease>('update_lease', { id, lease });
}

export async function tauriDeleteLease(id: string): Promise<void> {
  return invokeTauri<void>('delete_lease', { id });
}

export async function tauriGetInvoices(): Promise<Invoice[]> {
  return invokeTauri<Invoice[]>('get_invoices');
}

export async function tauriAddInvoice(invoice: Invoice): Promise<Invoice> {
  return invokeTauri<Invoice>('add_invoice', { invoice });
}

export async function tauriUpdateInvoice(id: string, invoice: Partial<Invoice>): Promise<Invoice> {
  return invokeTauri<Invoice>('update_invoice', { id, invoice });
}

export async function tauriDeleteInvoice(id: string): Promise<void> {
  return invokeTauri<void>('delete_invoice', { id });
}

export async function tauriGetPayments(): Promise<Payment[]> {
  return invokeTauri<Payment[]>('get_payments');
}

export async function tauriAddPayment(payment: Payment): Promise<Payment> {
  return invokeTauri<Payment>('add_payment', { payment });
}

export async function tauriRecordPaymentTransaction(
  invoiceId: string,
  paymentId: string,
  amountMinor: number,
  method: string,
  reference?: string
): Promise<{ payment: Payment; invoice: Invoice; credit?: any }> {
  return invokeTauri<{ payment: Payment; invoice: Invoice; credit?: any }>('record_payment_transaction', {
    invoiceId,
    paymentId,
    amountMinor,
    method,
    reference: reference || null,
  });
}

export async function tauriRecordDeductionTransaction(
  leaseId: string,
  items: Array<{ id: string; reason: string; amount_minor: number }>,
  receiptNote?: string | null
): Promise<{ deposit: any; deductions: any[]; remainingBalanceMinor: number }> {
  return invokeTauri<{ deposit: any; deductions: any[]; remainingBalanceMinor: number }>(
    'record_deduction_transaction',
    {
      leaseId,
      items,
      receiptNote: receiptNote || null,
    }
  );
}

export async function tauriWipeAllLocalData(): Promise<void> {
  return invokeTauri<void>('wipe_all_local_data');
}

// --- Expenses ---
export async function tauriGetExpenses(): Promise<any[]> {
  return invokeTauri<any[]>('get_expenses');
}

export async function tauriAddExpense(expense: any): Promise<any> {
  return invokeTauri<any>('add_expense', { expense });
}

export async function tauriUpdateExpense(id: string, expense: any): Promise<any> {
  return invokeTauri<any>('update_expense', { id, expense });
}

export async function tauriDeleteExpense(id: string): Promise<void> {
  return invokeTauri<void>('delete_expense', { id });
}

// --- Maintenance Requests ---
export async function tauriGetMaintenanceRequests(): Promise<any[]> {
  return invokeTauri<any[]>('get_maintenance_requests');
}

export async function tauriAddMaintenanceRequest(request: any): Promise<any> {
  return invokeTauri<any>('add_maintenance_request', { request });
}

export async function tauriUpdateMaintenanceRequest(id: string, request: any): Promise<any> {
  return invokeTauri<any>('update_maintenance_request', { id, request });
}

export async function tauriDeleteMaintenanceRequest(id: string): Promise<void> {
  return invokeTauri<void>('delete_maintenance_request', { id });
}

// --- Vendors ---
export async function tauriGetVendors(): Promise<any[]> {
  return invokeTauri<any[]>('get_vendors');
}

export async function tauriAddVendor(vendor: any): Promise<any> {
  return invokeTauri<any>('add_vendor', { vendor });
}

export async function tauriUpdateVendor(id: string, vendor: any): Promise<any> {
  return invokeTauri<any>('update_vendor', { id, vendor });
}

export async function tauriDeleteVendor(id: string): Promise<void> {
  return invokeTauri<void>('delete_vendor', { id });
}

// --- Credits ---
export async function tauriGetCredits(): Promise<any[]> {
  return invokeTauri<any[]>('get_credits');
}

export async function tauriAddCredit(credit: any): Promise<any> {
  return invokeTauri<any>('add_credit', { credit });
}

// --- Settings & Path ---
export async function tauriGetSettings(): Promise<Record<string, any>> {
  return invokeTauri<Record<string, any>>('get_settings');
}

export async function tauriSaveSetting(key: string, value: any): Promise<void> {
  return invokeTauri<void>('save_setting', { key, value });
}

export async function tauriSaveSettings(settings: Record<string, any>): Promise<void> {
  return invokeTauri<void>('save_settings', { settings });
}

export async function tauriGetAppDataPath(): Promise<string> {
  return invokeTauri<string>('get_app_data_path');
}

// --- Production Google OAuth (Desktop Loopback) ---

export interface TauriUserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export async function tauriGoogleLogin(): Promise<TauriUserProfile> {
  return invokeTauri<TauriUserProfile>('google_login');
}

export async function tauriGoogleOAuth(): Promise<TauriUserProfile> {
  return invokeTauri<TauriUserProfile>('google_oauth');
}

export async function tauriGoogleLogout(): Promise<void> {
  return invokeTauri<void>('google_oauth_logout');
}

export async function tauriGoogleGetCurrentUser(): Promise<TauriUserProfile | null> {
  return invokeTauri<TauriUserProfile | null>('google_get_current_user');
}

// --- Google Drive Sync (Push/Pull in Rust Backend) ---

export interface TauriSyncResult {
  success: boolean;
  synced_at: string;
  file_id?: string;
  message: string;
}

export interface TauriPullResult {
  restored: boolean;
  message: string;
}

export async function tauriDrivePushBackup(googleId: string): Promise<TauriSyncResult> {
  return invokeTauri<TauriSyncResult>('drive_push_backup', { googleId });
}

export async function tauriDrivePullBackup(googleId: string): Promise<TauriPullResult> {
  return invokeTauri<TauriPullResult>('drive_pull_backup', { googleId });
}
