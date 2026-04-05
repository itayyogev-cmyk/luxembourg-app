
import React, { useState, useRef, useEffect } from 'react';
import { AppStep, GlobalSettings, PesticideDatabaseEntry, Experiment } from '../types';
import { ClipboardList, PenTool, FileBarChart, Download, Upload, Plus, Settings, X, Database, BrainCircuit, Image as ImageIcon, Loader2, Trash2, Search, CheckCircle, Sparkles, Map as MapIcon, BarChart3, History, ChevronLeft, ChevronRight, FileText, Calendar, Clock, Save } from 'lucide-react';
import { analyzeReportStyle } from '../services/geminiService';
import { updatePesticideDB, PESTICIDE_DB } from '../pesticideData';

interface LayoutProps {
  currentStep: AppStep;
  onStepChange: (step: AppStep) => void;
  title: string;
  canCollect: boolean;
  canReport: boolean;
  children: React.ReactNode;
  onExport: () => void;
  onImport: (file: File) => void;
  onNew: () => void;
  onSave: () => void;
  allExperiments: Record<string, Experiment>;
  onLoadExperiment: (id: string) => void;
  onDeleteExperiment: (id: string) => void;
  settings: GlobalSettings;
  onSettingsChange: (settings: GlobalSettings) => void;
  activeId: string;
}

