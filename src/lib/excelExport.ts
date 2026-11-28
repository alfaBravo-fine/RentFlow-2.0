import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { appDataDir, dirname, documentDir, downloadDir, join } from '@tauri-apps/api/path';
import { db } from '../db/client';
import { useAppSettingsStore } from '../stores/appSettingsStore';
import { tauriGetAppDataPath, tauriGetDataPath, tauriWriteBinaryFile } from './tauri/bridge';
import {
  Property,
  Unit,
  Tenant,
  Lease,
  Invoice,
  Payment,
  Expense,
  MaintenanceRequest,
  Vendor,
} from '../db/schema';
import { CountryPack } from '../countries/types';
import { getCountryPack } from '../countries/resolver';
import { usePackStore } from '../countries/usePack';

export const MASTER_EXCEL_FILENAME = 'RentFlow_Master_Data.xlsx';

export interface ColumnDef {
  header: string;
  key: string;
  width?: number;
  isCurrency?: boolean;
}

export interface ExportResult {
  fileName: string;
  savedPath?: string;
  totalRecords: number;
  sheetCount: number;
  workbook?: ExcelJS.Workbook;
}

const XML_ILLEGAL_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function sanitizeExcelCellValue(val: unknown): string | number | boolean {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'boolean') return val;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).replace(XML_ILLEGAL_CONTROL_CHARS, '');
}

/**
 * Copies any ArrayBuffer, Uint8Array, or Browserify Buffer returned by ExcelJS
 * into a standalone standard Uint8Array (byteOffset === 0, no Buffer.toJSON()).
 */
export function toCleanUint8Array(buffer: ArrayBuffer | ArrayBufferView): Uint8Array {
  const view = ArrayBuffer.isView(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new Uint8Array(buffer);
  const clean = new Uint8Array(view.byteLength);
  clean.set(view);
  return clean;
}

export function hasValidXlsxZipHeader(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

const LEGACY_PLACEHOLDER_EXPORT_DIR = 'c:\\users\\documents\\rentflowexports';

function isValidConfiguredPath(rawPath: string | undefined | null): rawPath is string {
  if (typeof rawPath !== 'string') return false;
  const trimmed = rawPath.trim();
  if (!trimmed) return false;
  return trimmed.toLowerCase() !== LEGACY_PLACEHOLDER_EXPORT_DIR;
}

export function extractErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message?: unknown }).message ?? '').trim();
    if (msg) return msg;
  }
  return fallback;
}

export async function getAppDataFallbackDir(): Promise<string> {
  const isTauriDesktop =
    typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
  if (!isTauriDesktop) return '';

  const fromApi = await appDataDir().catch(() => '');
  if (isValidConfiguredPath(fromApi)) return fromApi.trim();

  const fromBridge = await tauriGetAppDataPath().catch(() => '');
  if (isValidConfiguredPath(fromBridge)) return fromBridge.trim();

  const fromDataPath = await tauriGetDataPath().catch(() => '');
  if (isValidConfiguredPath(fromDataPath)) return fromDataPath.trim();

  return '';
}

export async function resolveDefaultExportDir(): Promise<string> {
  const isTauriDesktop =
    typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
  if (!isTauriDesktop) return '';

  const fromDownloads = await downloadDir().catch(() => '');
  if (isValidConfiguredPath(fromDownloads)) return fromDownloads.trim();

  const fromDocuments = await documentDir().catch(() => '');
  if (isValidConfiguredPath(fromDocuments)) return fromDocuments.trim();

  return getAppDataFallbackDir();
}

