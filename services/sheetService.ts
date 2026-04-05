
import { PesticideDatabaseEntry as Pesticide } from '../types';

const SHEET_ID = '11iWPWiwS0A5XaEMru3bRwZeHioq7QzS81Wt36__jnkY';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

export const fetchPesticideDataFromSheet = async (): Promise<Record<string, Pesticide>> => {
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error('Failed to fetch sheet data');
    
    const csvText = await response.text();
    const lines = csvText.split(/\r?\n/);
    const newDb: Record<string, Pesticide> = {};

    lines.forEach((line, index) => {
      // Skip header
      if (index === 0) return;
      
      // Better CSV split that handles quoted commas
      const cols: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cols.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      cols.push(current.trim());
      
      const cleanCols = cols.map(c => c.replace(/^"|"$/g, '').trim());
      
      if (cleanCols.length < 1) return;
      
      const name = cleanCols[0];
      if (!name || name === "שם" || name === "שם תכשיר" || name === "Name") return;

      newDb[name] = {
        name,
        formulation: cleanCols[1] || '',
        ai1: cleanCols[2] || '',
        amt1: cleanCols[3] || '',
        ai2: cleanCols[4] || '',
        amt2: cleanCols[5] || '',
        ai3: cleanCols[6] || '',
        amt3: cleanCols[7] || '',
      };
    });

    return newDb;
  } catch (error) {
    console.error('Error fetching pesticide data from Google Sheet:', error);
    throw error;
  }
};
