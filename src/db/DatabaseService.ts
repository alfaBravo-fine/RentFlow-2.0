/**
 * RentFlow DatabaseService
 *
 * Unified native desktop database service layer for Tauri v2 + SQLite:
 * - Desktop (Tauri v2): Directly invokes Rust #[tauri::command] handlers backed by SQLite (rentflow.db).
 * - In-Memory fallback for unit test / non-Tauri environments.
 */

import {
  isTauri,
  tauriDbGetTable,
  tauriDbInsertItem,
  tauriDbUpdateItem,
  tauriDbDeleteItem,
  tauriDbDeletePropertyCascading,
  tauriDbDeleteUnitCascading,
  tauriDbDeleteInvoiceCascading,
  tauriDbDeleteTenantCascading,
  tauriDbExportAll,
  tauriDbImportAll,
  tauriGetProperties,
  tauriAddProperty,
  tauriUpdateProperty,
  tauriDeleteProperty,
  tauriGetUnits,
  tauriAddUnit,
  tauriUpdateUnit,
  tauriDeleteUnit,
  tauriGetTenants,
  tauriAddTenant,
  tauriUpdateTenant,
  tauriDeleteTenant,
  tauriGetLeases,
  tauriAddLease,
  tauriUpdateLease,
  tauriDeleteLease,
  tauriGetInvoices,
  tauriAddInvoice,
  tauriUpdateInvoice,
  tauriDeleteInvoice,
  tauriGetPayments,
  tauriAddPayment,
  tauriRecordPaymentTransaction,
  tauriRecordDeductionTransaction,
  tauriGetExpenses,
  tauriAddExpense,
  tauriUpdateExpense,
  tauriDeleteExpense,
  tauriGetMaintenanceRequests,
  tauriAddMaintenanceRequest,
  tauriUpdateMaintenanceRequest,
  tauriDeleteMaintenanceRequest,
  tauriGetVendors,
  tauriAddVendor,
  tauriUpdateVendor,
  tauriDeleteVendor,
  tauriGetCredits,
  tauriAddCredit,
  tauriGetSettings,
  tauriSaveSetting,
  tauriSaveSettings,
  tauriGetAppDataPath,
  tauriWipeAllLocalData,
} from '../lib/tauri/bridge';
import { db } from './client';
import { generateUUID } from '../lib/uuid';
import { getDeviceId } from '../lib/device';
import { generateFirstInvoice } from '../lib/invoicing';
import { useAppSettingsStore } from '../stores/appSettingsStore';
import {
  Property,
  Unit,
  Tenant,
  Lease,
  Invoice,
  Payment,
  Deposit,
  DepositDeduction,
  Expense,
  Vendor,
  MaintenanceRequest,
  Credit,
} from './schema';

export type StorageBackend = 'sqlite' | 'memory';

export interface IDatabaseService {
  readonly backend: StorageBackend;
  initialize(): Promise<void>;
  onWrite(listener: () => void): () => void;

