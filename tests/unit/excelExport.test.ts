import { describe, it, expect, beforeEach } from 'vitest';
import { exportToExcel, exportAllDataToExcel, updateExistingExcel } from '../../src/lib/excelExport';
import { db } from '../../src/db/client';
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
} from '../../src/db/schema';

describe('ExcelJS Multi-Sheet Export Tests', () => {
  beforeEach(() => {
    // Populate DB with sample records across all 9 modules
    db.insertItem<Property>('properties', {
      id: 'prop_ex_1',
      org_id: 'org_1',
      name: 'Sunset Apartments',
      type: 'residential_apartment',
      address_line1: '123 Palm Ave',
      city: 'Islamabad',
      country_code: 'PK',
    });

    db.insertItem<Unit>('units', {
      id: 'unit_ex_1',
      property_id: 'prop_ex_1',
      name: 'Apt 101',
      size: 950,
      area_unit: 'sqft',
      bedrooms: 2,
      bathrooms: 1,
      rent_minor: 150000,
      currency_code: 'PKR',
      status: 'occupied',
    });

    db.insertItem<Tenant>('tenants', {
      id: 'ten_ex_1',
      org_id: 'org_1',
      name: 'Ali Khan',
      phone: '+92 300 1234567',
      email: 'ali@example.com',
      id_type: 'CNIC',
      id_number: '37405-1234567-1',
      emergency_contact: 'Father (+92 300 7654321)',
    });

    db.insertItem<Lease>('leases', {
      id: 'lease_ex_1',
      unit_id: 'unit_ex_1',
      tenant_id: 'ten_ex_1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_minor: 150000,
      deposit_minor: 300000,
      currency_code: 'PKR',
      country_code_snapshot: 'PK',
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 1,
      late_fee_type: 'none',
      late_fee_value: 0,
      grace_days: 5,
      status: 'active',
    });

    db.insertItem<Invoice>('invoices', {
      id: 'INV-2026-001',
      lease_id: 'lease_ex_1',
      period_start: '2026-02-01',
      period_end: '2026-02-28',
      due_date: '2026-02-05',
      subtotal_minor: 150000,
      late_fee_minor: 0,
      total_minor: 150000,
      amount_paid_minor: 150000,
      currency_code: 'PKR',
      status: 'paid',
    });

    db.insertItem<Payment>('payments', {
      id: 'PAY-001',
      invoice_id: 'INV-2026-001',
      amount_minor: 150000,
      currency_code: 'PKR',
      method: 'Bank Transfer',
      reference: 'TXN-998822',
      paid_at: '2026-02-04T10:00:00Z',
    });

    db.insertItem<Expense>('expenses', {
      id: 'EXP-001',
      org_id: 'org_1',
      property_id: 'prop_ex_1',
      category: 'repairs',
      amount_minor: 25000,
      currency_code: 'PKR',
      expense_date: '2026-02-10',
      notes: 'Water booster pump replacement',
    });

    db.insertItem<MaintenanceRequest>('maintenance_requests', {
      id: 'MAINT-001',
      unit_id: 'unit_ex_1',
      description: 'Leaking bathroom sink faucet',
      category: 'plumbing',
      urgency: 'medium',
      status: 'completed',
      cost_minor: 12000,
      paid_by: 'landlord',
      completed_at: '2026-02-12',
    });

    db.insertItem<Vendor>('vendors', {
      id: 'VEND-001',
      org_id: 'org_1',
      name: 'Alpha Plumbing Services',
      category: 'Plumbing',
      phone: '+92 333 9988776',
      email: 'alpha@plumbing.pk',
    });
  });

  it('generates a multi-sheet workbook with all 9 modules and correct titles', async () => {
    const result = await exportToExcel();

    expect(result.sheetCount).toBe(9);
    expect(result.workbook).toBeDefined();

    const wb = result.workbook!;
    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(sheetNames).toEqual([
      'Properties',
      'Units',
      'Tenants',
      'Leases',
      'Invoices',
      'Payments',
      'Expenses',
      'Maintenance',
      'Vendors',
    ]);
  });

  it('applies professional ExcelJS styling to every worksheet', async () => {
    const result = await exportToExcel();
    const wb = result.workbook!;

    wb.worksheets.forEach((ws) => {
      // 1. Title Row (Row 1): Height = 30, dark blue #1F4E78, white font size 16 bold
      const titleRow = ws.getRow(1);
      expect(titleRow.height).toBe(30);

      const titleCell = ws.getCell('A1');
      expect(titleCell.font?.size).toBe(16);
      expect(titleCell.font?.bold).toBe(true);
      expect(titleCell.font?.color?.argb).toBe('FFFFFFFF');
      expect((titleCell.fill as any)?.fgColor?.argb).toBe('FF1F4E78');

      // 2. Header Row (Row 2): Bold font, light gray #D9E1F2
      const headerCell = ws.getCell('A2');
      expect(headerCell.font?.bold).toBe(true);
      expect((headerCell.fill as any)?.fgColor?.argb).toBe('FFD9E1F2');
      expect(headerCell.border?.top?.style).toBe('thin');
      expect(headerCell.border?.top?.color?.argb).toBe('FFD3D3D3');

      // 3. Columns width computed
      ws.columns.forEach((col) => {
        expect(col.width).toBeGreaterThanOrEqual(10);
      });
    });
  });

  it('verifies exact column headers for all 9 modules as requested', async () => {
    const result = await exportToExcel();
    const wb = result.workbook!;

    // Helper to get row 2 header values
    const getHeaders = (sheetName: string): string[] => {
      const ws = wb.getWorksheet(sheetName)!;
      const headers: string[] = [];
      const row2 = ws.getRow(2);
      row2.eachCell((cell) => {
        headers.push(String(cell.value));
      });
      return headers;
    };

    expect(getHeaders('Properties')).toEqual([
      'Property Name',
      'Type',
      'Address',
      'City',
      'Country',
      'Total Units',
    ]);

    expect(getHeaders('Units')).toEqual([
      'Unit Name',
      'Property Name',
      'Size',
      'Rent',
      'Status',
    ]);

    expect(getHeaders('Tenants')).toEqual([
      'Name',
      'Phone',
      'Email',
      'ID Type',
      'ID Number',
      'Emergency Contact',
    ]);

    expect(getHeaders('Leases')).toEqual([
      'Tenant',
      'Unit',
      'Start Date',
      'End Date',
      'Rent',
      'Deposit',
      'Status',
    ]);

    expect(getHeaders('Invoices')).toEqual([
      'Invoice #',
      'Tenant Name',
      'Due Date',
      'Subtotal',
      'Late Fee',
      'Total',
      'Paid',
      'Status',
    ]);

    expect(getHeaders('Payments')).toEqual([
      'Date',
      'Tenant Name',
      'Amount',
      'Method',
      'Reference',
    ]);

    expect(getHeaders('Expenses')).toEqual([
      'Date',
      'Category',
      'Amount',
      'Property/Unit',
      'Notes',
    ]);

    expect(getHeaders('Maintenance')).toEqual([
      'Date',
      'Issue',
      'Unit',
      'Status',
      'Assigned Vendor',
      'Cost',
    ]);

    expect(getHeaders('Vendors')).toEqual([
      'Name',
      'Category',
      'Phone',
      'Email',
    ]);
  });

  it('formats currency columns with Rs. #,##0.00 and applies thin borders to data cells', async () => {
    const result = await exportToExcel();
    const wb = result.workbook!;

    const unitsWs = wb.getWorksheet('Units')!;
    // Row 3 is first data row; Column 4 is 'Rent'
    const rentCell = unitsWs.getRow(3).getCell(4);
    expect(rentCell.numFmt).toContain('Rs.');
    expect(rentCell.border?.top?.style).toBe('thin');
    expect(rentCell.border?.top?.color?.argb).toBe('FFD3D3D3');
  });

  it('ensures exportAllDataToExcel is an alias to exportToExcel', () => {
    expect(exportAllDataToExcel).toBe(exportToExcel);
  });

  it('updates an existing Excel file by appending new records without duplicating existing ones', async () => {
    // 1. Initial Export
    const initialExport = await exportToExcel();
    const initialBuffer = await initialExport.workbook!.xlsx.writeBuffer();

    // 2. Add a new tenant and a new property to local DB
    db.insertItem<Tenant>('tenants', {
      id: 'ten_ex_2',
      org_id: 'org_1',
      name: 'Sara Ahmed',
      phone: '+92 300 8889900',
      email: 'sara@example.com',
      id_type: 'CNIC',
      id_number: '37405-9988776-1',
    });

    db.insertItem<Property>('properties', {
      id: 'prop_ex_2',
      org_id: 'org_1',
      name: 'Highland Towers',
      type: 'commercial',
      city: 'Lahore',
      country_code: 'PK',
    });

    // 3. Perform updateExistingExcel on the initial buffer
    const updateResult = await updateExistingExcel(initialBuffer);
    expect(updateResult.workbook).toBeDefined();

    const updatedWb = updateResult.workbook!;
    const tenantsWs = updatedWb.getWorksheet('Tenants')!;

    // Check that existing tenant "Ali Khan" and new tenant "Sara Ahmed" both exist
    const tenantNames: string[] = [];
    tenantsWs.eachRow((row, rowNumber) => {
      if (rowNumber > 2) {
        tenantNames.push(String(row.getCell(1).value));
      }
    });

    expect(tenantNames).toContain('Ali Khan');
    expect(tenantNames).toContain('Sara Ahmed');
    // Ali Khan should appear only ONCE (no duplicates!)
    expect(tenantNames.filter((n) => n === 'Ali Khan').length).toBe(1);

    // Check newly appended row has thin borders
    const saraRow = tenantsWs.getRow(tenantsWs.rowCount);
    expect(saraRow.getCell(1).border?.top?.style).toBe('thin');
  });
});
