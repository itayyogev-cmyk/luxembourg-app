
import { PesticideDatabaseEntry as Pesticide } from './types';

const STORAGE_KEY = 'pesticide_db';

// Initialization with robust error handling for JSON parsing
const loadInitialData = (): Record<string, Pesticide> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (err) {
    console.error("Failed to parse pesticide database from localStorage. Resetting to empty object.", err);
    return {};
  }
};

/**
 * PESTICIDE_DB acts as a singleton source of truth.
 * All components should import this object.
 */
export let PESTICIDE_DB: Record<string, Pesticide> = loadInitialData();

/**
 * Parses tab-separated text and updates both memory and localStorage.
 * Expected columns: Name, Formulation, AI1, Amt1, AI2, Amt2, AI3, Amt3
 */
export const updatePesticideDB = (rawText: string): number => {
  const lines = rawText.split('\n');
  const newDb: Record<string, Pesticide> = {};

  lines.forEach(line => {
    const cols = line.split('\t');
    // We expect at least a name column
    if (cols.length < 1) return;
    
    const name = cols[0]?.trim();
    if (!name || name === "שם" || name === "שם תכשיר" || name === "Name") return;

    newDb[name] = {
      name,
      formulation: cols[1]?.trim() || '',
      ai1: cols[2]?.trim() || '',
      amt1: cols[3]?.trim() || '',
      ai2: cols[4]?.trim() || '',
      amt2: cols[5]?.trim() || '',
      ai3: cols[6]?.trim() || '',
      amt3: cols[7]?.trim() || '',
    };
  });

  try {
    const jsonStr = JSON.stringify(newDb);
    localStorage.setItem(STORAGE_KEY, jsonStr);
    
    // Update the memory reference in-place to ensure all importers see changes immediately
    Object.keys(PESTICIDE_DB).forEach(key => delete PESTICIDE_DB[key]);
    Object.assign(PESTICIDE_DB, newDb);
    
    return Object.keys(newDb).length;
  } catch (err) {
    console.error("Failed to save pesticide database to localStorage:", err);
    return 0;
  }
};

export const updatePesticideDBWithObject = (newDb: Record<string, Pesticide>): void => {
  try {
    const jsonStr = JSON.stringify(newDb);
    localStorage.setItem(STORAGE_KEY, jsonStr);
    
    // Update the memory reference in-place
    Object.keys(PESTICIDE_DB).forEach(key => delete PESTICIDE_DB[key]);
    Object.assign(PESTICIDE_DB, newDb);
  } catch (err) {
    console.error("Failed to save pesticide database to localStorage:", err);
  }
};
