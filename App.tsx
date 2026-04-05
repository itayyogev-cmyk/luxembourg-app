
import React, { useState, useEffect, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { AppStep, Experiment, ExperimentCategory, DesignType, GlobalSettings, Treatment, DataPoint } from './types';
import Layout from './components/Layout';
import Setup from './components/Setup';
import DataCollection from './components/DataCollection';
import PlanExperiment from './components/PlanExperiment';
import FieldMap from './components/FieldMap';
import ReportGenerator from './components/ReportGenerator';
import Analytics from './components/Analytics';
import { PESTICIDE_DB, updatePesticideDBWithObject } from './pesticideData';
import { fetchPesticideDataFromSheet } from './services/sheetService';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Fix: Use React.Component explicitly to ensure property inheritance like 'this.props' is correctly recognized by the TypeScript compiler.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8 text-center" dir="rtl">
          <div className="bg-white p-12 rounded-[3rem] border-4 border-black shadow-2xl max-w-lg">
            <h1 className="text-3xl font-black text-slate-900 mb-4">אופס! משהו השתבש</h1>
            <p className="text-slate-500 mb-8 font-bold">התרחשה שגיאה לא צפויה בטעינת האפליקציה.</p>
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="bg-red-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:bg-red-700 transition-all border-2 border-black"
            >
              אפס את כל הנתונים ונסה שוב
            </button>
          </div>
        </div>
      );
    }
    // Fixed: 'this.props' is now correctly recognized as an inherited property from 'React.Component'
    return (this as any).props.children;
  }
}

const getFreshId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const INITIAL_EXPERIMENT_TEMPLATE: Omit<Experiment, 'id'> = {
  title: 'ניסוי חדש',
  category: ExperimentCategory.WEEDS,
  designType: DesignType.RCBD,
  hypothesis: '',
  treatments: [],
  variables: [{ id: 'var-1', name: 'אחוז הדברה', unit: '%' }],
  parameters: [{ id: 'param-1', name: 'יעילות הדברה', unit: '%' }],
  applicationDetails: {
    date: new Date().toISOString().split('T')[0],
    volumePerDunam: '',
    equipment: '',
    nozzle: '',
    pressure: '',
    speed: '',
    weather: ''
  },
  targets: [],
  evaluations: {},
  fieldMap: undefined,
  data: [],
  variety: '',
  plantingDate: '',
  irrigationMethod: '',
  applicationMethod: '',
  applicationDates: [],
  reportMetadata: {}
};

const INITIAL_SETTINGS: GlobalSettings = {
  reportStyleDescription: '',
  language: 'he',
  pesticideDb: PESTICIDE_DB
};

const migrateExperiment = (exp: any): Experiment => {
  const baseId = getFreshId();
  const base = { ...INITIAL_EXPERIMENT_TEMPLATE, id: baseId };
  if (!exp) return base as Experiment;
  
  const migratedTreatments = (exp.treatments || []).map((t: any): Treatment => ({
    ...t,
    id: t.id || getFreshId(),
    number: t.number || 0,
    name: t.name || '',
    colors: Array.isArray(t.colors) ? t.colors : (t.color ? [t.color] : ['אדום']),
    products: Array.isArray(t.products) ? t.products : [],
    fieldLabel: t.fieldLabel || '',
    adjuvantName: t.adjuvantName || '',
    adjuvantConcentration: t.adjuvantConcentration || ''
  }));

  const migratedEvaluations: Record<string, DataPoint[]> = {};
  if (typeof exp.evaluations === 'object' && exp.evaluations !== null) {
    Object.keys(exp.evaluations).forEach(date => {
      migratedEvaluations[date] = (exp.evaluations[date] || []).map((dp: any): DataPoint => ({
        ...dp,
        id: dp.id || getFreshId(),
        parameterId: dp.parameterId || dp.variableId || '', // Migration path
        rep: dp.rep !== undefined ? dp.rep : dp.repetition || 0 // Migration path
      }));
    });
  }

  return {
    ...base,
    ...exp,
    id: exp.id || base.id,
    designType: exp.designType || base.designType,
    parameters: Array.isArray(exp.parameters) ? exp.parameters : base.parameters,
    applicationDetails: {
      ...base.applicationDetails,
      ...(exp.applicationDetails || {})
    },
    evaluations: migratedEvaluations,
    fieldMap: Array.isArray(exp.fieldMap) ? exp.fieldMap : undefined,
    treatments: migratedTreatments,
    data: (exp.data || []).map((dp: any) => ({
      ...dp,
      parameterId: dp.parameterId || dp.variableId || '',
      rep: dp.rep !== undefined ? dp.rep : dp.repetition || 0
    })),
    variety: exp.variety || '',
    plantingDate: exp.plantingDate || '',
    irrigationMethod: exp.irrigationMethod || '',
    applicationMethod: exp.applicationMethod || '',
    applicationDates: Array.isArray(exp.applicationDates) ? exp.applicationDates : [],
    reportMetadata: exp.reportMetadata || {}
  };
};