export async function resolveSaveFilePath(
  targetPathOrDir: string | undefined,
  fileName: string
): Promise<{ fullPath: string; targetDir: string; usedFallbackDir: boolean }> {
  const raw = isValidConfiguredPath(targetPathOrDir) ? targetPathOrDir.trim() : '';

  if (raw && /\.xlsx$/i.test(raw)) {
    const parent = await dirname(raw).catch(() => '');
    return { fullPath: raw, targetDir: parent, usedFallbackDir: false };
  }

  let targetDir = raw;
  let usedFallbackDir = false;
  if (!targetDir) {
    const configuredDest = useAppSettingsStore.getState().exportDestination;
    targetDir = isValidConfiguredPath(configuredDest) ? configuredDest.trim() : '';
  }
  if (!targetDir) {
    usedFallbackDir = true;
    targetDir = await resolveDefaultExportDir();
  }
  if (!targetDir) {
    return { fullPath: '', targetDir: '', usedFallbackDir };
  }

  const fullPath = await join(targetDir, fileName);
  return { fullPath, targetDir, usedFallbackDir };
}

async function writeVerifiedXlsxToPath(
  fullPath: string,
  targetDir: string,
  bytes: Uint8Array
): Promise<void> {
  let pluginFsError: unknown = null;
  let writtenValidly = false;

  try {
    if (targetDir) {
      await mkdir(targetDir, { recursive: true });
    }
    await writeFile(fullPath, bytes);
    const verifyBytes = await readFile(fullPath);
    if (
      verifyBytes instanceof Uint8Array &&
      verifyBytes.byteLength === bytes.byteLength &&
      verifyBytes.byteLength > 0 &&
      hasValidXlsxZipHeader(verifyBytes)
    ) {
      writtenValidly = true;
    } else {
      pluginFsError = new Error(
        `File verification failed (${verifyBytes instanceof Uint8Array ? verifyBytes.byteLength : 0} bytes written instead of ${bytes.byteLength} bytes).`
      );
    }
  } catch (err) {
    pluginFsError = err;
    writtenValidly = false;
  }

  if (!writtenValidly) {
    try {
      const writtenLen = await tauriWriteBinaryFile(fullPath, bytes);
      if (!Number.isFinite(writtenLen) || writtenLen <= 0) {
        throw new Error('Native file write returned 0 bytes.');
      }
    } catch (nativeErr) {
      const detail = extractErrorMessage(nativeErr, extractErrorMessage(pluginFsError));
      throw new Error(`Failed to write "${fullPath}": ${detail}`);
    }
  }
}

export async function persistWorkbookBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string,
  customExportDirOrPath?: string,
  options?: { silentDownload?: boolean }
): Promise<string | undefined> {
  const bytes = toCleanUint8Array(buffer);
  if (bytes.byteLength === 0 || !hasValidXlsxZipHeader(bytes)) {
    throw new Error('Generated Excel buffer is empty or not a valid OOXML (.xlsx) archive.');
  }

  const isTauriDesktop =
    typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);

  if (isTauriDesktop) {
    const { fullPath, targetDir, usedFallbackDir } = await resolveSaveFilePath(
      customExportDirOrPath,
      fileName
    );
    if (!fullPath) {
      throw new Error('Could not resolve a writable folder for Excel export. Please select a destination folder.');
    }

    try {
      await writeVerifiedXlsxToPath(fullPath, targetDir, bytes);
      return fullPath;
    } catch (primaryErr) {
      if (usedFallbackDir) {
        const appDataFallback = await getAppDataFallbackDir();
        if (appDataFallback && appDataFallback !== targetDir) {
          const fallbackPath = await join(appDataFallback, fileName);
          await writeVerifiedXlsxToPath(fallbackPath, appDataFallback, bytes);
          return fallbackPath;
        }
      }
      console.error('EXPORT ERROR:', primaryErr);
      throw primaryErr;
    }
  }

  if (!options?.silentDownload && typeof window !== 'undefined') {
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, fileName);
  }
  return undefined;
}

/**
 * Shared data builder for all 9 RentFlow modules.
 * Returns column definitions and formatted data rows for each table.
 */
