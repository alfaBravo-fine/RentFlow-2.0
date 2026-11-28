/**
 * RentFlow Tauri v2 Desktop Bridge
 * Dedicated native desktop IPC bridge interfacing React with the Rust backend
 * (SQLite, Google OAuth loopback, Google Drive sync, Native Dialogs, and OS Autostart).
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Invoice, Lease, Payment, Property, Tenant, Unit } from '../../db/schema';

export function isTauri(): boolean {
  return typeof window !== 'undefined';
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err: any) {
    console.error(`[Tauri Bridge] Error invoking command '${cmd}':`, err);
    throw err;
  }
}

// --- Database Operations (SQLite) ---

export async function tauriDbInit(): Promise<string> {
  return invokeTauri<string>('db_init');
}

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

export interface MonthlyFinanceSqlRow {
  month_key: string;
  income_minor: number;
  expense_minor: number;
}

export async function tauriGetMonthlyIncomeVsExpenses(months = 6): Promise<MonthlyFinanceSqlRow[]> {
  return invokeTauri<MonthlyFinanceSqlRow[]>('get_monthly_income_vs_expenses', { months });
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

// --- Settings, Data Path & Migration ---
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

export async function tauriGetDataPath(): Promise<string> {
  return invokeTauri<string>('get_data_path');
}

export async function tauriSetDataPath(path: string): Promise<string> {
  return invokeTauri<string>('set_data_path', { path });
}

export async function tauriMigrateDatabase(newPath: string): Promise<string> {
  return invokeTauri<string>('migrate_database', { newPath });
}

export async function tauriPickDirectory(title?: string, defaultPath?: string): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: title || 'Select Folder',
    defaultPath: defaultPath || undefined,
  });
  return typeof selected === 'string' && selected.trim() ? selected : null;
}

// --- Production Google OAuth (Desktop Loopback) ---

export interface AuthResponse {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export type TauriUserProfile = AuthResponse;

export async function tauriGoogleLogin(): Promise<AuthResponse> {
  return invokeTauri<AuthResponse>('google_login');
}

export async function tauriCancelGoogleLogin(): Promise<void> {
  return invokeTauri<void>('cancel_google_login');
}

export async function tauriGoogleOAuth(): Promise<AuthResponse> {
  return invokeTauri<AuthResponse>('google_oauth');
}

export async function tauriGoogleLogout(): Promise<void> {
  return invokeTauri<void>('google_oauth_logout');
}

export async function tauriGoogleGetCurrentUser(): Promise<AuthResponse | null> {
  return invokeTauri<AuthResponse | null>('google_get_current_user');
}

// --- Google Drive Sync (Smart Grouped Sync: Change History + Full Backups in Rust Backend) ---

export interface BackupManifestEntry {
  filename: string;
  date: string;
  size: string;
  size_bytes?: number;
  file_id?: string;
  record_count?: number;
  folder_name?: string;
  folder_id?: string;
}

export interface ChangeHistoryEntry {
  filename: string;
  entity: string;
  table: string;
  action: 'add' | 'edit' | 'delete' | string;
  record_id: string;
  summary?: string;
  date: string;
  size: string;
  size_bytes?: number;
  file_id?: string;
  folder_name?: string;
  folder_id?: string;
}

export interface BackupGroupEntry {
  folder_name: string;
  folder_id?: string;
  created_at: string;
  updated_at: string;
  started_epoch: number;
  full_snapshot_filename?: string;
  full_snapshot_file_id?: string;
  full_snapshot_size?: string;
  record_count?: number;
  changes: ChangeHistoryEntry[];
}

export interface GroupedBackupList {
  full_backups: BackupManifestEntry[];
  change_history: ChangeHistoryEntry[];
  groups: BackupGroupEntry[];
  changes_since_full_backup: number;
  last_full_backup_at?: string | null;
}

export interface ChangePayloadInput {
  entity: string;
  table: string;
  action: 'add' | 'edit' | 'delete';
  record_id: string;
  summary?: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  timestamp?: string;
}

export interface TauriSyncResult {
  success: boolean;
  synced_at: string;
  file_id?: string;
  folder_id?: string;
  filename?: string;
  snapshot_count?: number;
  full_backup_triggered?: boolean;
  full_backup_filename?: string;
  message: string;
}

export interface TauriPullResult {
  restored: boolean;
  filename?: string;
  message: string;
}

export async function tauriDrivePushBackup(googleId?: string): Promise<TauriSyncResult> {
  return invokeTauri<TauriSyncResult>('drive_push_backup', googleId ? { googleId } : undefined);
}

export async function tauriDrivePushChange(
  change: ChangePayloadInput,
  googleId?: string
): Promise<TauriSyncResult> {
  return invokeTauri<TauriSyncResult>('drive_push_change', {
    change,
    ...(googleId ? { googleId } : {}),
  });
}

export async function tauriDrivePullBackup(googleId?: string): Promise<TauriPullResult> {
  return invokeTauri<TauriPullResult>('drive_pull_backup', googleId ? { googleId } : undefined);
}

export async function tauriGetBackupList(): Promise<BackupManifestEntry[]> {
  return invokeTauri<BackupManifestEntry[]>('get_backup_list');
}

export async function tauriGetGroupedBackupList(): Promise<GroupedBackupList> {
  return invokeTauri<GroupedBackupList>('get_grouped_backup_list');
}

export async function tauriRestoreFromSnapshot(
  filename: string,
  folderId?: string
): Promise<TauriPullResult> {
  return invokeTauri<TauriPullResult>('restore_from_snapshot', {
    filename,
    ...(folderId ? { folderId } : {}),
  });
}

export async function tauriRestoreGroupBackup(folderName: string): Promise<TauriPullResult> {
  return invokeTauri<TauriPullResult>('restore_group_backup', { folderName });
}

export async function tauriRevertChangeSnapshot(
  filename: string,
  folderId?: string
): Promise<TauriPullResult> {
  return invokeTauri<TauriPullResult>('revert_change_snapshot', {
    filename,
    ...(folderId ? { folderId } : {}),
  });
}

// --- Desktop Autostart (tauri-plugin-autostart) ---

export async function tauriGetAutostartEnabled(): Promise<boolean> {
  const { isEnabled } = await import('@tauri-apps/plugin-autostart');
  return await isEnabled();
}

export async function tauriSetAutostartEnabled(enabled: boolean): Promise<boolean> {
  const { enable, disable, isEnabled } = await import('@tauri-apps/plugin-autostart');
  if (enabled) {
    await enable();
  } else {
    await disable();
  }
  return await isEnabled();
}

export async function tauriRestartApp(): Promise<void> {
  await invokeTauri<void>('restart_app');
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function tauriWriteBinaryFile(
  filePath: string,
  bytes: Uint8Array
): Promise<number> {
  const contentBase64 = uint8ArrayToBase64(bytes);
  return invokeTauri<number>('write_binary_file', {
    filePath,
    contentBase64,
  });
}

