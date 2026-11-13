import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { db } from '../db/client';
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

export interface ColumnDef {
  header: string;
  key: string;
  width?: number;
  isCurrency?: boolean;
}

export interface ExportResult {
  fileName: string;
  totalRecords: number;
  sheetCount: number;
  workbook?: ExcelJS.Workbook;
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
export async function exportToExcel(pack?: CountryPack): Promise<ExportResult> {
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
      const rowData = columns.map((col) =>
        item[col.key] !== undefined && item[col.key] !== null ? item[col.key] : ''
      );
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

  // Generate Excel buffer and trigger real file download via FileSaver.saveAs
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `RentFlow_Export_${dateStr}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();

  if (typeof window !== 'undefined') {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, fileName);
  }

  return {
    fileName,
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
  pack?: CountryPack
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
        const rowData = columns.map((col) =>
          item[col.key] !== undefined && item[col.key] !== null ? item[col.key] : ''
        );
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
        const rowData = columns.map((col) =>
          item[col.key] !== undefined && item[col.key] !== null ? item[col.key] : ''
        );
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

  // Save and download file
  const dateStr = new Date().toISOString().split('T')[0];
  const outputFileName = inputFileName.endsWith('.xlsx')
    ? inputFileName.replace(/\.xlsx$/i, `_Updated_${dateStr}.xlsx`)
    : `RentFlow_Master_Updated_${dateStr}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();

  if (typeof window !== 'undefined') {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, outputFileName);
  }

  return {
    fileName: outputFileName,
    totalRecords: totalAppendedRecords,
    sheetCount: workbook.worksheets.length,
    workbook,
  };
}

// Alias for backward compatibility
export const exportAllDataToExcel = exportToExcel;