export function getExportData(pack?: CountryPack) {
  const minorMultiplier = Math.pow(10, pack?.currency?.minorUnits ?? 2);

  const properties = db.getTable<Property>('properties').filter((p: Property) => !p.deleted_at && !(p as any).deletedAt);
  const units = db.getTable<Unit>('units').filter((u: Unit) => !u.deleted_at && !(u as any).deletedAt);
  const tenants = db.getTable<Tenant>('tenants').filter((t: Tenant) => !t.deleted_at && !(t as any).deletedAt);
  const leases = db.getTable<Lease>('leases').filter((l: Lease) => !l.deleted_at && !(l as any).deletedAt);
  const invoices = db.getTable<Invoice>('invoices').filter((i: Invoice) => !i.deleted_at && !(i as any).deletedAt);
  const payments = db.getTable<Payment>('payments').filter((p: Payment) => !p.deleted_at && !(p as any).deletedAt);
  const expenses = db.getTable<Expense>('expenses').filter((e: Expense) => !e.deleted_at && !(e as any).deletedAt);
  const maintenance = db
    .getTable<MaintenanceRequest>('maintenance_requests')
    .filter((m: MaintenanceRequest) => !m.deleted_at && !(m as any).deletedAt);
  const vendors = db.getTable<Vendor>('vendors').filter((v: Vendor) => !v.deleted_at && !(v as any).deletedAt);

  const propertyMap = new Map<string, Property>(properties.map((p: Property) => [p.id, p]));
  const unitMap = new Map<string, Unit>(units.map((u: Unit) => [u.id, u]));
  const tenantMap = new Map<string, Tenant>(tenants.map((t: Tenant) => [t.id, t]));
  const leaseMap = new Map<string, Lease>(leases.map((l: Lease) => [l.id, l]));
  const vendorMap = new Map<string, Vendor>(vendors.map((v: Vendor) => [v.id, v]));

  const getUnitDisplayName = (unitId: string | null | undefined): string => {
    if (!unitId) return 'General';
    const unit = unitMap.get(unitId);
    if (!unit) return unitId;
    const prop = propertyMap.get(unit.property_id);
    return prop ? `${prop.name} - ${unit.name}` : unit.name;
  };

  const propRows = properties.map((p: Property) => ({
    name: p.name,
    type: (p.type || 'residential_apartment').replace(/_/g, ' ').toUpperCase(),
    address: p.address_line1 || p.address || '',
    city: p.city || '',
    country: p.country_code || (pack ? pack.code : 'PK'),
    units: units.filter((u: Unit) => u.property_id === p.id).length,
  }));

  const unitRows = units.map((u: Unit) => {
    const prop = propertyMap.get(u.property_id);
    return {
      name: u.name,
      propertyName: prop ? prop.name : u.property_id,
      size: `${u.size || 0} ${u.area_unit || (pack ? pack.areaUnit : 'sqft')}`,
      rent: (u.rent_minor || 0) / minorMultiplier,
      status: (u.status || 'vacant').toUpperCase(),
    };
  });

  const tenantRows = tenants.map((t: Tenant) => ({
    name: t.name,
    phone: t.phone || '',
    email: t.email || '',
    idType: t.id_type || '',
    idNumber: t.id_number || '',
    emergencyContact: t.emergency_contact || 'None',
  }));

  const leaseRows = leases.map((l: Lease) => {
    const tenant = tenantMap.get(l.tenant_id);
    return {
      tenantName: tenant ? tenant.name : l.tenant_id,
      unitName: getUnitDisplayName(l.unit_id),
      startDate: l.start_date || '',
      endDate: l.end_date || '',
      rent: (l.rent_minor || 0) / minorMultiplier,
      deposit: (l.deposit_minor || 0) / minorMultiplier,
      status: (l.status || 'draft').toUpperCase(),
    };
  });

  const invoiceRows = invoices.map((inv: Invoice) => {
    const lease = leaseMap.get(inv.lease_id);
    const tenant = lease ? tenantMap.get(lease.tenant_id) : undefined;
    return {
      invoiceNumber: inv.id,
      tenantName: tenant ? tenant.name : (lease ? lease.tenant_id : 'Unknown Tenant'),
      dueDate: inv.due_date || '',
      subtotal: (inv.subtotal_minor || 0) / minorMultiplier,
      lateFee: (inv.late_fee_minor || 0) / minorMultiplier,
      total: (inv.total_minor || 0) / minorMultiplier,
      paid: (inv.amount_paid_minor || 0) / minorMultiplier,
      status: (inv.status || 'unpaid').toUpperCase(),
    };
  });

  const paymentRows = payments.map((p: Payment) => {
    const inv = invoices.find((i: Invoice) => i.id === p.invoice_id);
    const lease = inv ? leaseMap.get(inv.lease_id) : undefined;
    const tenant = lease ? tenantMap.get(lease.tenant_id) : undefined;
    const dateFormatted = p.paid_at
      ? (p.paid_at.includes('T') ? p.paid_at.slice(0, 10) : new Date(p.paid_at).toISOString().slice(0, 10))
      : '';

    return {
      date: dateFormatted,
      tenantName: tenant ? tenant.name : 'Unknown Tenant',
      amount: (p.amount_minor || 0) / minorMultiplier,
      method: (p.method || 'cash').toUpperCase(),
      reference: p.reference || 'N/A',
    };
  });

  const expenseRows = expenses.map((exp: Expense) => {
    const prop = exp.property_id ? propertyMap.get(exp.property_id) : undefined;
    return {
      date: exp.expense_date || '',
      category: (exp.category || 'General').toUpperCase(),
      amount: (exp.amount_minor || 0) / minorMultiplier,
      propertyUnit: prop ? prop.name : (exp.property_id || 'General Portfolio'),
      notes: exp.notes || '',
    };
  });

  const maintenanceRows = maintenance.map((m: MaintenanceRequest) => {
    const vendor = m.vendor_id ? vendorMap.get(m.vendor_id) : undefined;
    const dateFormatted = m.completed_at
      ? m.completed_at
      : m.updated_at
      ? new Date(m.updated_at).toISOString().slice(0, 10)
      : '';

    return {
      date: dateFormatted,
      issue: m.description || (m.category ? m.category.toUpperCase() : 'Maintenance Request'),
      unit: getUnitDisplayName(m.unit_id),
      status: (m.status || 'new').replace(/_/g, ' ').toUpperCase(),
      vendor: vendor ? vendor.name : 'Unassigned',
      cost: (m.cost_minor || 0) / minorMultiplier,
    };
  });

  const vendorRows = vendors.map((v: Vendor) => ({
    name: v.name,
    category: (v.category || 'Maintenance').toUpperCase(),
    phone: v.phone || '',
    email: v.email || '',
  }));

  const dataMap: Record<string, { columns: ColumnDef[]; rows: Record<string, any>[] }> = {
    Properties: {
      columns: [
        { header: 'Property Name', key: 'name', width: 20 },
        { header: 'Type', key: 'type' },
        { header: 'Address', key: 'address' },
        { header: 'City', key: 'city' },
        { header: 'Country', key: 'country' },
        { header: 'Total Units', key: 'units' },
      ],
      rows: propRows,
    },
    Units: {
      columns: [
        { header: 'Unit Name', key: 'name' },
        { header: 'Property Name', key: 'propertyName' },
        { header: 'Size', key: 'size' },
        { header: 'Rent', key: 'rent', isCurrency: true },
        { header: 'Status', key: 'status' },
      ],
      rows: unitRows,
    },
    Tenants: {
      columns: [
        { header: 'Name', key: 'name' },
        { header: 'Phone', key: 'phone' },
        { header: 'Email', key: 'email' },
        { header: 'ID Type', key: 'idType' },
        { header: 'ID Number', key: 'idNumber' },
        { header: 'Emergency Contact', key: 'emergencyContact' },
      ],
      rows: tenantRows,
    },
    Leases: {
      columns: [
        { header: 'Tenant', key: 'tenantName' },
        { header: 'Unit', key: 'unitName' },
        { header: 'Start Date', key: 'startDate' },
        { header: 'End Date', key: 'endDate' },
        { header: 'Rent', key: 'rent', isCurrency: true },
        { header: 'Deposit', key: 'deposit', isCurrency: true },
        { header: 'Status', key: 'status' },
      ],
      rows: leaseRows,
    },
    Invoices: {
      columns: [
        { header: 'Invoice #', key: 'invoiceNumber' },
        { header: 'Tenant Name', key: 'tenantName' },
        { header: 'Due Date', key: 'dueDate' },
        { header: 'Subtotal', key: 'subtotal', isCurrency: true },
        { header: 'Late Fee', key: 'lateFee', isCurrency: true },
        { header: 'Total', key: 'total', isCurrency: true },
        { header: 'Paid', key: 'paid', isCurrency: true },
        { header: 'Status', key: 'status' },
      ],
      rows: invoiceRows,
    },
    Payments: {
      columns: [
        { header: 'Date', key: 'date' },
        { header: 'Tenant Name', key: 'tenantName' },
        { header: 'Amount', key: 'amount', isCurrency: true },
        { header: 'Method', key: 'method' },
        { header: 'Reference', key: 'reference' },
      ],
      rows: paymentRows,
    },
    Expenses: {
      columns: [
        { header: 'Date', key: 'date' },
        { header: 'Category', key: 'category' },
        { header: 'Amount', key: 'amount', isCurrency: true },
        { header: 'Property/Unit', key: 'propertyUnit' },
        { header: 'Notes', key: 'notes' },
      ],
      rows: expenseRows,
    },
    Maintenance: {
      columns: [
        { header: 'Date', key: 'date' },
        { header: 'Issue', key: 'issue' },
        { header: 'Unit', key: 'unit' },
        { header: 'Status', key: 'status' },
        { header: 'Assigned Vendor', key: 'vendor' },
        { header: 'Cost', key: 'cost', isCurrency: true },
      ],
      rows: maintenanceRows,
    },
    Vendors: {
      columns: [
        { header: 'Name', key: 'name' },
        { header: 'Category', key: 'category' },
        { header: 'Phone', key: 'phone' },
        { header: 'Email', key: 'email' },
      ],
      rows: vendorRows,
    },
  };

  return dataMap;
}

