/**
 * Read Japanese insurance and pension calculation table
 */

import * as XLSX from 'xlsx';

const filePath = '/Users/taozhang/Downloads/r7ippan3.xlsx';

try {
  const workbook = XLSX.readFile(filePath);

  console.log('=== Insurance & Pension Calculation Table ===');
  console.log('Sheet names:', workbook.SheetNames);

  for (const sheetName of workbook.SheetNames) {
    console.log(`\n=== Sheet: ${sheetName} ===`);
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON with headers
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Print first 50 rows
    for (let i = 0; i < Math.min(50, data.length); i++) {
      const row = data[i] as unknown[];
      if (row && row.some(cell => cell !== '')) {
        console.log(`Row ${i + 1}:`, row.slice(0, 15).join(' | '));
      }
    }
  }
} catch (error) {
  console.error('Error:', error);
}
