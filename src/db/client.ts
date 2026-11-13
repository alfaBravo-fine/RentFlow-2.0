import { getDeviceId } from '../lib/device';
import { generateUUID } from '../lib/uuid';
import { getCurrencyMinorUnits, minorToMajorNumber } from '../lib/money';
import { validateInsertRecord, validateUpdatePatch } from './validation';
import {
  isTauri,
  tauriDbInsertItem,
  tauriDbUpdateItem,
  tauriDbDeleteItem,
  tauriDbDeletePropertyCascading,
  tauriDbDeleteUnitCascading,
  tauriDbDeleteInvoiceCascading,
  tauriDbDeleteTenantCascading,
  tauriDbImportAll,
} from '../lib/tauri/bridge';
import {
  Property,
  Unit,
  Tenant,
  Lease,
  Invoice,
  Payment,
  Credit,
  Deposit,
  DepositDeduction,
  MaintenanceRequest,
  AuditLog,
  SyncQueueItem,
} from './schema';

export const ALL_DB_TABLES = [
  'organizations',
  'users',
  'workspaces',
  'device_registry',
  'owners',
  'properties',
  'units',
  'tenants',
  'leases',
  'invoices',
  'payments',
  'credits',
  'deposits',
  'deposit_deductions',
  'maintenance_requests',
  'documents',
  'tenant_contact_logs',
  'vendors',
  'expenses',
  'rent_increases',
  'utility_bills',
  'audit_log',
  'sync_queue',
] as const;

export type DBTableName = (typeof ALL_DB_TABLES)[number];

export interface ParsedDeductionItem {
  id: string;
  reason: string;
  amount_minor: number;
  date: string;
}

export function parseDepositDeductions(raw: unknown): ParsedDeductionItem[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).deductions)) {
      return (parsed as any).deductions;
    }
    return [];
  } catch {
    return [];
  }
}

function normalizeRecord<T extends Record<string, any>>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const normalized: any = { ...row };
  if ('deletedAt' in normalized) {
    normalized.deleted_at = normalized.deleted_at ?? normalized.deletedAt ?? null;
    delete normalized.deletedAt;
  }
  const resolvedUnitName =
    normalized.name || normalized.number || normalized.unit_number || normalized.unitNumber;
  if (!normalized.name && resolvedUnitName) {
    normalized.name = String(resolvedUnitName).trim();
  }
  return normalized as T;
}

export class DBClient {
  private deviceId: string;
  private writeListeners: Array<() => void> = [];
  private store: Map<string, any[]> = new Map();
  private hydrated = false;

  constructor() {
    this.deviceId = getDeviceId();
    for (const tableName of ALL_DB_TABLES) {
      this.store.set(tableName, []);
    }
  }

  public isHydrated(): boolean {
    return this.hydrated;
  }

  private getMemoryTable<T>(tableName: string): T[] {
    const existing = this.store.get(tableName);
    if (existing) return existing as T[];
    const empty: T[] = [];
    this.store.set(tableName, empty);
    return empty;
  }

  private setMemoryTable<T>(tableName: string, items: T[]): void {
    this.store.set(tableName, [...items]);
  }

  public async flush(): Promise<void> {
    return Promise.resolve();
  }

  public async hydrateFromMemory(): Promise<void> {
    this.hydrated = true;
    this.backfillDepositDeductions();
    this.syncUnitOccupancy();
    this.notifyWrite();
  }

  private backfillDepositDeductions(): void {
    const leases = this.getMemoryTable<Lease>('leases');
    const deposits = this.getMemoryTable<Deposit>('deposits');
    const existingDeductions = this.getMemoryTable<DepositDeduction>('deposit_deductions');

    const leaseById = new Map(leases.map((l) => [l.id, l]));
    const existingIds = new Set(existingDeductions.map((d) => d.id));
    let changed = false;

    const updatedDeductions = existingDeductions.map((dd) => {
      if (!dd.tenant_id) {
        const lease = leaseById.get(dd.lease_id);
        if (lease?.tenant_id) {
          changed = true;
          return { ...dd, tenant_id: lease.tenant_id };
        }
      }
      return dd;
    });

    for (const deposit of deposits) {
      if (deposit.deleted_at || (deposit as any).deletedAt) continue;
      const parsed = parseDepositDeductions(deposit.deductions_json);
      if (parsed.length === 0) continue;
      const lease = leaseById.get(deposit.lease_id);
      for (const item of parsed) {
        const itemId = item.id || `${deposit.id}_${item.reason}_${item.amount_minor}`;
        if (!existingIds.has(itemId) && Number(item.amount_minor) > 0) {
          existingIds.add(itemId);
          const ts = item.date ? new Date(item.date).getTime() || deposit.updated_at : deposit.updated_at;
          updatedDeductions.push({
            id: itemId,
            deposit_id: deposit.id,
            lease_id: deposit.lease_id,
            tenant_id: lease?.tenant_id || null,
            amount_minor: Number(item.amount_minor),
            currency_code: deposit.currency_code || lease?.currency_code || 'USD',
            reason: item.reason || 'Security Deposit Deduction',
            receipt_note: null,
            deducted_at: item.date || new Date(ts || Date.now()).toISOString(),
            created_at: ts || Date.now(),
            updated_at: deposit.updated_at || Date.now(),
            device_id: deposit.device_id || this.deviceId,
            deleted_at: null,
          });
          changed = true;
        }
      }
    }

    if (changed) {
      this.setMemoryTable('deposit_deductions', updatedDeductions);
    }
  }

  public onWrite(listener: () => void): () => void {
    this.writeListeners.push(listener);
    return () => {
      this.writeListeners = this.writeListeners.filter((l) => l !== listener);
    };
  }

