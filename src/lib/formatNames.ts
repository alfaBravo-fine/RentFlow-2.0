/**
 * Formats human-readable identifiers for display instead of raw DB IDs.
 * Rule: Stop showing raw database IDs like "lease_101" to users.
 */

export function formatLeaseName(tenantName?: string, unitName?: string, fallbackId?: string): string {
  if (tenantName && unitName) {
    // Extract last name or clean name
    const parts = tenantName.trim().split(/\s+/);
    const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    return `${lastName} — ${unitName}`;
  }
  if (tenantName) return tenantName;
  if (unitName) return unitName;
  return fallbackId ? `Lease #${fallbackId.replace(/^lease_/, '').slice(0, 6)}` : 'Lease Agreement';
}

export function formatInvoiceNumber(invId: string, periodStart?: string): string {
  if (!invId) return 'INV-2026-001';
  // If already formatted like INV-2026-001
  if (/^INV-\d{4}-\d+/i.test(invId)) {
    return invId.toUpperCase();
  }
  const year = periodStart ? new Date(periodStart).getFullYear() : 2026;
  const numPart = invId.replace(/\D/g, '').slice(-3).padStart(3, '0') || '001';
  return `INV-${year}-${numPart}`;
}

export function formatPropertyName(name: string): string {
  return name.replace(/_/g, ' ').trim();
}

export function getUnitDisplayName(
  unit?: {
    name?: string | null;
    number?: string | null;
    unit_number?: string | null;
    unitNumber?: string | null;
  } | null
): string {
  if (!unit) return 'Unnamed Unit';
  const raw = unit.name || unit.number || unit.unit_number || unit.unitNumber || '';
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : 'Unnamed Unit';
}