const Layout: React.FC<LayoutProps> = ({ 
  currentStep, 
  onStepChange, 
  canCollect, 
  canReport, 
  children,
  onExport,
  onImport,
  onNew,
  onSave,
  allExperiments,
  onLoadExperiment,
  onDeleteExperiment,
  settings,
  onSettingsChange,
  activeId,
  title
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [activeTab, setActiveTab] = useState<'pesticides' | 'style'>('pesticides');
  const [styleSampleText, setStyleSampleText] = useState('');
  const [styleImages, setStyleImages] = useState<{data: string, mimeType: string, preview: string}[]>([]);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saveIndicator, setSaveIndicator] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleImageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSaveIndicator(true);
    const timer = setTimeout(() => setSaveIndicator(false), 2000);
    return () => clearTimeout(timer);
  }, [children]);

  const pesticideEntries = Object.values(settings.pesticideDb || {}) as PesticideDatabaseEntry[];
  const pesticideCount = pesticideEntries.length;
  
  const filteredPesticides = pesticideEntries.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.ai1 || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.ai2 || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.ai3 || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedExperiments = (Object.values(allExperiments) as Experiment[]).sort((a, b) => {
    return (a.title || '').localeCompare(b.title || '');
  });

  const handleBulkPaste = () => {
    if (!pasteValue.trim()) return;
    
    const count = updatePesticideDB(pasteValue);
    
    if (count > 0) {
      onSettingsChange({ ...settings, pesticideDb: { ...PESTICIDE_DB } });
      setPasteValue('');
      alert(`עודכנו ${count} תכשירים במאגר בהצלחה`);
    } else {
      alert("לא נמצאו נתונים תקינים לעדכון. וודא שהדבקת טקסט מופרד בטאבים.");
    }
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      const newImages = await Promise.all(files.map(async (file) => {
        const base64WithHeader = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        return {
          data: base64WithHeader.split(',')[1],
          mimeType: file.type,
          preview: base64WithHeader
        };
      }));
      setStyleImages(prev => [...prev, ...newImages]);
    }
    e.target.value = '';
  };

  const handleStyleLearn = async () => {
    if (styleImages.length === 0 && !styleSampleText) {
      alert("נא להעלות לפחות תמונה אחת או להדביק טקסט של דו\"ח לדוגמה");
      return;
    }
    setIsAnalyzingStyle(true);
    try {
      const styleDescription = await analyzeReportStyle(
        styleSampleText, 
        styleImages.map(img => ({ data: img.data, mimeType: img.mimeType }))
      );
      onSettingsChange({ ...settings, reportStyleDescription: styleDescription });
      alert("המערכת למדה את הסגנון החדש בהצלחה!");
      setStyleSampleText('');
      setStyleImages([]);
    } catch (err) {
      alert("שגיאה בניתוח הסגנון");
    } finally {
      setIsAnalyzingStyle(false);
    }
  };

  const navItemClass = (step: AppStep, disabled = false) => 
    `flex flex-col items-center p-3 flex-1 transition-all border-b-4 ${
      currentStep === step 
        ? 'border-teal-600 text-teal-800 bg-teal-50/50' 
        : disabled ? 'border-transparent text-gray-200 cursor-not-allowed opacity-30' : 'border-transparent text-gray-400 hover:text-teal-600'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-assistant">
      <style>{`
        @media print {
          html, body, #root, main, .animate-in {
            height: auto !important;
            overflow: visible !important;
            position: static !important;
            display: block !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-[60] no-print">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowHistory(true)}
              className="p-2 text-slate-400 hover:text-teal-600 transition-colors"
              title="ארכיון ניסויים"
            >
              <History size={24} />
            </button>
            <button 
              onClick={() => onStepChange(AppStep.SETUP)}
              className="font-black text-2xl text-teal-700 tracking-tighter flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="bg-teal-700 text-white w-8 h-8 rounded-xl flex items-center justify-center text-sm">FL</div>
              <span className="hidden sm:inline">FieldLab</span>
            </button>
            {saveIndicator && (
              <div className="flex items-center gap-1.5 text-teal-600 text-[10px] font-black uppercase tracking-widest bg-teal-50 px-2 py-1 rounded-full animate-in fade-in duration-500">
                <CheckCircle size={10} />
                נשמר
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
            <button onClick={() => setShowSettings(true)} className="p-2.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all" title="הגדרות"><Settings size={20} /></button>
            <button type="button" onClick={() => onNew()} className="p-2.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all" title="ניסוי חדש"><Plus size={20} /></button>
            <button onClick={onSave} className="p-2.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all" title="שמור לארכיון"><Save size={20} /></button>
            <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all" title="טען ניסוי מבין"><Upload size={20} /></button>
            <button onClick={onExport} className="p-2.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all" title="ייצוא JSON"><Download size={20} /></button>
          </div>
        </div>
        
        <div className="max-w-[1600px] mx-auto flex border-t border-slate-100 overflow-x-auto scrollbar-hide">
          <button onClick={() => onStepChange(AppStep.PLANNING)} className={navItemClass(AppStep.PLANNING)}>
            <PenTool size={20} className="mb-1" />
            <span className="text-[10px] font-black uppercase tracking-widest">תכנון</span>
          </button>
          <button onClick={() => onStepChange(AppStep.MAP)} className={navItemClass(AppStep.MAP, !canCollect)} disabled={!canCollect}>
            <MapIcon size={20} className="mb-1" />
            <span className="text-[10px] font-black uppercase tracking-widest">מפה</span>
          </button>
          <button onClick={() => onStepChange(AppStep.COLLECT)} className={navItemClass(AppStep.COLLECT, !canCollect)} disabled={!canCollect}>
            <ClipboardList size={20} className="mb-1" />
            <span className="text-[10px] font-black uppercase tracking-widest">איסוף</span>
          </button>
          <button onClick={() => onStepChange(AppStep.ANALYTICS)} className={navItemClass(AppStep.ANALYTICS, !canReport)} disabled={!canReport}>
            <BarChart3 size={20} className="mb-1" />
            <span className="text-[10px] font-black uppercase tracking-widest">ניתוח</span>
          </button>
          <button onClick={() => onStepChange(AppStep.REPORT)} className={navItemClass(AppStep.REPORT, !canReport)} disabled={!canReport}>
            <FileBarChart size={20} className="mb-1" />
            <span className="text-[10px] font-black uppercase tracking-widest">דו"ח</span>
          </button>
        </div>
      </header>

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowHistory(false)} />
          <div className="relative w-80 bg-white shadow-2xl h-full animate-in slide-in-from-right-full duration-300 flex flex-col border-r-4 border-black">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <History size={24} className="text-teal-400" />
                <h2 className="text-xl font-black">ארכיון ניסויים</h2>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {sortedExperiments.length > 0 ? (
                sortedExperiments.map((exp) => (
                  <div 
                    key={exp.id}
                    className={`group relative p-4 rounded-2xl border-2 transition-all cursor-pointer ${exp.id === activeId ? 'border-teal-600 bg-teal-50' : 'border-slate-100 hover:border-black bg-slate-50'}`}
                    onClick={() => {
                      onLoadExperiment(exp.id);
                      setShowHistory(false);
                    }}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-black text-slate-900 text-sm line-clamp-1">{exp.title || 'ניסוי ללא שם'}</h3>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteExperiment(exp.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <span className="flex items-center gap-1"><FileText size={10} /> {exp.treatments?.length || 0} T</span>
                      <span className="flex items-center gap-1"><Clock size={10} /> ID: {exp.id.substring(0, 5)}</span>
                    </div>
                    {exp.id === activeId && (
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-teal-600 text-white px-2 py-0.5 rounded-full text-[8px] font-black uppercase">
                        <CheckCircle size={8} /> פעיל
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12 px-6">
                  <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <History size={32} />
                  </div>
                  <p className="text-slate-400 font-bold text-sm italic">אין ניסויים שמורים עדיין</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t-2 border-slate-100">
              <button 
                type="button"
                onClick={() => {
                  setShowHistory(false);
                  onNew();
                }}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 border-2 border-black"
              >
                <Plus size={20} /> התחל ניסוי חדש
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-teal-500 rounded-2xl"><Settings size={24} /></div>
                <div>
                  <h2 className="text-2xl font-black">הגדרות מתקדמות</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ניהול מאגרים ובינה מלאכותית</p>
                </div>
              </div>
              <button onClick={() => setShowSettings(false)} className="bg-white/10 hover:bg-white/20 p-3 rounded-full transition-colors"><X size={20}/></button>
            </div>
            
            <div className="flex border-b border-slate-100">
              <button onClick={() => setActiveTab('pesticides')} className={`flex-1 p-5 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'pesticides' ? 'text-teal-700 bg-teal-50/50 border-b-2 border-teal-700' : 'text-slate-400'}`}>
                מאגר תכשירים {pesticideCount > 0 && <span className="bg-teal-700 text-white px-2 py-0.5 rounded-full text-[8px]">{pesticideCount}</span>}
              </button>
              <button onClick={() => setActiveTab('style')} className={`flex-1 p-5 font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'style' ? 'text-teal-700 bg-teal-50/50 border-b-2 border-teal-700' : 'text-slate-400'}`}>למידת סגנון דוח</button>
            </div>

            <div className="p-8 max-h-[60vh] overflow-y-auto">
              {activeTab === 'pesticides' ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="bg-amber-50 p-5 rounded-[2rem] border border-amber-100">
                        <p className="text-xs text-amber-900 font-bold leading-relaxed">הדבק כאן טבלה מאקסל (עמודות: שם, פורמולציה, חומר פעיל 1, ריכוז, חומר פעיל 2...)</p>
                      </div>
                      <textarea value={pasteValue} onChange={(e) => setPasteValue(e.target.value)} placeholder="הדבק כאן..." className="w-full h-48 bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none transition-all shadow-inner" />
                      <div className="flex gap-3">
                        <button onClick={handleBulkPaste} className="flex-1 bg-teal-700 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-teal-800 transition-all">עדכן מאגר</button>
                        <button onClick={() => {
                          if (window.confirm('האם אתה בטוח שברצונך למחוק את כל מאגר התכשירים?')) {
                            localStorage.removeItem('pesticide_db');
                            onSettingsChange({ ...settings, pesticideDb: {} });
                          }
                        }} className="p-4 text-red-400 hover:bg-red-50 rounded-2xl transition-colors" title="מחק הכל"><Trash2 size={24}/></button>
                      </div>
                    </div>
                    <div className="space-y-4 flex flex-col">
                      <div className="flex items-center justify-between">
                         <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">סקירת מאגר נוכחי</h3>
                         <div className="relative group"><Search size={14} className="absolute left-3 top-2.5 text-slate-300 group-focus-within:text-teal-500 transition-colors" /><input type="text" placeholder="חפש..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-all" /></div>
                      </div>
                      <div className="flex-1 min-h-[300px] border border-slate-100 rounded-[2rem] bg-slate-50 overflow-hidden shadow-inner">
                        <table className="w-full text-right text-[10px] border-collapse">
                          <thead className="sticky top-0 bg-slate-100 font-black text-slate-400 uppercase"><tr><th className="p-3">שם התכשיר</th><th className="p-3">חומרים פעילים</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredPesticides.length > 0 ? filteredPesticides.map((p, i) => {
                              const ais = [p.ai1, p.ai2, p.ai3].filter(Boolean).join(', ');
                              return (
                                <tr key={i} className="hover:bg-white transition-colors">
                                  <td className="p-3 font-black text-slate-800">{p.name}</td>
                                  <td className="p-3 font-bold text-teal-600">{ais}</td>
                                </tr>
                              );
                            }) : <tr><td colSpan={2} className="p-12 text-center text-slate-300 font-bold italic">המאגר ריק</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="bg-teal-50 p-6 rounded-[2rem] border border-teal-100 flex items-center gap-4">
                    <div className="p-3 bg-white rounded-2xl text-teal-600 shadow-sm"><BrainCircuit /></div>
                    <p className="text-xs text-teal-900 font-bold leading-relaxed">המערכת תנתח את הסגנון שלכם כדי לייצר דוחות עתידיים שנראים בדיוק כמו שאתם רגילים.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <button onClick={() => styleImageRef.current?.click()} className="w-full aspect-video flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[2rem] hover:bg-slate-50 transition-all group">
                        <div className="p-4 bg-slate-100 rounded-full group-hover:bg-teal-100 group-hover:text-teal-600 transition-all mb-3 text-slate-400"><ImageIcon size={32} /></div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">גרור תמונות של דוחות</span>
                        <input type="file" ref={styleImageRef} className="hidden" accept="image/*" multiple onChange={handleAddImage} />
                      </button>
                      <div className="flex flex-wrap gap-2">{styleImages.map((img, idx) => (<div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden shadow-md border-2 border-white"><img src={img.preview} className="w-full h-full object-cover" alt="" /></div>))}</div>
                    </div>
                    <div className="space-y-4">
                      <textarea value={styleSampleText} onChange={(e) => setStyleSampleText(e.target.value)} placeholder="הדבק כאן טקסט מדוח קודם..." className="w-full h-40 bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 text-xs font-medium focus:ring-2 focus:ring-teal-500 transition-all outline-none" />
                      <button onClick={handleStyleLearn} disabled={isAnalyzingStyle} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl flex items-center justify-center gap-3 hover:bg-black transition-all disabled:opacity-50">
                        {isAnalyzingStyle ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />} נתח ולמד סגנון חדש
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">{children}</main>
    </div>
  );
};

export default Layout;
