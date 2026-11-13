import { DBTableName } from '../db/client';
import { Invoice, Lease, Property, Tenant, Unit, UtilityBill } from '../db/schema';
import { generateUUID } from './uuid';

export type UtilityType = 'electricity' | 'water' | 'gas' | 'trash' | 'internet';
export type UtilitySplitMethod = 'by_sqft' | 'equal_headcount';

export interface SplitAllocationInput {
  id: string;
  weight: number;
}

export interface UtilityUnitSplit {
  unit: Unit;
  tenant?: Tenant;
  lease?: Lease;
  isOccupied: boolean;
  shareMinor: number;
  percentage: number;
}

export interface ApplyUtilitySplitParams {
  propertyId: string;
  utilityType: UtilityType;
  billPeriod?: string;
  totalBillMinor: number;
  splitMethod: UtilitySplitMethod;
  currencyCode: string;
  dbClient: {
    getTable: <T extends { deleted_at?: number | null; deletedAt?: number | null }>(tableName: string) => T[];
    insertItem: <T extends { id: string }>(tableName: DBTableName | string, item: any) => T;
    updateItem: <T extends { id: string }>(tableName: DBTableName | string, id: string, patch: Partial<T>) => T | null;
    recordAudit: (action: string, entityType: string, entityId: string, before?: any, after?: any) => void;
  };
}

export interface ApplyUtilitySplitResult {
  appliedCount: number;
  alreadyApplied: boolean;
  skippedVacantUnits: Unit[];
  utilityBillId?: string;
  billPeriod: string;
}

/**
 * Largest-remainder integer allocation algorithm:
 * Guarantees sum(shares) === totalMinor with zero floating-point rounding drift.
 */
export function distributeMinorUnits(
  totalMinor: number,
  allocations: SplitAllocationInput[]
): Record<string, number> {
  const safeTotal = Math.max(0, Math.round(totalMinor));
  const result: Record<string, number> = {};

  if (allocations.length === 0 || safeTotal === 0) {
    for (const a of allocations) result[a.id] = 0;
    return result;
  }

  const normalizedWeights = allocations.map((a) => ({
    id: a.id,
    weight: Number.isFinite(a.weight) && a.weight > 0 ? a.weight : 0,
  }));

  const weightSum = normalizedWeights.reduce((sum, a) => sum + a.weight, 0);
  const effectiveWeights =
    weightSum > 0
      ? normalizedWeights
      : normalizedWeights.map((a) => ({ id: a.id, weight: 1 }));
  const effectiveSum = effectiveWeights.reduce((sum, a) => sum + a.weight, 0);

  let allocatedSum = 0;
  const remainders: Array<{ id: string; remainder: number }> = [];

  for (const item of effectiveWeights) {
    const exactShare = (safeTotal * item.weight) / effectiveSum;
    const floored = Math.floor(exactShare);
    result[item.id] = floored;
    allocatedSum += floored;
    remainders.push({ id: item.id, remainder: exactShare - floored });
  }

  let remainingMinor = safeTotal - allocatedSum;
  remainders.sort((a, b) => b.remainder - a.remainder);

  let idx = 0;
  while (remainingMinor > 0 && remainders.length > 0) {
    const target = remainders[idx % remainders.length];
    result[target.id] += 1;
    remainingMinor -= 1;
    idx += 1;
  }

  return result;
}

/**
 * Computes exact per-unit utility shares using largest-remainder integer distribution.
 */
export function calculateUtilitySplits(params: {
  units: Unit[];
  leases: Lease[];
  tenants: Tenant[];
  totalBillMinor: number;
  splitMethod: UtilitySplitMethod;
}): UtilityUnitSplit[] {
  const { units, leases, tenants, totalBillMinor, splitMethod } = params;
  const safeTotal = Math.max(0, Math.round(totalBillMinor));

  const occupiedEntries = units
    .map((u) => {
      const lease = leases.find((l) => l.unit_id === u.id && l.status === 'active');
      const isOccupied = u.status === 'occupied' || !!lease;
      return { unit: u, lease, isOccupied };
    })
    .filter((entry) => entry.isOccupied);

  const shareMap = distributeMinorUnits(
    safeTotal,
    occupiedEntries.map((entry) => ({
      id: entry.unit.id,
      weight: splitMethod === 'by_sqft' ? Math.max(0, entry.unit.size || 0) : 1,
    }))
  );

  return units.map((u) => {
    const lease = leases.find((l) => l.unit_id === u.id && l.status === 'active');
    const tenant = tenants.find((t) => t.id === lease?.tenant_id);
    const isOccupied = u.status === 'occupied' || !!lease;
    const shareMinor = isOccupied ? shareMap[u.id] ?? 0 : 0;

    return {
      unit: u,
      tenant,
      lease,
      isOccupied,
      shareMinor,
      percentage: safeTotal > 0 && isOccupied ? Math.round((shareMinor / safeTotal) * 100) : 0,
    };
  });
}