/**
 * Professional multi-sheet Excel export powered by ExcelJS and file-saver.
 * Queries all 9 database tables (Properties, Units, Tenants, Leases, Invoices, Payments, Expenses, Maintenance, Vendors)
 * and applies merged title headers (#1F4E78), light gray column headers (#D9E1F2), thin cell borders, and column auto-width.
 */
export async function exportToExcel(
  pack?: CountryPack,
  customExportDir?: string
): Promise<ExportResult> {
  const currencySymbol = pack?.currency?.symbol || 'Rs.';
  const currencyNumFmt = `"${currencySymbol} "#,##0.00`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RentFlow Property Management';
  workbook.created = new Date();

  const exportData = getExportData(pack);
  let totalRecordsCount = 0;

  Object.entries(exportData).forEach(([sheetName, { columns, rows }]) => {
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    const numCols = columns.length;

    // 1. Add Title Row in Row 1
    const titleRow = sheet.addRow([sheetName]);
    const endColLetter = String.fromCharCode(64 + numCols);
    sheet.mergeCells(`A1:${endColLetter}1`);

    titleRow.height = 30;
    titleRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      };
    });

    // 2. Add Headers in Row 2
    const headerRow = sheet.addRow(columns.map((c) => c.header));
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      };
    });

    // 3. Add Data Rows (Row 3+)
    rows.forEach((item: Record<string, any>) => {
      totalRecordsCount++;
      const rowData = columns.map((col) => sanitizeExcelCellValue(item[col.key]));
      const row = sheet.addRow(rowData);
      row.height = 20;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const colDef = columns[colNumber - 1];
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colDef?.isCurrency || typeof cell.value === 'number' ? 'right' : 'left',
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        };

        if (colDef?.isCurrency && typeof cell.value === 'number') {
          cell.numFmt = currencyNumFmt;
        }
      });
    });

    // 4. Auto-fit columns based on longest string
    sheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell?.({ includeEmpty: true }, (cell, rowNumber) => {
        if (rowNumber === 1) return; // Ignore title row
        const length = cell.value ? cell.value.toString().length : 0;
        if (length > maxLength) maxLength = length;
      });
      column.width = maxLength + 2;
    });
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `RentFlow_Export_${dateStr}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const savedPath = await persistWorkbookBuffer(buffer, fileName, customExportDir);

  return {
    fileName,
    savedPath,
    totalRecords: totalRecordsCount,
    sheetCount: 9,
    workbook,
  };
}

/**
 * Smart Update of an Existing Master Excel Workbook (.xlsx).
 * Reads the uploaded Excel file, checks existing sheets and records in column 1,
 * and appends only new database records without creating duplicates.
 * Applies thin borders, currency formatting, and re-calculates column widths.
 */
export async function updateExistingExcel(
  fileOrBuffer: File | ArrayBuffer | Blob,
  pack?: CountryPack,
  customExportDir?: string
): Promise<ExportResult> {
  const currencySymbol = pack?.currency?.symbol || 'Rs.';
  const currencyNumFmt = `"${currencySymbol} "#,##0.00`;

  // Read input into ArrayBuffer
  let arrayBuffer: ArrayBuffer;
  let inputFileName = 'RentFlow_Master.xlsx';

  if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else if ('arrayBuffer' in fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
    if ('name' in fileOrBuffer && typeof (fileOrBuffer as any).name === 'string') {
      inputFileName = (fileOrBuffer as any).name;
    }
  } else {
    arrayBuffer = await new Response(fileOrBuffer as Blob).arrayBuffer();
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const exportData = getExportData(pack);
  let totalAppendedRecords = 0;

  // Helper: Style a data row in Excel
  const styleDataRow = (row: ExcelJS.Row, columns: ColumnDef[]) => {
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colDef = columns[colNumber - 1];
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colDef?.isCurrency || typeof cell.value === 'number' ? 'right' : 'left',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      };

      if (colDef?.isCurrency && typeof cell.value === 'number') {
        cell.numFmt = currencyNumFmt;
      }
    });
  };

  // Helper: Create missing sheet with title banner and headers
  const createSheetWithHeader = (sheetName: string, columns: ColumnDef[]): ExcelJS.Worksheet => {
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    const numCols = columns.length;

    // 1. Add Title Row in Row 1
    const titleRow = sheet.addRow([sheetName]);
    const endColLetter = String.fromCharCode(64 + numCols);
    sheet.mergeCells(`A1:${endColLetter}1`);

    titleRow.height = 30;
    titleRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      };
    });

    // 2. Add Headers in Row 2
    const headerRow = sheet.addRow(columns.map((c) => c.header));
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      };
    });

    return sheet;
  };

  // Iterate over all 9 table categories
  Object.entries(exportData).forEach(([sheetName, { columns, rows }]) => {
    let sheet = workbook.getWorksheet(sheetName);

    if (!sheet) {
      // Sheet missing: create new sheet with title banner and headers, add all rows
      sheet = createSheetWithHeader(sheetName, columns);
      rows.forEach((item: Record<string, any>) => {
        const rowData = columns.map((col) => sanitizeExcelCellValue(item[col.key]));
        const row = sheet!.addRow(rowData);
        styleDataRow(row, columns);
        totalAppendedRecords++;
      });
    } else {
      // Sheet exists: read all existing values from column 1 & composite signature for deduplication
      const existingKeys = new Set<string>();

      sheet.eachRow({ includeEmpty: false }, (row) => {
        const cell1 = row.getCell(1).value;
        if (cell1 === null || cell1 === undefined) return;

        let strVal1 =
          typeof cell1 === 'object' && 'result' in cell1
            ? String((cell1 as any).result)
            : String(cell1);
        strVal1 = strVal1.trim().toLowerCase();

        // Skip title row or column header match
        if (
          strVal1 === sheetName.toLowerCase() ||
          columns.some((c) => c.header.toLowerCase() === strVal1)
        ) {
          return;
        }

        existingKeys.add(strVal1);

        // Also record composite signature (Col 1 + Col 2 + Col 3)
        const cell2 = row.getCell(2).value;
        const cell3 = row.getCell(3).value;
        if (cell2 || cell3) {
          const strVal2 = String(cell2 ?? '').trim().toLowerCase();
          const strVal3 = String(cell3 ?? '').trim().toLowerCase();
          existingKeys.add(`${strVal1}_${strVal2}_${strVal3}`);
        }
      });

      // Filter local DB rows for duplicates
      rows.forEach((item: Record<string, any>) => {
        const keyVal1 = String(item[columns[0].key] ?? '').trim().toLowerCase();
        const keyVal2 = String(item[columns[1]?.key] ?? '').trim().toLowerCase();
        const keyVal3 = String(item[columns[2]?.key] ?? '').trim().toLowerCase();

        // Deduplication Check
        const isDuplicate =
          (keyVal1 !== '' && existingKeys.has(keyVal1)) ||
          existingKeys.has(`${keyVal1}_${keyVal2}_${keyVal3}`);

        if (isDuplicate) {
          return; // Skip existing record
        }

        // Append new record
        const rowData = columns.map((col) => sanitizeExcelCellValue(item[col.key]));
        const row = sheet!.addRow(rowData);
        styleDataRow(row, columns);

        existingKeys.add(keyVal1);
        existingKeys.add(`${keyVal1}_${keyVal2}_${keyVal3}`);
        totalAppendedRecords++;
      });
    }

    // Auto-fit column widths for newly modified sheet
    sheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell?.({ includeEmpty: true }, (cell, rowNumber) => {
        if (rowNumber === 1) return; // Ignore title row
        const length = cell.value ? cell.value.toString().length : 0;
        if (length > maxLength) maxLength = length;
      });
      column.width = maxLength + 2;
    });
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const outputFileName = inputFileName.endsWith('.xlsx')
    ? inputFileName.replace(/\.xlsx$/i, `_Updated_${dateStr}.xlsx`)
    : `RentFlow_Master_Updated_${dateStr}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  const savedPath = await persistWorkbookBuffer(buffer, outputFileName, customExportDir);

  return {
    fileName: outputFileName,
    savedPath,
    totalRecords: totalAppendedRecords,
    sheetCount: workbook.worksheets.length,
    workbook,
  };
}

// Alias for backward compatibility
export const exportAllDataToExcel = exportToExcel;

export type MasterExportDataset = Record<string, { columns: ColumnDef[]; rows: Record<string, any>[] }>;

export interface MasterExcelSyncOptions {
  pack?: CountryPack;
  targetFolder?: string;
  savePath?: string;
  data?: MasterExportDataset;
  /** When true (e.g. background browser/test calls), avoid triggering browser file download popup */
  silentDownload?: boolean;
}

let masterSyncInFlight: Promise<ExportResult> | null = null;

/**
 * Generates and writes a styled multi-tab Excel master workbook (`RentFlow_Master_Data.xlsx`)
 * using ExcelJS, converting the workbook buffer cleanly to a `Uint8Array` and saving via
 * Tauri's filesystem plugin (with Downloads fallback when no folder is set).
 */
export async function exportMasterExcel(
  data?: MasterExportDataset,
  savePath?: string,
  options?: { pack?: CountryPack; silentDownload?: boolean }
): Promise<ExportResult> {
  const activePack = options?.pack || getCountryPack(usePackStore.getState().countryCode || 'US');
  const currencySymbol = activePack?.currency?.symbol || '$';
  const currencyNumFmt = `"${currencySymbol} "#,##0.00`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RentFlow Property Management';
  workbook.created = new Date();
  workbook.modified = new Date();

  const exportData = data || getExportData(activePack);
  let totalRecordsCount = 0;

  Object.entries(exportData).forEach(([sheetName, { columns, rows }]) => {
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
    });

    // 1. Row 1: Styled Indigo Header (#4F46E5 fill, white bold text, thin borders)
    const headerRow = sheet.addRow(columns.map((c) => c.header));
    headerRow.height = 26;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    // 2. Data Rows (Row 2+)
    rows.forEach((item: Record<string, any>) => {
      totalRecordsCount++;
      const rowData = columns.map((col) => sanitizeExcelCellValue(item[col.key]));
      const row = sheet.addRow(rowData);
      row.height = 20;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const colDef = columns[colNumber - 1];
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colDef?.isCurrency || typeof cell.value === 'number' ? 'right' : 'left',
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        };

        if (colDef?.isCurrency && typeof cell.value === 'number' && Number.isFinite(cell.value)) {
          cell.numFmt = currencyNumFmt;
        }
      });
    });

    // 3. Auto-adjust column widths based on longest text
    sheet.columns.forEach((column, idx) => {
      let maxLength = columns[idx]?.header?.length || 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const val = cell.value;
        const str =
          val === null || val === undefined
            ? ''
            : typeof val === 'object' && 'result' in val
            ? String((val as any).result ?? '')
            : String(val);
        if (str.length > maxLength) maxLength = str.length;
      });
      column.width = Math.max(12, Math.min(maxLength + 4, 60));
    });
  });

  const rawBuffer = await workbook.xlsx.writeBuffer();
  const uint8Array = toCleanUint8Array(rawBuffer);

  const settingsState = useAppSettingsStore.getState();
  const resolvedTarget = (
    savePath ||
    settingsState.masterExcelFolder ||
    settingsState.exportDestination ||
    ''
  ).trim();

  const savedPath = await persistWorkbookBuffer(
    uint8Array,
    MASTER_EXCEL_FILENAME,
    isValidConfiguredPath(resolvedTarget) ? resolvedTarget : undefined,
    { silentDownload: options?.silentDownload }
  );

  settingsState.setLastMasterExcelSync(new Date().toISOString());

  return {
    fileName: MASTER_EXCEL_FILENAME,
    savedPath,
    totalRecords: totalRecordsCount,
    sheetCount: workbook.worksheets.length,
    workbook,
  };
}