const App: React.FC = () => {
  (window as any).emergencyReset = () => {
    localStorage.clear();
    window.location.href = window.location.origin;
  };

  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.SETUP);
  const [isResetting, setIsResetting] = useState(false);
  
  const [allExperiments, setAllExperiments] = useState<Record<string, Experiment>>(() => {
    try {
      const saved = localStorage.getItem('fieldlab_experiments_archive');
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      const migrated: Record<string, Experiment> = {};
      Object.keys(parsed).forEach(id => {
        migrated[id] = migrateExperiment(parsed[id]);
      });
      return migrated;
    } catch (e) {
      console.error("Archive corrupted, clearing list", e);
      return {};
    }
  });

  const [experiment, setExperiment] = useState<Experiment>(() => {
    try {
      const currentId = localStorage.getItem('fieldlab_active_experiment_id');
      const savedArchive = localStorage.getItem('fieldlab_experiments_archive');
      if (currentId && savedArchive) {
        const archive = JSON.parse(savedArchive);
        if (archive[currentId]) return migrateExperiment(archive[currentId]);
      }
      const legacy = localStorage.getItem('fieldlab_current_experiment');
      if (legacy) return migrateExperiment(JSON.parse(legacy));
      return { ...INITIAL_EXPERIMENT_TEMPLATE, id: getFreshId() } as Experiment;
    } catch (e) {
      console.error("Failed to load active experiment", e);
      return { ...INITIAL_EXPERIMENT_TEMPLATE, id: getFreshId() } as Experiment;
    }
  });

  const [settings, setSettings] = useState<GlobalSettings>(() => {
    try {
      const saved = localStorage.getItem('fieldlab_settings');
      if (!saved) return { ...INITIAL_SETTINGS };
      const baseSettings = JSON.parse(saved);
      return { ...INITIAL_SETTINGS, ...baseSettings, pesticideDb: PESTICIDE_DB };
    } catch (e) {
      return { ...INITIAL_SETTINGS };
    }
  });

  // Fetch pesticide data from Google Sheet on mount
  useEffect(() => {
    const updateFromSheet = async () => {
      try {
        const newDb = await fetchPesticideDataFromSheet();
        updatePesticideDBWithObject(newDb);
        setSettings(prev => ({
          ...prev,
          pesticideDb: { ...newDb }
        }));
        console.log('Pesticide database updated from Google Sheet');
      } catch (error) {
        console.error('Failed to update pesticide database from sheet:', error);
      }
    };
    updateFromSheet();
  }, []);

  const handleSave = useCallback(() => {
    if (isResetting) return;
    setAllExperiments(prev => {
      const newArchive = { ...prev, [experiment.id]: experiment };
      try {
        localStorage.setItem('fieldlab_experiments_archive', JSON.stringify(newArchive));
        localStorage.setItem('fieldlab_active_experiment_id', experiment.id);
        localStorage.setItem('fieldlab_current_experiment', JSON.stringify(experiment));
      } catch (e) {
        console.error("Save to storage failed", e);
      }
      return newArchive;
    });
  }, [experiment, isResetting]);

  useEffect(() => {
    if (experiment && experiment.id && !isResetting && currentStep !== AppStep.SETUP) {
      handleSave();
    }
  }, [experiment, handleSave, isResetting, currentStep]);

  useEffect(() => {
    try {
      localStorage.setItem('fieldlab_settings', JSON.stringify(settings));
    } catch (e) {
      console.error("Settings save failed", e);
    }
  }, [settings]);

  const handleExport = useCallback(() => {
    const dataStr = JSON.stringify({ experiment, settings }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `experiment_${experiment?.title || 'untitled'}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [experiment, settings]);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (imported.experiment) {
          const migrated = migrateExperiment(imported.experiment);
          setExperiment(migrated);
          setCurrentStep(AppStep.PLANNING);
        }
        if (imported.settings) setSettings(prev => ({ ...prev, ...imported.settings, pesticideDb: PESTICIDE_DB }));
        alert('הנתונים יובאו בהצלחה');
      } catch (err) {
        alert('שגיאה בייבוא הקובץ - פורמט לא תקין');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleNew = useCallback(() => {
    console.log('Reset triggered');
    try {
      const confirmMsg = 'האם אתה בטוח שברצונך להתחיל ניסוי חדש? כל הנתונים הנוכחיים (כולל המאגרים והארכיון) יימחקו לצמיתות.';
      if (window.confirm(confirmMsg)) {
        setIsResetting(true);
        localStorage.clear();
        window.location.reload();
      }
    } catch (err) {
      console.error('Error in handleNew:', err);
    }
  }, []);

  const handleLoadExperiment = useCallback((id: string) => {
    handleSave(); 
    const target = allExperiments[id];
    if (target) {
      setTimeout(() => {
        setExperiment(target);
        setCurrentStep(AppStep.PLANNING);
      }, 0);
    }
  }, [allExperiments, handleSave]);

  const handleDeleteExperiment = useCallback((id: string) => {
    if (window.confirm('האם אתה בטוח שברצונך למחוק ניסוי זה מהארכיון? הפעולה אינה ניתנת לביטול.')) {
      const newArchive = { ...allExperiments };
      delete newArchive[id];
      setAllExperiments(newArchive);
      localStorage.setItem('fieldlab_experiments_archive', JSON.stringify(newArchive));
      
      if (id === experiment.id) {
        const freshId = getFreshId();
        const freshExp = { ...INITIAL_EXPERIMENT_TEMPLATE, id: freshId } as Experiment;
        setExperiment(freshExp);
        setAllExperiments(prev => ({ ...prev, [freshId]: freshExp }));
        setCurrentStep(AppStep.SETUP);
      }
    }
  }, [allExperiments, experiment.id]);

  const renderStep = () => {
    switch (currentStep) {
      case AppStep.SETUP:
        return <Setup onStart={() => setCurrentStep(AppStep.PLANNING)} />;
      case AppStep.PLANNING:
        return <PlanExperiment experiment={experiment} setExperiment={setExperiment} onNext={() => setCurrentStep(AppStep.MAP)} settings={settings} />;
      case AppStep.MAP:
        return <FieldMap experiment={experiment} setExperiment={setExperiment} onNext={() => setCurrentStep(AppStep.COLLECT)} onBack={() => setCurrentStep(AppStep.PLANNING)} />;
      case AppStep.COLLECT:
        return <DataCollection experiment={experiment} setExperiment={setExperiment} onBack={() => setCurrentStep(AppStep.MAP)} onNext={() => setCurrentStep(AppStep.ANALYTICS)} />;
      case AppStep.ANALYTICS:
        return <Analytics experiment={experiment} onBack={() => setCurrentStep(AppStep.COLLECT)} onNext={() => setCurrentStep(AppStep.REPORT)} />;
      case AppStep.REPORT:
        return <ReportGenerator experiment={experiment} setExperiment={setExperiment} settings={settings} />;
      default:
        return <Setup onStart={() => setCurrentStep(AppStep.PLANNING)} />;
    }
  };

  const canCollect = (experiment?.treatments?.length || 0) > 0;
  const canReport = Object.keys(experiment?.evaluations || {}).length > 0;

  return (
    <ErrorBoundary>
      <Layout 
        currentStep={currentStep} 
        onStepChange={setCurrentStep}
        canCollect={canCollect}
        canReport={canReport}
        onExport={handleExport}
        onImport={handleImport}
        onNew={handleNew}
        onSave={handleSave}
        allExperiments={allExperiments}
        onLoadExperiment={handleLoadExperiment}
        onDeleteExperiment={handleDeleteExperiment}
        settings={settings}
        onSettingsChange={setSettings}
        activeId={experiment.id}
        title={experiment?.title || 'FieldLab Pro'}
      >
        <div key={experiment.id} className="animate-in fade-in duration-700">
          {renderStep()}
        </div>
      </Layout>
    </ErrorBoundary>
  );
};

export default App;