function parseLineItems(raw: string | null | undefined): any[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Idempotently applies a utility split for (propertyId, utilityType, billPeriod) to
 * open tenant invoices (or creates new monthly utility invoices), and records a single
 * utility_bills ledger row. Calling twice for the same key is a safe no-op.
 */
export function applyUtilitySplit(params: ApplyUtilitySplitParams): ApplyUtilitySplitResult {
  const {
    propertyId,
    utilityType,
    totalBillMinor,
    splitMethod,
    currencyCode,
    dbClient,
  } = params;
  const billPeriod = params.billPeriod || new Date().toISOString().slice(0, 7);
  const idempotencyKey = `utility:${propertyId}:${utilityType}:${billPeriod}`;
  const safeTotal = Math.max(0, Math.round(totalBillMinor));

  if (safeTotal <= 0) {
    throw new Error('Utility bill amount must be greater than zero.');
  }

  const activeProps = dbClient.getTable<Property>('properties');
  if (!activeProps.some((p) => p.id === propertyId)) {
    throw new Error('Selected property does not exist or has been archived.');
  }

  // Idempotency Check 1: utility_bills table already has an entry for this (property, type, period)
  const existingBills = dbClient.getTable<UtilityBill>('utility_bills');
  const duplicateBill = existingBills.find(
    (b) =>
      b.property_id === propertyId &&
      b.utility_type === utilityType &&
      b.bill_period === billPeriod
  );
  if (duplicateBill) {
    return {
      appliedCount: 0,
      alreadyApplied: true,
      skippedVacantUnits: [],
      utilityBillId: duplicateBill.id,
      billPeriod,
    };
  }

  const propUnits = dbClient.getTable<Unit>('units').filter((u) => u.property_id === propertyId);
  const leases = dbClient.getTable<Lease>('leases');
  const tenants = dbClient.getTable<Tenant>('tenants');
  const openInvoices = dbClient.getTable<Invoice>('invoices');

  const unitSplits = calculateUtilitySplits({
    units: propUnits,
    leases,
    tenants,
    totalBillMinor: safeTotal,
    splitMethod,
  });

  // Idempotency Check 2: ensure no active invoice already contains this idempotencyKey
  const alreadyTaggedInInvoice = openInvoices.some((inv) => {
    const items = parseLineItems(inv.line_items_json);
    return items.some((li) => li && li.idempotencyKey === idempotencyKey);
  });
  if (alreadyTaggedInInvoice) {
    return {
      appliedCount: 0,
      alreadyApplied: true,
      skippedVacantUnits: [],
      billPeriod,
    };
  }

  let appliedCount = 0;
  const skippedVacantUnits: Unit[] = [];

  for (const item of unitSplits) {
    if (!item.isOccupied || !item.lease) {
      skippedVacantUnits.push(item.unit);
      continue;
    }

    if (item.shareMinor <= 0) continue;

    const lineItemEntry = {
      id: generateUUID(),
      idempotencyKey,
      description: `${utilityType.toUpperCase()} Utility Split (${billPeriod})`,
      amount_minor: item.shareMinor,
      category: 'utility' as const,
    };

    const existingOpenInv = openInvoices.find(
      (inv) =>
        inv.lease_id === item.lease!.id &&
        inv.status !== 'paid' &&
        inv.status !== 'voided'
    );

    if (existingOpenInv) {
      const currentItems = parseLineItems(existingOpenInv.line_items_json);
      const nextItems = [...currentItems, lineItemEntry];
      const newSubtotal = existingOpenInv.subtotal_minor + item.shareMinor;
      const newTotal = existingOpenInv.total_minor + item.shareMinor;

      dbClient.updateItem<Invoice>('invoices', existingOpenInv.id, {
        subtotal_minor: newSubtotal,
        total_minor: newTotal,
        line_items_json: JSON.stringify(nextItems),
      });

      dbClient.recordAudit(
        'UTILITY_CHARGE_ADDED',
        'invoices',
        existingOpenInv.id,
        { old_total: existingOpenInv.total_minor },
        {
          added_utility: item.shareMinor,
          utility_type: utilityType,
          bill_period: billPeriod,
          idempotencyKey,
        }
      );
      appliedCount++;
    } else {
      const invId = generateUUID();
      const nowIso = new Date().toISOString().slice(0, 10);
      const dueIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      dbClient.insertItem<Invoice>('invoices', {
        id: invId,
        lease_id: item.lease.id,
        period_start: nowIso,
        period_end: dueIso,
        due_date: dueIso,
        subtotal_minor: item.shareMinor,
        late_fee_minor: 0,
        total_minor: item.shareMinor,
        amount_paid_minor: 0,
        currency_code: currencyCode,
        status: 'unpaid',
        line_items_json: JSON.stringify([lineItemEntry]),
      });
      appliedCount++;
    }
  }

  let utilityBillId: string | undefined;
  if (appliedCount > 0) {
    utilityBillId = generateUUID();
    dbClient.insertItem<UtilityBill>('utility_bills', {
      id: utilityBillId,
      property_id: propertyId,
      utility_type: utilityType,
      bill_period: billPeriod,
      total_amount_minor: safeTotal,
      split_method: splitMethod,
      splits_json: JSON.stringify(
        unitSplits
          .filter((s) => s.isOccupied)
          .map((s) => ({
            unit_id: s.unit.id,
            tenant_name: s.tenant?.name || 'Resident',
            amount_minor: s.shareMinor,
          }))
      ),
      created_at: Date.now(),
    });
  }

  return {
    appliedCount,
    alreadyApplied: false,
    skippedVacantUnits,
    utilityBillId,
    billPeriod,
  };
}