  // --- Properties CRUD ---
  getProperties(): Promise<Property[]>;
  addProperty(
    input: Omit<Property, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Property>;
  updateProperty(id: string, patch: Partial<Property>): Promise<Property | null>;
  deleteProperty(id: string): Promise<boolean>;

  // --- Units CRUD ---
  getUnits(propertyId?: string): Promise<Unit[]>;
  addUnit(input: Omit<Unit, 'id' | 'updated_at' | 'device_id'> & { id?: string }): Promise<Unit>;
  updateUnit(id: string, patch: Partial<Unit>): Promise<Unit | null>;
  deleteUnit(id: string): Promise<boolean>;

  // --- Tenants CRUD ---
  getTenants(): Promise<Tenant[]>;
  addTenant(
    input: Omit<Tenant, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Tenant>;
  updateTenant(id: string, patch: Partial<Tenant>): Promise<Tenant | null>;
  deleteTenant(id: string): Promise<boolean>;

  // --- Leases CRUD ---
  getLeases(): Promise<Lease[]>;
  addLease(
    input: Omit<Lease, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Lease>;
  updateLease(id: string, patch: Partial<Lease>): Promise<Lease | null>;
  deleteLease(id: string): Promise<boolean>;

  // --- Invoices CRUD ---
  getInvoices(leaseId?: string): Promise<Invoice[]>;
  addInvoice(
    input: Omit<Invoice, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Invoice>;
  updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice | null>;
  deleteInvoice(id: string): Promise<boolean>;

  // --- Payments CRUD ---
  getPayments(invoiceId?: string): Promise<Payment[]>;
  addPayment(
    input: Omit<Payment, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Payment>;
  recordPayment(
    invoiceId: string,
    amountMinor: number,
    method: string,
    reference?: string
  ): Promise<{ payment: Payment; invoice: Invoice; credit?: Credit | null }>;
  allocatePayment(
    leaseId: string,
    amountMinor: number,
    method: string,
    reference?: string
  ): Promise<{ payment: Payment; allocatedInvoices: Invoice[]; credit?: Credit | null }>;
  recordDeduction(
    leaseId: string,
    items: Array<{ id?: string; reason: string; amountMinor: number }>,
    receiptNote?: string | null
  ): Promise<{ deposit: Deposit; deductions: DepositDeduction[]; remainingBalanceMinor: number }>;

  // --- Expenses CRUD ---
  getExpenses(): Promise<Expense[]>;
  addExpense(
    input: Omit<Expense, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Expense>;
  updateExpense(id: string, patch: Partial<Expense>): Promise<Expense | null>;
  deleteExpense(id: string): Promise<boolean>;

  // --- Maintenance Requests CRUD ---
  getMaintenanceRequests(): Promise<MaintenanceRequest[]>;
  addMaintenanceRequest(
    input: Omit<MaintenanceRequest, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<MaintenanceRequest>;
  updateMaintenanceRequest(
    id: string,
    patch: Partial<MaintenanceRequest>
  ): Promise<MaintenanceRequest | null>;
  deleteMaintenanceRequest(id: string): Promise<boolean>;

  // --- Vendors CRUD ---
  getVendors(): Promise<Vendor[]>;
  addVendor(
    input: Omit<Vendor, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Vendor>;
  updateVendor(id: string, patch: Partial<Vendor>): Promise<Vendor | null>;
  deleteVendor(id: string): Promise<boolean>;

  // --- Credits CRUD ---
  getCredits(leaseId?: string): Promise<Credit[]>;
  addCredit(
    input: Omit<Credit, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Credit>;

  // --- Settings & Path Operations ---
  getSettings(): Promise<Record<string, any>>;
  saveSetting(key: string, value: any): Promise<void>;
  saveSettings(settings: Record<string, any>): Promise<void>;
  getAppDataPath(): Promise<string>;

  // --- Generic & Cascading Operations ---
  getTable<T extends { deleted_at?: number | null; deletedAt?: number | null }>(
    tableName: string
  ): Promise<T[]>;
  getTableSync<T extends { deleted_at?: number | null; deletedAt?: number | null }>(
    tableName: string
  ): T[];
  getItem<T extends { id: string; deleted_at?: number | null; deletedAt?: number | null }>(
    tableName: string,
    id: string
  ): Promise<T | null>;
  insertItem<T extends { id: string }>(tableName: string, item: T): Promise<T>;
  updateItem<T extends { id: string }>(
    tableName: string,
    id: string,
    patch: Partial<T>
  ): Promise<T | null>;
  deleteItem(tableName: string, id: string): Promise<boolean>;
  deletePropertyCascading(propertyId: string): Promise<boolean>;
  deleteUnitCascading(unitId: string): Promise<boolean>;
  deleteInvoiceCascading(invoiceId: string): Promise<boolean>;
  deleteTenantCascading(tenantId: string): Promise<boolean>;
  exportAll(): Promise<Record<string, any[]>>;
  importAll(data: Record<string, any[]>): Promise<void>;
  wipeAllLocalData(): Promise<void>;
}

export class DatabaseService implements IDatabaseService {
  private static instance: DatabaseService;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  public get backend(): StorageBackend {
    return isTauri() ? 'sqlite' : 'memory';
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (isTauri()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke<string>('db_init');
            const snapshot = await tauriDbExportAll();
            if (snapshot && Object.keys(snapshot).length > 0) {
              await db.importAllDataAsync(snapshot, false);
            }
            const settings = await tauriGetSettings();
            if (settings && typeof settings === 'object' && Object.keys(settings).length > 0) {
              useAppSettingsStore.getState().applySettingsSnapshot(settings);
            }
          } catch (err) {
            console.warn('[DatabaseService] Tauri SQLite init notice:', err);
          }
        } else {
          await db.hydrateFromMemory();
        }

        this.isInitialized = true;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  public onWrite(listener: () => void): () => void {
    return db.onWrite(listener);
  }

  // ==========================================================================
  // PROPERTIES CRUD
  // ==========================================================================

  public async getProperties(): Promise<Property[]> {
    if (isTauri()) {
      try {
        const rows = await tauriGetProperties();
        return rows.filter((r) => !r.deleted_at);
      } catch (err) {
        console.warn('[DatabaseService] Tauri get_properties fallback:', err);
      }
    }
    return db.getTable<Property>('properties');
  }

  public async addProperty(
    input: Omit<Property, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Property> {
    const record: Property = {
      ...input,
      id: input.id || generateUUID(),
      updated_at: Date.now(),
      device_id: getDeviceId(),
      deleted_at: null,
    };
    if (isTauri()) {
      try {
        await tauriAddProperty(record);
      } catch (err) {
        console.warn('[DatabaseService] Tauri add_property error:', err);
      }
    }
    return db.insertItem<Property>('properties', record);
  }

  public async updateProperty(id: string, patch: Partial<Property>): Promise<Property | null> {
    if (isTauri()) {
      try {
        await tauriUpdateProperty(id, patch);
      } catch (err) {
        console.warn('[DatabaseService] Tauri update_property error:', err);
      }
    }
    return db.updateItem<Property>('properties', id, patch);
  }

  public async deleteProperty(id: string): Promise<boolean> {
    if (isTauri()) {
      try {
        await tauriDeleteProperty(id);
      } catch (err) {
        console.warn('[DatabaseService] Tauri delete_property error:', err);
      }
    }
    return db.deletePropertyCascadingAsync(id);
  }

  // ==========================================================================
  // UNITS CRUD
  // ==========================================================================

  public async getUnits(propertyId?: string): Promise<Unit[]> {
    let list: Unit[];
    if (isTauri()) {
      try {
        list = (await tauriGetUnits()).filter((u) => !u.deleted_at);
      } catch {
        list = db.getTable<Unit>('units');
      }
    } else {
      list = db.getTable<Unit>('units');
    }
    return propertyId ? list.filter((u) => u.property_id === propertyId) : list;
  }

  public async addUnit(
    input: Omit<Unit, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Unit> {
    const record: Unit = {
      ...input,
      id: input.id || generateUUID(),
      updated_at: Date.now(),
      device_id: getDeviceId(),
      deleted_at: null,
    };
    if (isTauri()) {
      try {
        await tauriAddUnit(record);
      } catch (err) {
        console.warn('[DatabaseService] Tauri add_unit error:', err);
      }
    }
    return db.insertItem<Unit>('units', record);
  }

  public async updateUnit(id: string, patch: Partial<Unit>): Promise<Unit | null> {
    if (isTauri()) {
      try {
        await tauriUpdateUnit(id, patch);
      } catch (err) {
        console.warn('[DatabaseService] Tauri update_unit error:', err);
      }
    }
    return db.updateItem<Unit>('units', id, patch);
  }

  public async deleteUnit(id: string): Promise<boolean> {
    if (isTauri()) {
      try {
        await tauriDeleteUnit(id);
      } catch (err) {
        console.warn('[DatabaseService] Tauri delete_unit error:', err);
      }
    }
    return db.deleteUnitCascadingAsync(id);
  }

  // ==========================================================================
  // TENANTS CRUD
  // ==========================================================================

  public async getTenants(): Promise<Tenant[]> {
    if (isTauri()) {
      try {
        const rows = await tauriGetTenants();
        return rows.filter((t) => !t.deleted_at);
      } catch {
        // fallback
      }
    }
    return db.getTable<Tenant>('tenants');
  }

  public async addTenant(
    input: Omit<Tenant, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Tenant> {
    const record: Tenant = {
      ...input,
      id: input.id || generateUUID(),
      updated_at: Date.now(),
      device_id: getDeviceId(),
      deleted_at: null,
    };
    if (isTauri()) {
      try {
        await tauriAddTenant(record);
      } catch (err) {
        console.warn('[DatabaseService] Tauri add_tenant error:', err);
      }
    }
    return db.insertItem<Tenant>('tenants', record);
  }

  public async updateTenant(id: string, patch: Partial<Tenant>): Promise<Tenant | null> {
    if (isTauri()) {
      try {
        await tauriUpdateTenant(id, patch);
      } catch (err) {
        console.warn('[DatabaseService] Tauri update_tenant error:', err);
      }
    }
    return db.updateItem<Tenant>('tenants', id, patch);
  }

  public async deleteTenant(id: string): Promise<boolean> {
    if (isTauri()) {
      try {
        await tauriDeleteTenant(id);
      } catch (err) {
        console.warn('[DatabaseService] Tauri delete_tenant error:', err);
      }
    }
    return db.deleteTenantCascadingAsync(id);
  }

  // ==========================================================================
  // LEASES CRUD
  // ==========================================================================

  public async getLeases(): Promise<Lease[]> {
    if (isTauri()) {
      try {
        const rows = await tauriGetLeases();
        return rows.filter((l) => !l.deleted_at);
      } catch {
        // fallback
      }
    }
    return db.getTable<Lease>('leases');
  }

  public async addLease(
    input: Omit<Lease, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Lease> {
    const record: Lease = {
      ...input,
      id: input.id || generateUUID(),
      updated_at: Date.now(),
      device_id: getDeviceId(),
      deleted_at: null,
    };
    if (isTauri()) {
      try {
        await tauriAddLease(record);
      } catch (err) {
        console.warn('[DatabaseService] Tauri add_lease error:', err);
      }
    }
    const created = db.insertItem<Lease>('leases', record);

    if (created.status === 'active') {
      try {
        generateFirstInvoice(created);
        db.updateItem<Unit>('units', created.unit_id, { status: 'occupied' });
        if (isTauri()) {
          tauriUpdateUnit(created.unit_id, { status: 'occupied' }).catch(() => {});
        }
      } catch (err) {
        console.error('generateFirstInvoice failed in addLease:', err);
      }
    }
    return created;
  }

  public async updateLease(id: string, patch: Partial<Lease>): Promise<Lease | null> {
    if (isTauri()) {
      try {
        await tauriUpdateLease(id, patch);
      } catch (err) {
        console.warn('[DatabaseService] Tauri update_lease error:', err);
      }
    }
    const updated = db.updateItem<Lease>('leases', id, patch);
    if (updated) {
      if (updated.status === 'expired' || updated.status === 'terminated') {
        db.updateItem<Unit>('units', updated.unit_id, { status: 'vacant' });
        if (isTauri()) {
          tauriUpdateUnit(updated.unit_id, { status: 'vacant' }).catch(() => {});
        }
      } else if (updated.status === 'active') {
        db.updateItem<Unit>('units', updated.unit_id, { status: 'occupied' });
        if (isTauri()) {
          tauriUpdateUnit(updated.unit_id, { status: 'occupied' }).catch(() => {});
        }
      }
    }
    return updated;
  }

  public async deleteLease(id: string): Promise<boolean> {
    if (isTauri()) {
      try {
        await tauriDeleteLease(id);
      } catch (err) {
        console.warn('[DatabaseService] Tauri delete_lease error:', err);
      }
    }
    return db.softDeleteItem('leases', id);
  }

  // ==========================================================================
  // INVOICES CRUD
  // ==========================================================================

  public async getInvoices(leaseId?: string): Promise<Invoice[]> {
    let list: Invoice[];
    if (isTauri()) {
      try {
        list = (await tauriGetInvoices()).filter((i) => !i.deleted_at);
      } catch {
        list = db.getTable<Invoice>('invoices');
      }
    } else {
      list = db.getTable<Invoice>('invoices');
    }
    return leaseId ? list.filter((i) => i.lease_id === leaseId) : list;
  }

  public async addInvoice(
    input: Omit<Invoice, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Invoice> {
    const record: Invoice = {
      ...input,
      id: input.id || generateUUID(),
      updated_at: Date.now(),
      device_id: getDeviceId(),
      deleted_at: null,
    };
    if (isTauri()) {
      try {
        await tauriAddInvoice(record);
      } catch (err) {
        console.warn('[DatabaseService] Tauri add_invoice error:', err);
      }
    }
    return db.insertItem<Invoice>('invoices', record);
  }

  public async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice | null> {
    if (isTauri()) {
      try {
        await tauriUpdateInvoice(id, patch);
      } catch (err) {
        console.warn('[DatabaseService] Tauri update_invoice error:', err);
      }
    }
    return db.updateItem<Invoice>('invoices', id, patch);
  }

  public async deleteInvoice(id: string): Promise<boolean> {
    if (isTauri()) {
      try {
        await tauriDeleteInvoice(id);
      } catch (err) {
        console.warn('[DatabaseService] Tauri delete_invoice error:', err);
      }
    }
    return db.deleteInvoiceCascadingAsync(id);
  }

  // ==========================================================================
  // PAYMENTS CRUD & TRANSACTIONS
  // ==========================================================================

  public async getPayments(invoiceId?: string): Promise<Payment[]> {
    if (isTauri()) {
      try {
        const rows = (await tauriGetPayments()).filter((p) => !p.deleted_at);
        return invoiceId ? rows.filter((p) => p.invoice_id === invoiceId) : rows;
      } catch {
        // fallback
      }
    }
    const list = db.getTable<Payment>('payments');
    return invoiceId ? list.filter((p) => p.invoice_id === invoiceId) : list;
  }

  public async addPayment(
    input: Omit<Payment, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Payment> {
    const record: Payment = {
      ...input,
      id: input.id || generateUUID(),
      updated_at: Date.now(),
      device_id: getDeviceId(),
      deleted_at: null,
    };
    if (isTauri()) {
      try {
        await tauriAddPayment(record);
      } catch (err) {
        console.warn('[DatabaseService] Tauri add_payment error:', err);
      }
    }
    return db.insertItem<Payment>('payments', record);
  }

  public async recordPayment(
    invoiceId: string,
    amountMinor: number,
    method: string,
    reference?: string
  ): Promise<{ payment: Payment; invoice: Invoice; credit?: Credit | null }> {
    if (isTauri()) {
      const paymentId = generateUUID();
      const result = await tauriRecordPaymentTransaction(
        invoiceId,
        paymentId,
        amountMinor,
        method,
        reference || `REF-${Date.now().toString().slice(-6)}`
      );
      const snapshot = await tauriDbExportAll();
      if (snapshot) {
        await db.importAllDataAsync(snapshot, false);
      }
      return result;
    }

    return db.recordInvoicePaymentAsync(invoiceId, amountMinor, method, reference);
  }

  public async allocatePayment(
    leaseId: string,
    amountMinor: number,
    method: string,
    reference?: string
  ): Promise<{ payment: Payment; allocatedInvoices: Invoice[]; credit?: Credit | null }> {
    return db.allocatePaymentAsync(leaseId, amountMinor, method, reference);
  }

  public async recordDeduction(
    leaseId: string,
    items: Array<{ id?: string; reason: string; amountMinor: number }>,
    receiptNote?: string | null
  ): Promise<{ deposit: Deposit; deductions: DepositDeduction[]; remainingBalanceMinor: number }> {
    if (isTauri()) {
      const normalized = items
        .map((item) => ({
          id: item.id || generateUUID(),
          reason: String(item.reason || '').trim(),
          amount_minor: Math.round(Number(item.amountMinor) || 0),
        }))
        .filter((i) => i.reason.length > 0 && i.amount_minor > 0);

      const res = await tauriRecordDeductionTransaction(leaseId, normalized, receiptNote);
      const snapshot = await tauriDbExportAll();
      if (snapshot) {
        await db.importAllDataAsync(snapshot, false);
      }
      return res;
    }
    return db.recordDeductionAsync(leaseId, items, receiptNote);
  }

  // ==========================================================================
  // EXPENSES CRUD
  // ==========================================================================

  public async getExpenses(): Promise<Expense[]> {
    if (isTauri()) {
      try {
        const rows = (await tauriGetExpenses()).filter((e) => !e.deleted_at);
        return rows;
      } catch {
        // fallback
      }
    }
    return db.getTable<Expense>('expenses');
  }

  public async addExpense(
    input: Omit<Expense, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Expense> {
    const record: Expense = {
      ...input,
      id: input.id || generateUUID(),
      updated_at: Date.now(),
      device_id: getDeviceId(),
      deleted_at: null,
    };
    if (isTauri()) {
      try {
        await tauriAddExpense(record);
      } catch (err) {
        console.warn('[DatabaseService] Tauri add_expense error:', err);
      }
    }
    return db.insertItem<Expense>('expenses', record);
  }

  public async updateExpense(id: string, patch: Partial<Expense>): Promise<Expense | null> {
    if (isTauri()) {
      try {
        await tauriUpdateExpense(id, patch);
      } catch (err) {
        console.warn('[DatabaseService] Tauri update_expense error:', err);
      }
    }
    return db.updateItem<Expense>('expenses', id, patch);
  }

  public async deleteExpense(id: string): Promise<boolean> {
    if (isTauri()) {
      try {
        await tauriDeleteExpense(id);
      } catch (err) {
        console.warn('[DatabaseService] Tauri delete_expense error:', err);
      }
    }
    return db.softDeleteItem('expenses', id);
  }

  // ==========================================================================
  // MAINTENANCE REQUESTS CRUD
  // ==========================================================================

  public async getMaintenanceRequests(): Promise<MaintenanceRequest[]> {
    if (isTauri()) {
      try {
        const rows = (await tauriGetMaintenanceRequests()).filter((m) => !m.deleted_at);
        return rows;
      } catch {
        // fallback
      }
    }
    return db.getTable<MaintenanceRequest>('maintenance_requests');
  }

  public async addMaintenanceRequest(
    input: Omit<MaintenanceRequest, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<MaintenanceRequest> {
    const record: MaintenanceRequest = {
      ...input,
      id: input.id || generateUUID(),
      updated_at: Date.now(),
      device_id: getDeviceId(),
      deleted_at: null,
    };
    if (isTauri()) {
      try {
        await tauriAddMaintenanceRequest(record);
      } catch (err) {
        console.warn('[DatabaseService] Tauri add_maintenance_request error:', err);
      }
    }
    return db.insertItem<MaintenanceRequest>('maintenance_requests', record);
  }

  public async updateMaintenanceRequest(
    id: string,
    patch: Partial<MaintenanceRequest>
  ): Promise<MaintenanceRequest | null> {
    if (isTauri()) {
      try {
        await tauriUpdateMaintenanceRequest(id, patch);
      } catch (err) {
        console.warn('[DatabaseService] Tauri update_maintenance_request error:', err);
      }
    }
    return db.updateItem<MaintenanceRequest>('maintenance_requests', id, patch);
  }

  public async deleteMaintenanceRequest(id: string): Promise<boolean> {
    if (isTauri()) {
      try {
        await tauriDeleteMaintenanceRequest(id);
      } catch (err) {
        console.warn('[DatabaseService] Tauri delete_maintenance_request error:', err);
      }
    }
    return db.softDeleteItem('maintenance_requests', id);
  }

  // ==========================================================================
  // VENDORS CRUD
  // ==========================================================================

  public async getVendors(): Promise<Vendor[]> {
    if (isTauri()) {
      try {
        const rows = (await tauriGetVendors()).filter((v) => !v.deleted_at);
        return rows;
      } catch {
        // fallback
      }
    }
    return db.getTable<Vendor>('vendors');
  }

  public async addVendor(
    input: Omit<Vendor, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Vendor> {
    const record: Vendor = {
      ...input,
      id: input.id || generateUUID(),
      updated_at: Date.now(),
      device_id: getDeviceId(),
      deleted_at: null,
    };
    if (isTauri()) {
      try {
        await tauriAddVendor(record);
      } catch (err) {
        console.warn('[DatabaseService] Tauri add_vendor error:', err);
      }
    }
    return db.insertItem<Vendor>('vendors', record);
  }

  public async updateVendor(id: string, patch: Partial<Vendor>): Promise<Vendor | null> {
    if (isTauri()) {
      try {
        await tauriUpdateVendor(id, patch);
      } catch (err) {
        console.warn('[DatabaseService] Tauri update_vendor error:', err);
      }
    }
    return db.updateItem<Vendor>('vendors', id, patch);
  }

  public async deleteVendor(id: string): Promise<boolean> {
    if (isTauri()) {
      try {
        await tauriDeleteVendor(id);
      } catch (err) {
        console.warn('[DatabaseService] Tauri delete_vendor error:', err);
      }
    }
    return db.softDeleteItem('vendors', id);
  }

  // ==========================================================================
  // CREDITS CRUD
  // ==========================================================================

  public async getCredits(leaseId?: string): Promise<Credit[]> {
    if (isTauri()) {
      try {
        const rows = (await tauriGetCredits()).filter((c) => !c.deleted_at);
        return leaseId ? rows.filter((c) => c.lease_id === leaseId) : rows;
      } catch {
        // fallback
      }
    }
    const list = db.getTable<Credit>('credits');
    return leaseId ? list.filter((c) => c.lease_id === leaseId) : list;
  }

  public async addCredit(
    input: Omit<Credit, 'id' | 'updated_at' | 'device_id'> & { id?: string }
  ): Promise<Credit> {
    const record: Credit = {
      ...input,
      id: input.id || generateUUID(),
      updated_at: Date.now(),
      device_id: getDeviceId(),
      deleted_at: null,
    };
    if (isTauri()) {
      try {
        await tauriAddCredit(record);
      } catch (err) {
        console.warn('[DatabaseService] Tauri add_credit error:', err);
      }
    }
    return db.insertItem<Credit>('credits', record);
  }

  // ==========================================================================
  // SETTINGS & DATA PATH
  // ==========================================================================

  public async getSettings(): Promise<Record<string, any>> {
    if (isTauri()) {
      try {
        return await tauriGetSettings();
      } catch (err) {
        console.warn('[DatabaseService] Tauri get_settings error:', err);
      }
    }
    return {};
  }

  public async saveSetting(key: string, value: any): Promise<void> {
    if (isTauri()) {
      try {
        await tauriSaveSetting(key, value);
      } catch (err) {
        console.warn('[DatabaseService] Tauri save_setting error:', err);
      }
    }
  }

  public async saveSettings(settings: Record<string, any>): Promise<void> {
    if (isTauri()) {
      try {
        await tauriSaveSettings(settings);
      } catch (err) {
        console.warn('[DatabaseService] Tauri save_settings error:', err);
      }
    }
  }

  public async getAppDataPath(): Promise<string> {
    if (isTauri()) {
      try {
        return await tauriGetAppDataPath();
      } catch (err) {
        console.warn('[DatabaseService] Tauri get_app_data_path error:', err);
      }
    }
    return 'Desktop Application Memory';
  }

  // ==========================================================================
  // GENERIC TABLE OPERATIONS
  // ==========================================================================

  public async getTable<T extends { deleted_at?: number | null; deletedAt?: number | null }>(
    tableName: string
  ): Promise<T[]> {
    if (isTauri()) {
      try {
        const rows = await tauriDbGetTable<T>(tableName);
        return rows.filter((r) => !r.deleted_at && !(r as any).deletedAt);
      } catch (err) {
        console.warn(`[DatabaseService] Fallback to cache for table ${tableName}:`, err);
      }
    }
    return db.getTable<T>(tableName);
  }

  public getTableSync<T extends { deleted_at?: number | null; deletedAt?: number | null }>(
    tableName: string
  ): T[] {
    return db.getTable<T>(tableName);
  }

  public async getItem<
    T extends { id: string; deleted_at?: number | null; deletedAt?: number | null },
  >(tableName: string, id: string): Promise<T | null> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const item = await invoke<T | null>('db_get_item', { tableName, id });
        if (item && !item.deleted_at && !(item as any).deletedAt) {
          return item;
        }
      } catch (err) {
        console.warn(`[DatabaseService] Fallback for getItem ${tableName}/${id}:`, err);
      }
    }
    return db.getItem<T>(tableName, id);
  }

  public async insertItem<T extends { id: string }>(tableName: string, item: T): Promise<T> {
    const stamped = db.insertItem<any>(tableName, item);
    if (isTauri()) {
      try {
        await tauriDbInsertItem(tableName, stamped);
      } catch (err) {
        console.warn(`[DatabaseService] SQLite insert error on ${tableName}:`, err);
      }
    }
    return stamped;
  }

  public async updateItem<T extends { id: string }>(
    tableName: string,
    id: string,
    patch: Partial<T>
  ): Promise<T | null> {
    const updated = db.updateItem<any>(tableName, id, patch);
    if (isTauri() && updated) {
      try {
        await tauriDbUpdateItem(tableName, id, updated);
      } catch (err) {
        console.warn(`[DatabaseService] SQLite update error on ${tableName}:`, err);
      }
    }
    return updated;
  }

  public async deleteItem(tableName: string, id: string): Promise<boolean> {
    const deleted = db.softDeleteItem(tableName, id);
    if (isTauri()) {
      try {
        await tauriDbDeleteItem(tableName, id);
      } catch (err) {
        console.warn(`[DatabaseService] SQLite delete error on ${tableName}:`, err);
      }
    }
    return deleted;
  }

  public async deletePropertyCascading(propertyId: string): Promise<boolean> {
    const ok = await db.deletePropertyCascadingAsync(propertyId);
    if (isTauri()) {
      try {
        await tauriDbDeletePropertyCascading(propertyId);
      } catch (err) {
        console.warn('[DatabaseService] SQLite cascading property delete error:', err);
      }
    }
    return ok;
  }

  public async deleteUnitCascading(unitId: string): Promise<boolean> {
    const ok = await db.deleteUnitCascadingAsync(unitId);
    if (isTauri()) {
      try {
        await tauriDbDeleteUnitCascading(unitId);
      } catch (err) {
        console.warn('[DatabaseService] SQLite cascading unit delete error:', err);
      }
    }
    return ok;
  }

  public async deleteInvoiceCascading(invoiceId: string): Promise<boolean> {
    const ok = await db.deleteInvoiceCascadingAsync(invoiceId);
    if (isTauri()) {
      try {
        await tauriDbDeleteInvoiceCascading(invoiceId);
      } catch (err) {
        console.warn('[DatabaseService] SQLite cascading invoice delete error:', err);
      }
    }
    return ok;
  }

  public async deleteTenantCascading(tenantId: string): Promise<boolean> {
    const ok = await db.deleteTenantCascadingAsync(tenantId);
    if (isTauri()) {
      try {
        await tauriDbDeleteTenantCascading(tenantId);
      } catch (err) {
        console.warn('[DatabaseService] SQLite cascading tenant delete error:', err);
      }
    }
    return ok;
  }

  public async exportAll(): Promise<Record<string, any[]>> {
    if (isTauri()) {
      try {
        return await tauriDbExportAll();
      } catch (err) {
        console.warn('[DatabaseService] SQLite export fallback:', err);
      }
    }
    return db.exportAllData();
  }

  public async importAll(data: Record<string, any[]>): Promise<void> {
    await db.importAllDataAsync(data, true);
    if (isTauri()) {
      try {
        await tauriDbImportAll(data);
      } catch (err) {
        console.warn('[DatabaseService] SQLite import error:', err);
      }
    }
  }

  public async wipeAllLocalData(): Promise<void> {
    await db.wipeAllDataAsync();
    useAppSettingsStore.getState().resetSettings();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.clear();
      } catch {
        // Ignore storage errors
      }
    }
    if (isTauri()) {
      await tauriWipeAllLocalData();
    }
  }
}

export const databaseService = DatabaseService.getInstance();