/**
 * Generates and atomically overwrites `RentFlow_Master_Data.xlsx` with all portfolio tabs.
 * Styling: Bold `#4F46E5` indigo headers with white text, thin cell borders, currency formatting,
 * frozen header rows, and auto-adjusted column widths based on the longest cell text.
 */
export async function syncMasterExcelFile(
  optionsOrPack?: MasterExcelSyncOptions | CountryPack,
  customMasterDir?: string
): Promise<ExportResult> {
  const executeSync = async (): Promise<ExportResult> => {
    const opts: MasterExcelSyncOptions =
      optionsOrPack && 'code' in optionsOrPack
        ? { pack: optionsOrPack, targetFolder: customMasterDir }
        : { ...(optionsOrPack || {}), targetFolder: customMasterDir ?? optionsOrPack?.targetFolder };

    return exportMasterExcel(opts.data, opts.savePath || opts.targetFolder, {
      pack: opts.pack,
      silentDownload: opts.silentDownload,
    });
  };

  if (masterSyncInFlight) {
    await masterSyncInFlight.catch(() => {});
  }
  const current = executeSync();
  masterSyncInFlight = current;
  try {
    return await current;
  } finally {
    if (masterSyncInFlight === current) {
      masterSyncInFlight = null;
    }
  }
}