  public notifyWrite() {
    this.writeListeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Error in db write listener:', err);
      }
    });
  }

  // --- Audit & Sync Queue Builders ---

  private buildSyncItem(
    tableName: string,
    recordId: string,
    op: 'insert' | 'update' | 'delete',
    payload: any
  ): SyncQueueItem {
    return {
      id: Date.now() + Math.floor(Math.random() * 10000),
      table_name: tableName,
      record_id: recordId,
      op,
      payload_json: JSON.stringify(payload),
      synced: false,
      created_at: Date.now(),
    };
  }

  private buildAuditEntry(
    action: string,
    entityType: string,
    entityId: string,
    before?: any,
    after?: any
  ): AuditLog {
    return {
      id: generateUUID(),
      org_id: 'default_org',
      user_id: 'local_user',
      action,
      entity_type: entityType,
      entity_id: entityId,
      before_json: before ? JSON.stringify(before) : null,
      after_json: after ? JSON.stringify(after) : null,
      created_at: Date.now(),
    };
  }

  public recordAudit(action: string, entityType: string, entityId: string, before?: any, after?: any) {
    const logs = this.getMemoryTable<AuditLog>('audit_log');
    const entry = this.buildAuditEntry(action, entityType, entityId, before, after);
    logs.unshift(entry);
    this.setMemoryTable('audit_log', logs);
    if (isTauri()) {
      tauriDbInsertItem('audit_log', entry).catch(() => {});
    }
  }

  public markSyncQueueSynced(): void {
    const queue = this.getMemoryTable<SyncQueueItem>('sync_queue');
    const updated = queue.map((item) => ({ ...item, synced: true }));
    this.setMemoryTable('sync_queue', updated);
  }

  // --- Read Operations ---

  public getRawTable<T>(tableName: string): T[] {
    return [...this.getMemoryTable<T>(tableName)];
  }

  public getTable<T extends { deleted_at?: number | null; deletedAt?: number | null }>(
    tableName: string
  ): T[] {
    const rows = this.getMemoryTable<T>(tableName);
    return rows.filter((r) => !r.deleted_at && !(r as any).deletedAt);
  }

  public getItem<T extends { id: string; deleted_at?: number | null; deletedAt?: number | null }>(
    tableName: string,
    id: string
  ): T | null {
    const rows = this.getMemoryTable<T>(tableName);
    const found = rows.find((r) => r.id === id);
    if (!found || found.deleted_at || (found as any).deletedAt) return null;
    return found;
  }

  // --- Write Operations (Reactive Cache + Native Tauri SQLite) ---

  public insertItem<T extends { id: string; updated_at?: number; device_id?: string }>(
    tableName: string,
    item: Omit<T, 'updated_at' | 'device_id'> & Partial<Pick<T, 'updated_at' | 'device_id'>>
  ): T {
    const rows = [...this.getMemoryTable<T>(tableName)];
    const stamped = validateInsertRecord(
      tableName,
      normalizeRecord({
        ...item,
        updated_at: Date.now(),
        device_id: this.deviceId,
        deleted_at: null,
      })
    ) as unknown as T;

    const existingIdx = rows.findIndex((r) => r.id === stamped.id);
    if (existingIdx >= 0) {
      rows[existingIdx] = stamped;
    } else {
      rows.push(stamped);
    }
    this.setMemoryTable(tableName, rows);

    const syncItem = this.buildSyncItem(tableName, stamped.id, 'insert', stamped);
    const syncQueue = [...this.getMemoryTable<SyncQueueItem>('sync_queue'), syncItem];
    this.setMemoryTable('sync_queue', syncQueue);

    const auditEntry = this.buildAuditEntry('CREATE', tableName, stamped.id, null, stamped);
    const auditLogs = [auditEntry, ...this.getMemoryTable<AuditLog>('audit_log')];
    this.setMemoryTable('audit_log', auditLogs);

    if (isTauri()) {
      tauriDbInsertItem(tableName, stamped).catch((err) =>
        console.warn('[Tauri SQLite] insert error:', err)
      );
      tauriDbInsertItem('audit_log', auditEntry).catch(() => {});
    }

    if (tableName === 'leases') {
      const unitId = (stamped as any).unit_id;
      if (unitId) {
        this.syncUnitOccupancy(unitId);
      }
    }

    this.notifyWrite();
    return stamped;
  }

  public updateItem<T extends { id: string; updated_at?: number; device_id?: string }>(
    tableName: string,
    id: string,
    patch: Partial<T>
  ): T | null {
    const rows = [...this.getMemoryTable<T>(tableName)];
    const index = rows.findIndex((r) => r.id === id);
    if (index === -1) return null;

    const before = rows[index];
    const sanitizedPatch = validateUpdatePatch(tableName, patch as Record<string, any>);
    const updated = normalizeRecord({
      ...before,
      ...sanitizedPatch,
      updated_at: Date.now(),
      device_id: this.deviceId,
    }) as T;

    rows[index] = updated;
    this.setMemoryTable(tableName, rows);

    const syncItem = this.buildSyncItem(tableName, id, 'update', updated);
    const syncQueue = [...this.getMemoryTable<SyncQueueItem>('sync_queue'), syncItem];
    this.setMemoryTable('sync_queue', syncQueue);

    const auditEntry = this.buildAuditEntry('UPDATE', tableName, id, before, updated);
    const auditLogs = [auditEntry, ...this.getMemoryTable<AuditLog>('audit_log')];
    this.setMemoryTable('audit_log', auditLogs);

    if (isTauri()) {
      tauriDbUpdateItem(tableName, id, updated).catch((err) =>
        console.warn('[Tauri SQLite] update error:', err)
      );
      tauriDbInsertItem('audit_log', auditEntry).catch(() => {});
    }

    if (tableName === 'leases') {
      const prevUnitId = (before as any).unit_id;
      const newUnitId = (updated as any).unit_id;
      if (prevUnitId) this.syncUnitOccupancy(prevUnitId);
      if (newUnitId && newUnitId !== prevUnitId) this.syncUnitOccupancy(newUnitId);
    }

    this.notifyWrite();
    return updated;
  }

  public softDeleteItem<
    T extends {
      id: string;
      deleted_at?: number | null;
      deletedAt?: number | null;
      updated_at?: number;
      device_id?: string;
    },
  >(tableName: string, id: string): boolean {
    const rows = [...this.getMemoryTable<T>(tableName)];
    const index = rows.findIndex((r) => r.id === id);
    if (index === -1) return false;

    const before = rows[index];
    const now = Date.now();
    const updated = normalizeRecord({
      ...before,
      deleted_at: now,
      updated_at: now,
      device_id: this.deviceId,
    }) as T;

    rows[index] = updated;
    this.setMemoryTable(tableName, rows);

    const syncItem = this.buildSyncItem(tableName, id, 'delete', updated);
    const syncQueue = [...this.getMemoryTable<SyncQueueItem>('sync_queue'), syncItem];
    this.setMemoryTable('sync_queue', syncQueue);

    const auditEntry = this.buildAuditEntry('DELETE', tableName, id, before, updated);
    const auditLogs = [auditEntry, ...this.getMemoryTable<AuditLog>('audit_log')];
    this.setMemoryTable('audit_log', auditLogs);

    if (isTauri()) {
      tauriDbDeleteItem(tableName, id).catch((err) =>
        console.warn('[Tauri SQLite] delete error:', err)
      );
      tauriDbInsertItem('audit_log', auditEntry).catch(() => {});
    }

    if (tableName === 'leases') {
      const unitId = (before as any).unit_id;
      if (unitId) this.syncUnitOccupancy(unitId);
    }

    this.notifyWrite();
    return true;
  }

  public syncUnitOccupancy(targetUnitId?: string): void {
    const leases = this.getTable<Lease>('leases');
    const units = [...this.getMemoryTable<Unit>('units')];
    let hasChanges = false;

    const updateStatus = (u: Unit, targetStatus: 'occupied' | 'vacant') => {
      if (u.status === targetStatus || u.status === 'maintenance') return;
      const updated: Unit = {
        ...u,
        status: targetStatus,
        updated_at: Date.now(),
        device_id: this.deviceId,
      };
      const idx = units.findIndex((item) => item.id === u.id);
      if (idx !== -1) {
        units[idx] = updated;
        hasChanges = true;
      }
      if (isTauri()) {
        tauriDbUpdateItem('units', u.id, updated).catch(() => {});
      }
    };

    if (targetUnitId) {
      const unit = units.find(
        (u) => u.id === targetUnitId && !u.deleted_at && !(u as any).deletedAt
      );
      if (unit) {
        const hasActiveLease = leases.some(
          (l) => l.unit_id === targetUnitId && l.status === 'active' && !l.deleted_at && !(l as any).deletedAt
        );
        updateStatus(unit, hasActiveLease ? 'occupied' : 'vacant');
      }
    } else {
      units.forEach((u) => {
        if (u.deleted_at || (u as any).deletedAt) return;
        const hasActiveLease = leases.some(
          (l) => l.unit_id === u.id && l.status === 'active' && !l.deleted_at && !(l as any).deletedAt
        );
        updateStatus(u, hasActiveLease ? 'occupied' : 'vacant');
      });
    }

    if (hasChanges) {
      this.setMemoryTable('units', units);
    }
  }

  // --- Transactional Cascading Soft Deletes ---

  public deletePropertyCascading(propertyId: string): boolean {
    void this.deletePropertyCascadingAsync(propertyId).catch(() => {});
    return true;
  }

  public async deletePropertyCascadingAsync(propertyId: string): Promise<boolean> {
    const now = Date.now();
    const prevProps = [...this.getMemoryTable<Property>('properties')];
    const prevUnits = [...this.getMemoryTable<Unit>('units')];
    const prevLeases = [...this.getMemoryTable<Lease>('leases')];
    const prevInvoices = [...this.getMemoryTable<Invoice>('invoices')];
    const prevPayments = [...this.getMemoryTable<Payment>('payments')];
    const prevMaint = [...this.getMemoryTable<MaintenanceRequest>('maintenance_requests')];
    const prevCredits = [...this.getMemoryTable<Credit>('credits')];
    const prevDeposits = [...this.getMemoryTable<Deposit>('deposits')];
    const prevDeductions = [...this.getMemoryTable<DepositDeduction>('deposit_deductions')];

    const updatedProps = prevProps.map((p) =>
      p.id === propertyId ? { ...p, deleted_at: now, updated_at: now, device_id: this.deviceId } : p
    );

    const unitIds = new Set<string>();
    const updatedUnits = prevUnits.map((u) => {
      if (u.property_id === propertyId && !u.deleted_at && !(u as any).deletedAt) {
        unitIds.add(u.id);
        return { ...u, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return u;
    });

    const leaseIds = new Set<string>();
    const updatedLeases = prevLeases.map((l) => {
      if (unitIds.has(l.unit_id) && !l.deleted_at && !(l as any).deletedAt) {
        leaseIds.add(l.id);
        return { ...l, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return l;
    });

    const invoiceIds = new Set<string>();
    const updatedInvoices = prevInvoices.map((inv) => {
      if (leaseIds.has(inv.lease_id) && !inv.deleted_at && !(inv as any).deletedAt) {
        invoiceIds.add(inv.id);
        return { ...inv, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return inv;
    });

    const updatedPayments = prevPayments.map((pay) => {
      if (invoiceIds.has(pay.invoice_id) && !pay.deleted_at && !(pay as any).deletedAt) {
        return { ...pay, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return pay;
    });

    const updatedMaint = prevMaint.map((m) => {
      if (unitIds.has(m.unit_id) && !m.deleted_at && !(m as any).deletedAt) {
        return { ...m, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return m;
    });

    const updatedCredits = prevCredits.map((c) => {
      const cid = c.lease_id || (c as any).leaseId;
      if (cid && leaseIds.has(cid) && !c.deleted_at && !(c as any).deletedAt) {
        return { ...c, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return c;
    });

    const depositIds = new Set<string>();
    const updatedDeposits = prevDeposits.map((d) => {
      if (leaseIds.has(d.lease_id) && !d.deleted_at && !(d as any).deletedAt) {
        depositIds.add(d.id);
        return { ...d, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return d;
    });

    const updatedDeductions = prevDeductions.map((dd) => {
      if (
        (leaseIds.has(dd.lease_id) || depositIds.has(dd.deposit_id)) &&
        !dd.deleted_at &&
        !(dd as any).deletedAt
      ) {
        return { ...dd, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return dd;
    });

    this.setMemoryTable('properties', updatedProps);
    this.setMemoryTable('units', updatedUnits);
    this.setMemoryTable('leases', updatedLeases);
    this.setMemoryTable('invoices', updatedInvoices);
    this.setMemoryTable('payments', updatedPayments);
    this.setMemoryTable('maintenance_requests', updatedMaint);
    this.setMemoryTable('credits', updatedCredits);
    this.setMemoryTable('deposits', updatedDeposits);
    this.setMemoryTable('deposit_deductions', updatedDeductions);
    this.notifyWrite();

    try {
      if (isTauri()) {
        await tauriDbDeletePropertyCascading(propertyId);
      }
      return true;
    } catch (err) {
      this.setMemoryTable('properties', prevProps);
      this.setMemoryTable('units', prevUnits);
      this.setMemoryTable('leases', prevLeases);
      this.setMemoryTable('invoices', prevInvoices);
      this.setMemoryTable('payments', prevPayments);
      this.setMemoryTable('maintenance_requests', prevMaint);
      this.setMemoryTable('credits', prevCredits);
      this.setMemoryTable('deposits', prevDeposits);
      this.setMemoryTable('deposit_deductions', prevDeductions);
      this.notifyWrite();
      throw err;
    }
  }

  public deleteUnitCascading(unitId: string): boolean {
    void this.deleteUnitCascadingAsync(unitId).catch(() => {});
    return true;
  }

  public async deleteUnitCascadingAsync(unitId: string): Promise<boolean> {
    const now = Date.now();
    const prevUnits = [...this.getMemoryTable<Unit>('units')];
    const prevLeases = [...this.getMemoryTable<Lease>('leases')];
    const prevInvoices = [...this.getMemoryTable<Invoice>('invoices')];
    const prevPayments = [...this.getMemoryTable<Payment>('payments')];
    const prevMaint = [...this.getMemoryTable<MaintenanceRequest>('maintenance_requests')];
    const prevCredits = [...this.getMemoryTable<Credit>('credits')];
    const prevDeposits = [...this.getMemoryTable<Deposit>('deposits')];
    const prevDeductions = [...this.getMemoryTable<DepositDeduction>('deposit_deductions')];

    const updatedUnits = prevUnits.map((u) =>
      u.id === unitId ? { ...u, deleted_at: now, updated_at: now, device_id: this.deviceId } : u
    );

    const leaseIds = new Set<string>();
    const updatedLeases = prevLeases.map((l) => {
      if (l.unit_id === unitId && !l.deleted_at && !(l as any).deletedAt) {
        leaseIds.add(l.id);
        return { ...l, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return l;
    });

    const invoiceIds = new Set<string>();
    const updatedInvoices = prevInvoices.map((inv) => {
      if (leaseIds.has(inv.lease_id) && !inv.deleted_at && !(inv as any).deletedAt) {
        invoiceIds.add(inv.id);
        return { ...inv, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return inv;
    });

    const updatedPayments = prevPayments.map((pay) => {
      if (invoiceIds.has(pay.invoice_id) && !pay.deleted_at && !(pay as any).deletedAt) {
        return { ...pay, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return pay;
    });

    const updatedMaint = prevMaint.map((m) => {
      if (m.unit_id === unitId && !m.deleted_at && !(m as any).deletedAt) {
        return { ...m, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return m;
    });

    const updatedCredits = prevCredits.map((c) => {
      const cid = c.lease_id || (c as any).leaseId;
      if (cid && leaseIds.has(cid) && !c.deleted_at && !(c as any).deletedAt) {
        return { ...c, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return c;
    });

    const depositIds = new Set<string>();
    const updatedDeposits = prevDeposits.map((d) => {
      if (leaseIds.has(d.lease_id) && !d.deleted_at && !(d as any).deletedAt) {
        depositIds.add(d.id);
        return { ...d, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return d;
    });

    const updatedDeductions = prevDeductions.map((dd) => {
      if (
        (leaseIds.has(dd.lease_id) || depositIds.has(dd.deposit_id)) &&
        !dd.deleted_at &&
        !(dd as any).deletedAt
      ) {
        return { ...dd, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return dd;
    });

    this.setMemoryTable('units', updatedUnits);
    this.setMemoryTable('leases', updatedLeases);
    this.setMemoryTable('invoices', updatedInvoices);
    this.setMemoryTable('payments', updatedPayments);
    this.setMemoryTable('maintenance_requests', updatedMaint);
    this.setMemoryTable('credits', updatedCredits);
    this.setMemoryTable('deposits', updatedDeposits);
    this.setMemoryTable('deposit_deductions', updatedDeductions);
    this.notifyWrite();

    try {
      if (isTauri()) {
        await tauriDbDeleteUnitCascading(unitId);
      }
      return true;
    } catch (err) {
      this.setMemoryTable('units', prevUnits);
      this.setMemoryTable('leases', prevLeases);
      this.setMemoryTable('invoices', prevInvoices);
      this.setMemoryTable('payments', prevPayments);
      this.setMemoryTable('maintenance_requests', prevMaint);
      this.setMemoryTable('credits', prevCredits);
      this.setMemoryTable('deposits', prevDeposits);
      this.setMemoryTable('deposit_deductions', prevDeductions);
      this.notifyWrite();
      throw err;
    }
  }

  public deleteInvoiceCascading(invoiceId: string): boolean {
    void this.deleteInvoiceCascadingAsync(invoiceId).catch(() => {});
    return true;
  }

  public async deleteInvoiceCascadingAsync(invoiceId: string): Promise<boolean> {
    const now = Date.now();
    const prevInvoices = [...this.getMemoryTable<Invoice>('invoices')];
    const prevPayments = [...this.getMemoryTable<Payment>('payments')];

    const updatedInvoices = prevInvoices.map((inv) =>
      inv.id === invoiceId
        ? { ...inv, deleted_at: now, updated_at: now, device_id: this.deviceId }
        : inv
    );

    const updatedPayments = prevPayments.map((pay) => {
      if (pay.invoice_id === invoiceId && !pay.deleted_at && !(pay as any).deletedAt) {
        return { ...pay, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return pay;
    });

    this.setMemoryTable('invoices', updatedInvoices);
    this.setMemoryTable('payments', updatedPayments);
    this.notifyWrite();

    try {
      if (isTauri()) {
        await tauriDbDeleteInvoiceCascading(invoiceId);
      }
      return true;
    } catch (err) {
      this.setMemoryTable('invoices', prevInvoices);
      this.setMemoryTable('payments', prevPayments);
      this.notifyWrite();
      throw err;
    }
  }

  public deleteTenantCascading(tenantId: string): boolean {
    void this.deleteTenantCascadingAsync(tenantId).catch(() => {});
    return true;
  }

  public async deleteTenantCascadingAsync(tenantId: string): Promise<boolean> {
    const now = Date.now();
    const prevTenants = [...this.getMemoryTable<Tenant>('tenants')];
    const prevLeases = [...this.getMemoryTable<Lease>('leases')];
    const prevUnits = [...this.getMemoryTable<Unit>('units')];
    const prevInvoices = [...this.getMemoryTable<Invoice>('invoices')];
    const prevPayments = [...this.getMemoryTable<Payment>('payments')];
    const prevCredits = [...this.getMemoryTable<Credit>('credits')];
    const prevDeposits = [...this.getMemoryTable<Deposit>('deposits')];
    const prevDeductions = [...this.getMemoryTable<DepositDeduction>('deposit_deductions')];

    const updatedTenants = prevTenants.map((t) =>
      t.id === tenantId
        ? { ...t, deleted_at: now, updated_at: now, device_id: this.deviceId }
        : t
    );

    const leaseIds = new Set<string>();
    const affectedUnitIds = new Set<string>();
    const updatedLeases = prevLeases.map((l) => {
      if (l.tenant_id === tenantId && !l.deleted_at && !(l as any).deletedAt) {
        leaseIds.add(l.id);
        if (l.unit_id) affectedUnitIds.add(l.unit_id);
        return { ...l, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return l;
    });

    const updatedUnits = prevUnits.map((u) => {
      if (!affectedUnitIds.has(u.id) || u.deleted_at || (u as any).deletedAt || u.status === 'maintenance') {
        return u;
      }
      const stillHasActiveLease = updatedLeases.some(
        (l) => l.unit_id === u.id && l.status === 'active' && !l.deleted_at && !(l as any).deletedAt
      );
      const nextStatus: Unit['status'] = stillHasActiveLease ? 'occupied' : 'vacant';
      return u.status === nextStatus
        ? u
        : { ...u, status: nextStatus, updated_at: now, device_id: this.deviceId };
    });

    const invoiceIds = new Set<string>();
    const updatedInvoices = prevInvoices.map((inv) => {
      if (leaseIds.has(inv.lease_id) && !inv.deleted_at && !(inv as any).deletedAt) {
        invoiceIds.add(inv.id);
        return { ...inv, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return inv;
    });

    const updatedPayments = prevPayments.map((pay) => {
      if (invoiceIds.has(pay.invoice_id) && !pay.deleted_at && !(pay as any).deletedAt) {
        return { ...pay, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return pay;
    });

    const updatedCredits = prevCredits.map((c) => {
      const cTenant = c.tenant_id || (c as any).tenantId;
      const cLease = c.lease_id || (c as any).leaseId;
      if (
        (cTenant === tenantId || (cLease && leaseIds.has(cLease))) &&
        !c.deleted_at &&
        !(c as any).deletedAt
      ) {
        return { ...c, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return c;
    });

    const depositIds = new Set<string>();
    const updatedDeposits = prevDeposits.map((d) => {
      if (leaseIds.has(d.lease_id) && !d.deleted_at && !(d as any).deletedAt) {
        depositIds.add(d.id);
        return { ...d, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return d;
    });

    const updatedDeductions = prevDeductions.map((dd) => {
      if (
        (dd.tenant_id === tenantId || leaseIds.has(dd.lease_id) || depositIds.has(dd.deposit_id)) &&
        !dd.deleted_at &&
        !(dd as any).deletedAt
      ) {
        return { ...dd, deleted_at: now, updated_at: now, device_id: this.deviceId };
      }
      return dd;
    });

    this.setMemoryTable('tenants', updatedTenants);
    this.setMemoryTable('leases', updatedLeases);
    this.setMemoryTable('units', updatedUnits);
    this.setMemoryTable('invoices', updatedInvoices);
    this.setMemoryTable('payments', updatedPayments);
    this.setMemoryTable('credits', updatedCredits);
    this.setMemoryTable('deposits', updatedDeposits);
    this.setMemoryTable('deposit_deductions', updatedDeductions);
    this.notifyWrite();

    try {
      if (isTauri()) {
        await tauriDbDeleteTenantCascading(tenantId);
      }
      return true;
    } catch (err) {
      this.setMemoryTable('tenants', prevTenants);
      this.setMemoryTable('leases', prevLeases);
      this.setMemoryTable('units', prevUnits);
      this.setMemoryTable('invoices', prevInvoices);
      this.setMemoryTable('payments', prevPayments);
      this.setMemoryTable('credits', prevCredits);
      this.setMemoryTable('deposits', prevDeposits);
      this.setMemoryTable('deposit_deductions', prevDeductions);
      this.notifyWrite();
      throw err;
    }
  }

  // --- Transactional Payment & FIFO Allocation ---

  private prepareAllocatePayment(
    leaseId: string,
    paymentAmountMinor: number,
    method: string,
    reference?: string
  ) {
    const safePaymentMinor = Math.round(Number(paymentAmountMinor) || 0);
    if (safePaymentMinor <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const lease = this.getItem<Lease>('leases', leaseId);
    if (!lease) throw new Error('Lease not found');

    const now = Date.now();
    const prevInvoices = [...this.getMemoryTable<Invoice>('invoices')];
    const prevPayments = [...this.getMemoryTable<Payment>('payments')];
    const prevCredits = [...this.getMemoryTable<Credit>('credits')];
    const prevAudit = [...this.getMemoryTable<AuditLog>('audit_log')];
    const prevSync = [...this.getMemoryTable<SyncQueueItem>('sync_queue')];

    let openInvoices = prevInvoices
      .filter(
        (inv) =>
          inv.lease_id === leaseId &&
          !inv.deleted_at &&
          !(inv as any).deletedAt &&
          inv.status !== 'paid' &&
          inv.status !== 'voided'
      )
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    const workingInvoices = [...prevInvoices];

    if (openInvoices.length === 0) {
      const nowObj = new Date();
      const year = nowObj.getFullYear();
      const month = nowObj.getMonth();
      const dueDay = Math.min(Math.max(1, lease.due_day || 1), 28);

      const pad = (n: number) => String(n).padStart(2, '0');
      const periodStart = `${year}-${pad(month + 1)}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const periodEnd = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
      const dueDate = `${year}-${pad(month + 1)}-${pad(dueDay)}`;

      const invoiceTotalMinor = lease.rent_minor > 0 ? Math.round(lease.rent_minor) : safePaymentMinor;

      const autoInvoice: Invoice = {
        id: generateUUID(),
        lease_id: leaseId,
        period_start: periodStart,
        period_end: periodEnd,
        due_date: dueDate,
        subtotal_minor: invoiceTotalMinor,
        late_fee_minor: 0,
        total_minor: invoiceTotalMinor,
        amount_paid_minor: 0,
        currency_code: lease.currency_code || 'USD',
        status: 'unpaid',
        updated_at: now,
        device_id: this.deviceId,
        deleted_at: null,
      };
      (autoInvoice as any).amount_paid = 0;
      (autoInvoice as any).amountPaid = 0;

      openInvoices = [autoInvoice];
      workingInvoices.push(autoInvoice);
    }

    let remainingPayment = safePaymentMinor;
    const allocatedMap = new Map<string, Invoice>();

    for (const inv of openInvoices) {
      if (remainingPayment <= 0) break;

      const unpaidOnInv = Math.max(0, Math.round(inv.total_minor - inv.amount_paid_minor));
      if (unpaidOnInv <= 0) continue;

      const paymentForInv = Math.min(remainingPayment, unpaidOnInv);
      const newPaid = Math.round(inv.amount_paid_minor + paymentForInv);
      const newStatus: Invoice['status'] = newPaid >= inv.total_minor ? 'paid' : 'partially_paid';

      allocatedMap.set(inv.id, {
        ...inv,
        amount_paid_minor: newPaid,
        amount_paid: minorToMajorNumber(newPaid, inv.currency_code),
        amountPaid: minorToMajorNumber(newPaid, inv.currency_code),
        status: newStatus,
        updated_at: now,
        device_id: this.deviceId,
      } as any);

      remainingPayment -= paymentForInv;
    }

    const allocatedInvoices = Array.from(allocatedMap.values());
    const nextInvoices = workingInvoices.map((inv) => allocatedMap.get(inv.id) || inv);

    const firstInvoiceId =
      allocatedInvoices.length > 0
        ? allocatedInvoices[0].id
        : openInvoices.length > 0
        ? openInvoices[0].id
        : 'unallocated';

    const paymentId = generateUUID();

    let createdCredit: Credit | null = null;
    const nextCredits = [...prevCredits];
    if (remainingPayment > 0) {
      const creditRecord: Credit = {
        id: generateUUID(),
        tenant_id: lease.tenant_id,
        tenantId: lease.tenant_id,
        lease_id: leaseId,
        leaseId: leaseId,
        amount_minor: remainingPayment,
        amount: minorToMajorNumber(remainingPayment, lease.currency_code),
        currency_code: lease.currency_code,
        reason: 'Overpayment credit',
        source_payment_id: paymentId,
        status: 'active',
        created_at: now,
        createdAt: now,
        updated_at: now,
        device_id: this.deviceId,
        deleted_at: null,
      };
      createdCredit = creditRecord;
      nextCredits.push(creditRecord);
    }

    const payment: Payment = {
      id: paymentId,
      invoice_id: firstInvoiceId,
      amount_minor: safePaymentMinor,
      currency_code: lease.currency_code,
      method,
      reference: reference || `REF-${now.toString().slice(-6)}`,
      paid_at: new Date(now).toISOString(),
      updated_at: now,
      device_id: this.deviceId,
      deleted_at: null,
    };

    const nextPayments = [...prevPayments, payment];
    const auditEntry = this.buildAuditEntry('PAYMENT_ALLOCATE', 'payments', payment.id, null, {
      payment,
      allocatedInvoiceIds: allocatedInvoices.map((i) => i.id),
      createdCreditId: createdCredit?.id || null,
    });
    const syncEntry = this.buildSyncItem('payments', payment.id, 'insert', payment);

    return {
      payment,
      allocatedInvoices,
      createdCredit,
      nextInvoices,
      nextPayments,
      nextCredits,
      nextAudit: [auditEntry, ...prevAudit],
      nextSync: [...prevSync, syncEntry],
      auditEntry,
      syncEntry,
      rollback: () => {
        this.setMemoryTable('invoices', prevInvoices);
        this.setMemoryTable('payments', prevPayments);
        this.setMemoryTable('credits', prevCredits);
        this.setMemoryTable('audit_log', prevAudit);
        this.setMemoryTable('sync_queue', prevSync);
        this.notifyWrite();
      },
    };
  }

  public allocatePayment(
    leaseId: string,
    paymentAmountMinor: number,
    method: string,
    reference?: string
  ): { payment: Payment; allocatedInvoices: Invoice[]; credit?: Credit | null } {
    const plan = this.prepareAllocatePayment(leaseId, paymentAmountMinor, method, reference);

    this.setMemoryTable('invoices', plan.nextInvoices);
    this.setMemoryTable('payments', plan.nextPayments);
    this.setMemoryTable('credits', plan.nextCredits);
    this.setMemoryTable('audit_log', plan.nextAudit);
    this.setMemoryTable('sync_queue', plan.nextSync);
    this.notifyWrite();

    if (isTauri()) {
      for (const inv of plan.allocatedInvoices) {
        tauriDbUpdateItem('invoices', inv.id, inv).catch(() => {});
      }
      tauriDbInsertItem('payments', plan.payment).catch(() => {});
      if (plan.createdCredit) {
        tauriDbInsertItem('credits', plan.createdCredit).catch(() => {});
      }
    }

    return { payment: plan.payment, allocatedInvoices: plan.allocatedInvoices, credit: plan.createdCredit };
  }

  public addPayment(
    leaseId: string,
    paymentAmountMinor: number,
    method: string,
    reference?: string
  ): { payment: Payment; allocatedInvoices: Invoice[] } {
    return this.allocatePayment(leaseId, paymentAmountMinor, method, reference);
  }

  public deletePayment(paymentId: string): boolean {
    const prevPayments = [...this.getMemoryTable<Payment>('payments')];
    const targetPayment = prevPayments.find((p) => p.id === paymentId);
    if (!targetPayment) return false;

    const now = Date.now();
    const updatedPayments = prevPayments.map((p) =>
      p.id === paymentId
        ? { ...p, deleted_at: now, updated_at: now, device_id: this.deviceId }
        : p
    );
    this.setMemoryTable('payments', updatedPayments);

    let updatedInvoice: Invoice | null = null;
    const prevInvoices = [...this.getMemoryTable<Invoice>('invoices')];
    if (targetPayment.invoice_id && targetPayment.invoice_id !== 'unallocated') {
      const invIndex = prevInvoices.findIndex((i) => i.id === targetPayment.invoice_id);
      if (invIndex >= 0) {
        const inv = prevInvoices[invIndex];
        const newPaidMinor = Math.max(0, inv.amount_paid_minor - targetPayment.amount_minor);
        const isPastDue = new Date(inv.due_date).getTime() < now;

        let newStatus: Invoice['status'] = 'unpaid';
        if (newPaidMinor >= inv.total_minor && inv.total_minor > 0) {
          newStatus = 'paid';
        } else if (newPaidMinor > 0) {
          newStatus = 'partially_paid';
        } else {
          newStatus = isPastDue ? 'overdue' : 'unpaid';
        }

        const updatedInv: Invoice = {
          ...inv,
          amount_paid_minor: newPaidMinor,
          amount_paid: minorToMajorNumber(newPaidMinor, inv.currency_code),
          amountPaid: minorToMajorNumber(newPaidMinor, inv.currency_code),
          status: newStatus,
          updated_at: now,
          device_id: this.deviceId,
        } as any;
        updatedInvoice = updatedInv;

        const nextInvoices = [...prevInvoices];
        nextInvoices[invIndex] = updatedInv;
        this.setMemoryTable('invoices', nextInvoices);
      }
    }

    const prevCredits = [...this.getMemoryTable<Credit>('credits')];
    const reversedCredits: Credit[] = [];
    const updatedCredits = prevCredits.map((c) => {
      if (
        (c as any).source_payment_id === paymentId &&
        !c.deleted_at &&
        !(c as any).deletedAt &&
        c.status === 'active'
      ) {
        const deletedCredit = { ...c, deleted_at: now, updated_at: now, device_id: this.deviceId };
        reversedCredits.push(deletedCredit);
        return deletedCredit;
      }
      return c;
    });
    if (reversedCredits.length > 0) {
      this.setMemoryTable('credits', updatedCredits);
    }

    const auditEntry = this.buildAuditEntry('PAYMENT_DELETE', 'payments', paymentId, targetPayment, {
      reversedInvoiceId: targetPayment.invoice_id,
      reversedAmountMinor: targetPayment.amount_minor,
    });
    const syncItem = this.buildSyncItem('payments', paymentId, 'delete', targetPayment);

    const auditLogs = [auditEntry, ...this.getMemoryTable<AuditLog>('audit_log')];
    this.setMemoryTable('audit_log', auditLogs);

    const syncQueue = [...this.getMemoryTable<SyncQueueItem>('sync_queue'), syncItem];
    this.setMemoryTable('sync_queue', syncQueue);

    this.notifyWrite();

    if (isTauri()) {
      tauriDbDeleteItem('payments', paymentId).catch(() => {});
      if (updatedInvoice) {
        tauriDbUpdateItem('invoices', updatedInvoice.id, updatedInvoice).catch(() => {});
      }
      for (const rc of reversedCredits) {
        tauriDbDeleteItem('credits', rc.id).catch(() => {});
      }
    }

    return true;
  }

  public async allocatePaymentAsync(
    leaseId: string,
    paymentAmountMinor: number,
    method: string,
    reference?: string
  ): Promise<{ payment: Payment; allocatedInvoices: Invoice[]; credit?: Credit | null }> {
    const plan = this.prepareAllocatePayment(leaseId, paymentAmountMinor, method, reference);

    this.setMemoryTable('invoices', plan.nextInvoices);
    this.setMemoryTable('payments', plan.nextPayments);
    this.setMemoryTable('credits', plan.nextCredits);
    this.setMemoryTable('audit_log', plan.nextAudit);
    this.setMemoryTable('sync_queue', plan.nextSync);
    this.notifyWrite();

    try {
      if (isTauri()) {
        for (const inv of plan.allocatedInvoices) {
          await tauriDbUpdateItem('invoices', inv.id, inv);
        }
        await tauriDbInsertItem('payments', plan.payment);
        if (plan.createdCredit) {
          await tauriDbInsertItem('credits', plan.createdCredit);
        }
      }

      return { payment: plan.payment, allocatedInvoices: plan.allocatedInvoices, credit: plan.createdCredit };
    } catch (err) {
      plan.rollback();
      throw err;
    }
  }

  private prepareRecordInvoicePayment(
    invoiceId: string,
    paymentAmountMinor: number,
    method: string,
    reference?: string
  ) {
    const safePaymentMinor = Math.round(Number(paymentAmountMinor) || 0);
    if (safePaymentMinor <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const inv = this.getItem<Invoice>('invoices', invoiceId);
    if (!inv) throw new Error('Invoice not found');

    const now = Date.now();
    const prevInvoices = [...this.getMemoryTable<Invoice>('invoices')];
    const prevPayments = [...this.getMemoryTable<Payment>('payments')];
    const prevAudit = [...this.getMemoryTable<AuditLog>('audit_log')];
    const prevSync = [...this.getMemoryTable<SyncQueueItem>('sync_queue')];

    const remainingBalanceMinor = Math.max(0, Math.round(inv.total_minor - inv.amount_paid_minor));
    let newPaid = Math.round(inv.amount_paid_minor + safePaymentMinor);
    let overpaymentMinor = 0;

    if (safePaymentMinor > remainingBalanceMinor) {
      overpaymentMinor = safePaymentMinor - remainingBalanceMinor;
      newPaid = Math.round(inv.total_minor);
    }

    const newStatus: Invoice['status'] = newPaid >= inv.total_minor ? 'paid' : 'partially_paid';

    const updatedInv: Invoice = {
      ...inv,
      amount_paid_minor: newPaid,
      amount_paid: minorToMajorNumber(newPaid, inv.currency_code),
      amountPaid: minorToMajorNumber(newPaid, inv.currency_code),
      status: newStatus,
      updated_at: now,
      device_id: this.deviceId,
    } as any;

    const payment: Payment = {
      id: generateUUID(),
      invoice_id: invoiceId,
      amount_minor: safePaymentMinor,
      currency_code: inv.currency_code,
      method,
      reference: reference || `REF-${now.toString().slice(-6)}`,
      paid_at: new Date(now).toISOString(),
      updated_at: now,
      device_id: this.deviceId,
      deleted_at: null,
    };

    let createdCredit: Credit | null = null;
    const prevCredits = [...this.getMemoryTable<Credit>('credits')];
    const nextCredits = [...prevCredits];

    if (overpaymentMinor > 0) {
      const lease = inv.lease_id
        ? this.getItem<Lease>('leases', inv.lease_id) ||
          this.getMemoryTable<Lease>('leases').find((l) => l.id === inv.lease_id)
        : undefined;
      const tenantId = lease ? lease.tenant_id : undefined;

      createdCredit = {
        id: generateUUID(),
        tenant_id: tenantId || '',
        tenantId: tenantId || '',
        lease_id: inv.lease_id || '',
        leaseId: inv.lease_id || '',
        amount_minor: overpaymentMinor,
        amount: minorToMajorNumber(overpaymentMinor, inv.currency_code),
        currency_code: inv.currency_code || 'USD',
        reason: `Overpayment credit from invoice ${inv.id}`,
        source_payment_id: payment.id,
        status: 'active',
        created_at: now,
        createdAt: now,
        updated_at: now,
        device_id: this.deviceId,
        deleted_at: null,
      } as any;

      nextCredits.push(createdCredit!);
    }

    const nextInvoices = prevInvoices.map((item) => (item.id === invoiceId ? updatedInv : item));
    const nextPayments = [...prevPayments, payment];
    const auditEntry = this.buildAuditEntry('PAYMENT_RECORD', 'payments', payment.id, inv, updatedInv);
    const syncEntry = this.buildSyncItem('payments', payment.id, 'insert', payment);

    return {
      payment,
      updatedInv,
      createdCredit,
      nextInvoices,
      nextPayments,
      nextCredits,
      nextAudit: [auditEntry, ...prevAudit],
      nextSync: [...prevSync, syncEntry],
      auditEntry,
      syncEntry,
      rollback: () => {
        this.setMemoryTable('invoices', prevInvoices);
        this.setMemoryTable('payments', prevPayments);
        this.setMemoryTable('credits', prevCredits);
        this.setMemoryTable('audit_log', prevAudit);
        this.setMemoryTable('sync_queue', prevSync);
        this.notifyWrite();
      },
    };
  }

  public recordInvoicePayment(
    invoiceId: string,
    paymentAmountMinor: number,
    method: string,
    reference?: string
  ): { payment: Payment; invoice: Invoice; credit?: Credit | null } {
    const plan = this.prepareRecordInvoicePayment(invoiceId, paymentAmountMinor, method, reference);

    this.setMemoryTable('invoices', plan.nextInvoices);
    this.setMemoryTable('payments', plan.nextPayments);
    this.setMemoryTable('credits', plan.nextCredits);
    this.setMemoryTable('audit_log', plan.nextAudit);
    this.setMemoryTable('sync_queue', plan.nextSync);
    this.notifyWrite();

    if (isTauri()) {
      tauriDbUpdateItem('invoices', plan.updatedInv.id, plan.updatedInv).catch(() => {});
      tauriDbInsertItem('payments', plan.payment).catch(() => {});
      if (plan.createdCredit) {
        tauriDbInsertItem('credits', plan.createdCredit).catch(() => {});
      }
    }

    return { payment: plan.payment, invoice: plan.updatedInv, credit: plan.createdCredit };
  }

  public async recordInvoicePaymentAsync(
    invoiceId: string,
    paymentAmountMinor: number,
    method: string,
    reference?: string
  ): Promise<{ payment: Payment; invoice: Invoice; credit?: Credit | null }> {
    const plan = this.prepareRecordInvoicePayment(invoiceId, paymentAmountMinor, method, reference);

    this.setMemoryTable('invoices', plan.nextInvoices);
    this.setMemoryTable('payments', plan.nextPayments);
    this.setMemoryTable('credits', plan.nextCredits);
    this.setMemoryTable('audit_log', plan.nextAudit);
    this.setMemoryTable('sync_queue', plan.nextSync);
    this.notifyWrite();

    try {
      if (isTauri()) {
        await tauriDbUpdateItem('invoices', plan.updatedInv.id, plan.updatedInv);
        await tauriDbInsertItem('payments', plan.payment);
        if (plan.createdCredit) {
          await tauriDbInsertItem('credits', plan.createdCredit);
        }
      }

      return { payment: plan.payment, invoice: plan.updatedInv, credit: plan.createdCredit };
    } catch (err) {
      plan.rollback();
      throw err;
    }
  }

  public recordDeduction(
    leaseId: string,
    items: Array<{ id?: string; reason: string; amountMinor: number }>,
    receiptNote?: string | null
  ): { deposit: Deposit; deductions: DepositDeduction[]; remainingBalanceMinor: number } {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const prevDeposits = [...this.getMemoryTable<Deposit>('deposits')];
    const prevDeductions = [...this.getMemoryTable<DepositDeduction>('deposit_deductions')];
    const prevAudit = [...this.getMemoryTable<AuditLog>('audit_log')];
    const prevSync = [...this.getMemoryTable<SyncQueueItem>('sync_queue')];

    const lease =
      this.getItem<Lease>('leases', leaseId) ||
      this.getRawTable<Lease>('leases').find((l) => l.id === leaseId);
    const tenantId = lease?.tenant_id || null;

    let deposit = prevDeposits.find(
      (d) => d.lease_id === leaseId && !d.deleted_at && !(d as any).deletedAt
    );
    let isNewDepositRecord = false;

    if (!deposit) {
      if (!lease || !lease.deposit_minor || lease.deposit_minor <= 0) {
        throw new Error('No security deposit found for this lease.');
      }
      deposit = {
        id: generateUUID(),
        lease_id: leaseId,
        amount_minor: lease.deposit_minor,
        currency_code: lease.currency_code || 'USD',
        received_at: lease.start_date || nowIso.split('T')[0],
        status: 'held',
        interest_accrued_minor: 0,
        returned_minor: 0,
        deductions_json: null,
        updated_at: now,
        device_id: this.deviceId,
        deleted_at: null,
      };
      isNewDepositRecord = true;
    }

    const existingLedgerRows = prevDeductions.filter(
      (d) => d.deposit_id === deposit!.id && !d.deleted_at && !(d as any).deletedAt
    );
    const parsedJsonRows = parseDepositDeductions(deposit.deductions_json);

    const existingDeductedMinor =
      existingLedgerRows.length > 0
        ? existingLedgerRows.reduce((sum, d) => sum + (Number(d.amount_minor) || 0), 0)
        : parsedJsonRows.reduce((sum, d) => sum + (Number(d.amount_minor) || 0), 0);

    const remainingBeforeMinor = Math.max(0, (Number(deposit.amount_minor) || 0) - existingDeductedMinor);
    if (remainingBeforeMinor <= 0) {
      throw new Error('The security deposit balance has already been fully deducted.');
    }

    const validItems = (items || [])
      .map((item) => ({
        id: item.id || generateUUID(),
        reason: String(item.reason || '').trim(),
        amountMinor: Math.round(Number(item.amountMinor) || 0),
      }))
      .filter((item) => item.reason.length > 0 && item.amountMinor > 0);

    if (validItems.length === 0) {
      throw new Error('Please provide at least one deduction item with a reason and positive amount.');
    }

    const newDeductionsTotalMinor = validItems.reduce((sum, item) => sum + item.amountMinor, 0);
    if (newDeductionsTotalMinor > remainingBeforeMinor) {
      const decimals = getCurrencyMinorUnits(deposit.currency_code);
      const requestedFormatted = minorToMajorNumber(newDeductionsTotalMinor, deposit.currency_code).toFixed(decimals);
      const remainingFormatted = minorToMajorNumber(remainingBeforeMinor, deposit.currency_code).toFixed(decimals);
      throw new Error(
        `Deduction amount (${requestedFormatted}) exceeds the remaining deposit balance (${remainingFormatted}).`
      );
    }

    const newDeductionRecords: DepositDeduction[] = validItems.map((item) => ({
      id: item.id || generateUUID(),
      deposit_id: deposit!.id,
      lease_id: leaseId,
      tenant_id: tenantId,
      amount_minor: item.amountMinor,
      currency_code: deposit!.currency_code || 'USD',
      reason: item.reason,
      receipt_note: receiptNote?.trim() || null,
      deducted_at: nowIso,
      created_at: now,
      updated_at: now,
      device_id: this.deviceId,
      deleted_at: null,
    }));

    const totalDeductedAfterMinor = existingDeductedMinor + newDeductionsTotalMinor;
    const remainingAfterMinor = Math.max(0, (Number(deposit.amount_minor) || 0) - totalDeductedAfterMinor);

    const combinedJsonItems: ParsedDeductionItem[] = [
      ...parsedJsonRows,
      ...newDeductionRecords.map((rec) => ({
        id: rec.id,
        reason: rec.reason,
        amount_minor: rec.amount_minor,
        date: rec.deducted_at,
      })),
    ];

    const nextStatus: Deposit['status'] =
      remainingAfterMinor === 0
        ? 'forfeited'
        : totalDeductedAfterMinor > 0
        ? 'partially_returned'
        : 'returned';

    const ledgerPayload = {
      deductions: combinedJsonItems,
      total_deductions_minor: totalDeductedAfterMinor,
      refunded_minor: remainingAfterMinor,
      settled_at: nowIso,
      receipt_note: receiptNote?.trim() || null,
    };

    const updatedDeposit: Deposit = {
      ...deposit,
      deductions_json: JSON.stringify(ledgerPayload),
      returned_minor: remainingAfterMinor,
      status: nextStatus,
      updated_at: now,
      device_id: this.deviceId,
    };

    const nextDeposits = isNewDepositRecord
      ? [updatedDeposit, ...prevDeposits]
      : prevDeposits.map((d) => (d.id === updatedDeposit.id ? updatedDeposit : d));
    const nextDeductions = [...newDeductionRecords, ...prevDeductions];

    const auditEntry = this.buildAuditEntry(
      'RECORD_DEPOSIT_DEDUCTION',
      'deposits',
      updatedDeposit.id,
      isNewDepositRecord ? null : deposit,
      ledgerPayload
    );
    const syncDeposit = this.buildSyncItem(
      'deposits',
      updatedDeposit.id,
      isNewDepositRecord ? 'insert' : 'update',
      updatedDeposit
    );
    const syncDeductions = newDeductionRecords.map((rec) =>
      this.buildSyncItem('deposit_deductions', rec.id, 'insert', rec)
    );

    const nextAudit = [auditEntry, ...prevAudit];
    const nextSync = [...syncDeductions, syncDeposit, ...prevSync];

    this.setMemoryTable('deposits', nextDeposits);
    this.setMemoryTable('deposit_deductions', nextDeductions);
    this.setMemoryTable('audit_log', nextAudit);
    this.setMemoryTable('sync_queue', nextSync);
    this.notifyWrite();

    if (isTauri()) {
      if (isNewDepositRecord) {
        tauriDbInsertItem('deposits', updatedDeposit).catch(() => {});
      } else {
        tauriDbUpdateItem('deposits', updatedDeposit.id, updatedDeposit).catch(() => {});
      }
      for (const rec of newDeductionRecords) {
        tauriDbInsertItem('deposit_deductions', rec).catch(() => {});
      }
    }

    return {
      deposit: updatedDeposit,
      deductions: newDeductionRecords,
      remainingBalanceMinor: remainingAfterMinor,
    };
  }

  public async recordDeductionAsync(
    leaseId: string,
    items: Array<{ id?: string; reason: string; amountMinor: number }>,
    receiptNote?: string | null
  ): Promise<{ deposit: Deposit; deductions: DepositDeduction[]; remainingBalanceMinor: number }> {
    return this.recordDeduction(leaseId, items, receiptNote);
  }

  // --- Bulk Export / Atomic Import ---

  public exportAllData(): Record<string, any[]> {
    const dump: Record<string, any[]> = {};
    for (const tableName of ALL_DB_TABLES) {
      dump[tableName] = [...this.getMemoryTable(tableName)];
    }
    return dump;
  }

  public importAllData(data: Record<string, any>): void {
    void this.importAllDataAsync(data).catch(() => {});
  }

  public async importAllDataAsync(data: Record<string, any>, pushToTauri = false): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid database payload');
    }

    const prevSnapshot = this.exportAllData();

    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && ALL_DB_TABLES.includes(key as any)) {
        const normalized = value.map((row) => normalizeRecord(row));
        this.setMemoryTable(key, normalized);
      }
    }

    this.hydrated = true;
    this.backfillDepositDeductions();
    this.notifyWrite();

    try {
      if (pushToTauri && isTauri()) {
        await tauriDbImportAll(data);
      }
    } catch (err) {
      for (const [tableName, rows] of Object.entries(prevSnapshot)) {
        this.setMemoryTable(tableName, rows);
      }
      this.notifyWrite();
      throw err;
    }
  }

  public async wipeAllDataAsync(): Promise<void> {
    for (const tableName of ALL_DB_TABLES) {
      this.setMemoryTable(tableName, []);
    }
    this.syncUnitOccupancy();
    this.notifyWrite();
  }

  public async wipeAndRestoreAllDataAsync(sourceData: Record<string, any>): Promise<number> {
    if (!sourceData || typeof sourceData !== 'object') {
      throw new Error('Invalid database payload for restoration');
    }

    const tablesMap: Record<string, any[]> = {};

    for (const tableName of ALL_DB_TABLES) {
      if (sourceData.tables && Array.isArray(sourceData.tables[tableName])) {
        tablesMap[tableName] = sourceData.tables[tableName];
      } else if (sourceData.data && Array.isArray(sourceData.data[tableName])) {
        tablesMap[tableName] = sourceData.data[tableName];
      } else if (Array.isArray(sourceData[tableName])) {
        tablesMap[tableName] = sourceData[tableName];
      } else if (tableName === 'maintenance_requests' && Array.isArray(sourceData.maintenance)) {
        tablesMap[tableName] = sourceData.maintenance;
      } else {
        tablesMap[tableName] = [];
      }
    }

    let totalRestoredRecords = 0;

    for (const tableName of ALL_DB_TABLES) {
      const rows = tablesMap[tableName] || [];
      const normalized = rows.map((row) => normalizeRecord(row));
      this.setMemoryTable(tableName, normalized);
      totalRestoredRecords += normalized.length;
    }

    if (isTauri()) {
      await tauriDbImportAll(tablesMap);
    }

    this.backfillDepositDeductions();
    this.syncUnitOccupancy();
    this.notifyWrite();

    return totalRestoredRecords;
  }
}

export const db = new DBClient();
