
export enum ExperimentCategory {
  WEEDS = 'עשבים',
  DISEASES = 'מחלות',
  PESTS = 'מזיקים'
}

export enum DesignType {
  CRD = 'אקראיות גמורה',
  RCBD = 'בלוקים באקראי',
  SIMPLE = 'פשוט (ללא בלוקים)'
}

export const COLOR_OPTIONS = [
  { name: 'שחור', hex: '#000000' },
  { name: 'לבן', hex: '#ffffff' },
  { name: 'ירוק', hex: '#10b981' },
  { name: 'כחול', hex: '#3b82f6' },
  { name: 'צהוב', hex: '#FFFF00' },
  { name: 'כתום', hex: '#f97316' },
  { name: 'סגול', hex: '#8b5cf6' },
  { name: 'אדום', hex: '#ef4444' },
  { name: 'חום', hex: '#78350f' },
  { name: 'אפור', hex: '#6b7280' }
];

export interface Product {
  id: string;
  name: string;
  activeIngredient: string;
  formulation: string;
  dosage: string;
}

export interface ApplicationDetails {
  date: string;
  volumePerDunam: string;
  equipment: string;
  nozzle: string;
  pressure: string;
  speed: string;
  weather: string;
}

export interface Treatment {
  id: string;
  number: number;
  name: string;
  fieldLabel?: string; // Short label used in print forms
  colors: string[]; 
  products: Product[];
  isControl: boolean;
  adjuvantName?: string;
  adjuvantConcentration?: string;
}

export interface DataPoint {
  id: string;
  treatmentId: string;
  parameterId: string; // Refers to parameter.id
  rep: number;
  sampleIndex?: number; // 1-10 for multiple samples per rep
  photo?: string;
  value: number | string;
  timestamp: string;
}

export interface ResearchVariable {
  id: string;
  name: string;
  unit: string;
}

export interface TargetSpecies {
  id: string;
  name: string;
}

export interface PesticideDatabaseEntry {
  name: string;
  formulation: string;
  ai1: string;
  amt1: string;
  ai2?: string;
  amt2?: string;
  ai3?: string;
  amt3?: string;
}

export interface GlobalSettings {
  reportStyleDescription: string;
  language: 'he' | 'en';
  pesticideDb: Record<string, PesticideDatabaseEntry>;
}

export interface FieldBlock {
  rep: number;
  treatmentIds: string[];
}

export interface Experiment {
  id: string;
  title: string;
  category: ExperimentCategory;
  designType: DesignType;
  hypothesis: string;
  treatments: Treatment[];
  variables: ResearchVariable[];
  parameters: ResearchVariable[]; 
  applicationDetails: ApplicationDetails;
  targets: TargetSpecies[];
  evaluations: Record<string, DataPoint[]>;
  fieldMap?: FieldBlock[]; 
  data: DataPoint[]; 
  variety: string;
  plantingDate: string;
  irrigationMethod: string;
  applicationMethod: string;
  applicationDates: string[];
  reportMetadata: Record<string, string>;
}

export enum AppStep {
  SETUP = 'SETUP',
  PLANNING = 'PLANNING',
  MAP = 'MAP',
  COLLECT = 'COLLECT',
  ANALYTICS = 'ANALYTICS',
  REPORT = 'REPORT'
}

export interface AppData {
  experiment: Experiment;
  settings: GlobalSettings;
}
