import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface SheetData {
  name: string;
  data: Record<string, any>[];
}

const THIN_GRAY_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
};

/**
 * Generates and downloads a professionally formatted multi-sheet Excel .xlsx file using ExcelJS.
 */
export async function exportToXLSX(fileName: string, sheets: SheetData[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RentFlow Property Management';
  workbook.created = new Date();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name.substring(0, 31), {
      views: [{ showGridLines: true }],
    });

    if (!sheet.data || sheet.data.length === 0) {
      continue;
    }

    const sampleObj = sheet.data[0];
    const keys = Object.keys(sampleObj);
    const numCols = keys.length;

    // 1. Title Row (Row 1): Merged A1 to last col, dark blue #1F4E78, font size 16 bold white
    worksheet.mergeCells(1, 1, 1, numCols);
    const titleRow = worksheet.getRow(1);
    titleRow.height = 30;

    for (let c = 1; c <= numCols; c++) {
      const cell = titleRow.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };
      cell.border = THIN_GRAY_BORDER;
    }

    const titleCell = titleRow.getCell(1);
    titleCell.value = sheet.name;
    titleCell.font = {
      name: 'Calibri',
      size: 16,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    titleCell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };

    // 2. Header Row (Row 2): Bold, light gray #D9E1F2, centered, thin borders
    const headerRow = worksheet.getRow(2);
    headerRow.height = 24;

    keys.forEach((key, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = key;
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FF000000' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      cell.border = THIN_GRAY_BORDER;
    });

    // 3. Data Rows (Row 3+): Thin gray borders on all cells
    sheet.data.forEach((rowObj, rIdx) => {
      const dataRow = worksheet.getRow(rIdx + 3);
      dataRow.height = 20;

      keys.forEach((key, cIdx) => {
        const cell = dataRow.getCell(cIdx + 1);
        const val = rowObj[key];

        cell.value = val !== undefined && val !== null ? val : '';
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: typeof val === 'number' ? 'right' : 'left',
        };
        cell.border = THIN_GRAY_BORDER;

        if (typeof val === 'number' && (key.toLowerCase().includes('amount') || key.toLowerCase().includes('rent') || key.toLowerCase().includes('fee') || key.toLowerCase().includes('subtotal') || key.toLowerCase().includes('total') || key.toLowerCase().includes('paid'))) {
          cell.numFmt = '"Rs. "#,##0.00';
        }
      });
    });

    // 4. Auto-width
    worksheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber === 1) return;
        const cellValue = cell.value !== undefined && cell.value !== null ? String(cell.value) : '';
        if (cellValue.length > maxLength) {
          maxLength = cellValue.length;
        }
      });
      column.width = maxLength + 2;
    });
  }

  const finalName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, finalName);
}
