
import React, { useState, useCallback } from 'react';
import { Experiment, Treatment, ExperimentCategory, DesignType, Product, GlobalSettings, COLOR_OPTIONS, ResearchVariable, DataPoint, ApplicationDetails } from '../types';
import { Plus, Trash2, Droplets, Palette, Search, Sparkles, Loader2, X, Check, ArrowDownToLine, Calendar, Wind, Box, ListTodo, Edit2, AlertCircle, Info, Shovel, Droplet, Tag, FileText, Table as TableIcon } from 'lucide-react';
import { suggestExperiment } from '../services/geminiService';

interface Props {
  experiment: Experiment;
  setExperiment: React.Dispatch<React.SetStateAction<Experiment>>;
  onNext: () => void;
  settings: GlobalSettings;
}

const TreatmentCircle: React.FC<{ colors: string[], size?: string }> = ({ colors, size = "w-6 h-6" }) => {
  const c1 = COLOR_OPTIONS.find(c => c.name === colors[0])?.hex || '#ccc';
  const c2 = colors[1] ? COLOR_OPTIONS.find(c => c.name === colors[1])?.hex : c1;
  const background = colors.length > 1 
    ? `linear-gradient(to right, ${c1} 50%, ${c2} 50%)` 
    : c1;
    
  return (
    <div 
      className={`${size} rounded-full border-2 border-black shadow-sm transition-all shrink-0`} 
      style={{ background }}
    />
  );
};

const PlanExperiment: React.FC<Props> = ({ experiment, setExperiment, onNext, settings }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTreatmentForAdd, setActiveTreatmentForAdd] = useState<string | null>(null);
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [newParameterName, setNewParameterName] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [bulkAdjName, setBulkAdjName] = useState('');
  const [bulkAdjConc, setBulkAdjConc] = useState('');

  const handleAiSuggest = async () => {
    if (!aiPrompt.trim()) {
      alert("אנא הזן תיאור לניסוי לפני הפעלת ה-AI.");
      return;
    }
    setIsSuggesting(true);
    setAiError(null);
    try {
      const suggestion = await suggestExperiment(aiPrompt, experiment?.category || ExperimentCategory.WEEDS, settings);
      if (suggestion.error === 'insufficient_info' || (!suggestion.treatments || suggestion.treatments.length === 0)) {
        setAiError("המערכת לא הצליחה לייצר תכנון ניסוי על בסיס התיאור שניתן. ניתן להמשיך בתכנון ידני.");
      } else {
        setExperiment(prev => ({
          ...prev,
          title: aiPrompt.slice(0, 100),
          hypothesis: suggestion.hypothesis,
          treatments: (suggestion.treatments || []).map((t: any) => ({ ...t, fieldLabel: '' })),
          variables: suggestion.variables || [],
          targets: suggestion.targetSpecies || [],
          parameters: suggestion.parameters || []
        }));
        setAiPrompt('');
      }
    } catch (err) {
      setAiError("אירעה שגיאה בתקשורת עם ה-AI.");
    } finally {
      setIsSuggesting(false);
    }
  };

  const addParameter = useCallback(() => {
    if (newParameterName.trim()) {
      const newParam: ResearchVariable = {
        id: crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}`,
        name: newParameterName.trim(),
        unit: '%'
      };
      setExperiment(prev => ({
        ...prev,
        parameters: [...(prev?.parameters || []), newParam]
      }));
      setNewParameterName('');
    }
  }, [newParameterName, setExperiment]);

  const removeParameter = useCallback((id: string) => {
    const hasData = (Object.values(experiment?.evaluations || {}) as DataPoint[][]).some((dayData: DataPoint[]) => 
      dayData.some((dp: DataPoint) => dp.parameterId === id && dp.value !== '' && dp.value !== null)
    );
    if (hasData && !window.confirm('קיים מידע עבור פרמטר זה. למחוק בכל זאת?')) return;
    setExperiment(prev => ({
      ...prev,
      parameters: (prev?.parameters || []).filter(p => p.id !== id)
    }));
  }, [experiment?.evaluations, setExperiment]);

  const addTreatment = useCallback(() => {
    setExperiment(prev => ({
      ...prev,
      treatments: [...(prev?.treatments || []), {
        id: crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}`,
        number: (prev?.treatments?.length || 0) + 1,
        name: `טיפול ${(prev?.treatments?.length || 0) + 1}`,
        fieldLabel: '',
        colors: ['אדום'],
        products: [],
        isControl: false,
        adjuvantName: '',
        adjuvantConcentration: ''
      }]
    }));
  }, [setExperiment]);

  const toggleColor = useCallback((tId: string, colorName: string) => {
    setExperiment(prev => ({
      ...prev,
      treatments: (prev?.treatments || []).map(t => {
        if (t.id !== tId) return t;
        const currentColors = t.colors || [];
        const exists = currentColors.includes(colorName);
        if (!exists && currentColors.length >= 2) {
          return { ...t, colors: [currentColors[0], colorName] };
        }
        return {
          ...t,
          colors: exists ? currentColors.filter(c => c !== colorName) : [...currentColors, colorName]
        };
      })
    }));
  }, [setExperiment]);

  const applyBulkAdjuvant = useCallback(() => {
    if (!bulkAdjName.trim()) {
      alert("אנא הזן שם משטח");
      return;
    }
    setExperiment(prev => ({
      ...prev,
      treatments: (prev?.treatments || []).map(t => ({
        ...t,
        adjuvantName: bulkAdjName,
        adjuvantConcentration: bulkAdjConc
      }))
    }));
    setBulkAdjName('');
    setBulkAdjConc('');
    alert("המשטח הוחל על כל הטיפולים");
  }, [bulkAdjName, bulkAdjConc, setExperiment]);

  const addProductToTreatment = useCallback((tId: string, productName: string) => {
    // Search first in the database
    const productInfo = settings?.pesticideDb?.[productName];
    
    let ais = "";
    let formulation = "-";
    
    // If found in DB, pull the ingredients and formulation
    if (productInfo) {
      const aisArray = [productInfo.ai1, productInfo.ai2, productInfo.ai3].filter(Boolean).map((ai, i) => {
        const amt = [productInfo.amt1, productInfo.amt2, productInfo.amt3][i] || '';
        return `${ai} ${amt}`;
      });
      ais = aisArray.join(', ');
      formulation = productInfo.formulation;
    } else {
      // If not in DB, it's a manual entry
      ais = "הוזן ידנית";
    }

    const newProduct: Product = {
      id: crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}`,
      name: productName,
      activeIngredient: ais,
      formulation: formulation,
      dosage: ''
    };
    
    setExperiment(prev => ({
      ...prev,
      treatments: (prev?.treatments || []).map(t => t.id === tId ? { ...t, products: [...(t.products || []), newProduct] } : t)
    }));
    setSearchTerm('');
    setActiveTreatmentForAdd(null);
  }, [settings?.pesticideDb, setExperiment]);

  const updateHeaderField = useCallback((field: keyof Experiment, value: any) => {
    setExperiment(prev => ({ ...prev, [field]: value }));
  }, [setExperiment]);

  const updateTreatmentField = (tId: string, field: keyof Treatment, value: any) => {
    setExperiment(prev => ({
      ...prev,
      treatments: (prev.treatments || []).map(t => t.id === tId ? { ...t, [field]: value } : t)
    }));
  };

  const updateProductField = (tId: string, pId: string, field: keyof Product, value: any) => {
    setExperiment(prev => ({
      ...prev,
      treatments: (prev.treatments || []).map(t => {
        if (t.id !== tId) return t;
        return {
          ...t,
          products: t.products.map(p => p.id === pId ? { ...p, [field]: value } : p)
        };
      })
    }));
  };

  const addApplicationDate = () => {
    const newDate = new Date().toISOString().split('T')[0];
    updateHeaderField('applicationDates', [...(experiment?.applicationDates || []), newDate]);
  };

  const removeApplicationDate = (index: number) => {
    const newDates = (experiment?.applicationDates || []).filter((_, i) => i !== index);
    updateHeaderField('applicationDates', newDates);
  };

  const updateApplicationDate = (index: number, val: string) => {
    const newDates = [...(experiment?.applicationDates || [])];
    newDates[index] = val;
    updateHeaderField('applicationDates', newDates);
  };

  const dbNames = Object.keys(settings?.pesticideDb || {});

  return (
    <div className="space-y-8 p-4" dir="rtl">
      {/* Experiment Title Header */}
      {experiment?.title && (
        <div className="bg-slate-900 p-8 rounded-[3rem] border-4 border-black shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500 w-full">
          <div className="flex items-center gap-4 mb-2">
            <FileText className="text-teal-400" size={32} />
            <span className="text-teal-400 font-black text-xs uppercase tracking-[0.3em]">ניסוי פעיל</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white leading-tight tracking-tighter">
            {experiment.title}
          </h1>
          <div className="mt-4 flex gap-4 text-slate-400 text-xs font-bold uppercase tracking-widest">
            <span>ID: {experiment.id.substring(0, 8).toUpperCase()}</span>
            <span>•</span>
            <span>DATE: {new Date().toLocaleDateString('he-IL')}</span>
          </div>
        </div>
      )}

      {/* AI SUGGESTION BOX */}
      <section className="bg-gradient-to-br from-teal-50 to-white p-6 rounded-[2.5rem] shadow-sm border-2 border-black">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-teal-600 text-white p-2 rounded-2xl shadow-lg border border-black"><Sparkles size={24} /></div>
          <h2 className="text-xl font-black text-slate-800">תכנון ניסוי חכם (AI)</h2>
        </div>
        <textarea 
          className="w-full bg-white border-2 border-black rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-teal-500 outline-none h-24 shadow-inner mb-4"
          placeholder="תאר את הניסוי המבוקש..."
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
        />
        {aiError && (
          <div className="mb-4 bg-amber-50 border-2 border-black p-4 rounded-2xl flex items-start gap-3">
            <AlertCircle className="text-amber-600 shrink-0" size={20} /><p className="text-xs font-bold text-amber-900">{aiError}</p>
          </div>
        )}
        <button 
          onClick={handleAiSuggest}
          disabled={isSuggesting}
          className="w-full bg-teal-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-teal-700 transition-all shadow-lg disabled:opacity-50 border-2 border-black"
        >
          {isSuggesting ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />} צור תוכנית ניסוי עם AI
        </button>
      </section>

      {/* APPLICATION DATES */}
      <section className="bg-white p-8 rounded-[3rem] shadow-sm border-2 border-black space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-100 text-slate-900 rounded-2xl border border-black"><Calendar size={24} /></div>
          <h3 className="text-lg font-black text-slate-800">מועדי יישום הטיפולים</h3>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">מועדי יישום (T1, T2...)</label>
            <button onClick={addApplicationDate} className="text-teal-600 flex items-center gap-1 font-black text-xs hover:bg-teal-50 px-3 py-1 rounded-xl transition-all border border-black"><Plus size={14} /> הוסף מועד</button>
          </div>
          <div className="flex flex-wrap gap-3">
            {(experiment?.applicationDates || []).map((date, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-slate-100 border-2 border-black p-2 rounded-2xl shadow-sm">
                <span className="text-[10px] font-black text-slate-400">T{idx+1}</span>
                <input type="date" className="bg-transparent font-bold text-xs outline-none" value={date} onChange={e => updateApplicationDate(idx, e.target.value)} />
                <button onClick={() => removeApplicationDate(idx)} className="text-red-400 hover:text-red-600 transition-colors"><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PARAMETERS BOX */}
      <section className="bg-white p-8 rounded-[3rem] shadow-sm border-2 border-black space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl border border-black"><ListTodo size={24} /></div>
          <h3 className="text-lg font-black text-slate-800">פרמטרים לבחינה</h3>
        </div>
        <div className="flex gap-3">
          <input 
            className="flex-1 bg-slate-50 border-2 border-black rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-teal-500 outline-none shadow-inner"
            placeholder="הוסף פרמטר חדש..."
            value={newParameterName}
            onChange={e => setNewParameterName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addParameter()}
          />
          <button onClick={addParameter} className="bg-teal-600 text-white p-4 rounded-2xl shadow-lg border-2 border-black"><Plus size={24}/></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(experiment?.parameters || []).map((p) => (
            <div key={p.id} className="bg-slate-50 p-4 rounded-3xl border-2 border-black flex items-center justify-between group">
              <span className="text-sm font-black text-slate-800 truncate">{p.name}</span>
              <button onClick={() => removeParameter(p.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={16}/></button>
            </div>
          ))}
        </div>
      </section>

      {/* MASTER TREATMENT TABLE */}
      <section className="bg-white p-10 rounded-[4rem] shadow-2xl border-4 border-black space-y-8 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-slate-900 text-white rounded-[2rem] border-2 border-black"><TableIcon size={32} /></div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">פרוטוקול טיפולים (Protocol Table)</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">נהל את כל רכיבי הניסוי בטבלה אחת מרוכזת</p>
            </div>
          </div>
          <div className="flex gap-3">
             <button onClick={addTreatment} className="bg-teal-600 text-white px-8 py-4 rounded-2xl font-black border-2 border-black hover:bg-teal-700 transition-all flex items-center gap-2 shadow-lg">
               <Plus size={20} /> הוסף טיפול חדש
             </button>
          </div>
        </div>

        <div className="overflow-x-auto border-4 border-black rounded-[2.5rem] bg-white shadow-inner">
          <table className="scientific-table w-full text-center border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="p-4 w-12 font-black border-l-2 border-black">#</th>
                <th className="p-4 min-w-[180px] font-black border-l-2 border-black">שם הטיפול</th>
                <th className="p-4 w-20 font-black border-l-2 border-black text-xs">צבע</th>
                <th className="p-4 min-w-[200px] font-black border-l-2 border-black">תכשיר / חומר</th>
                <th className="p-4 min-w-[160px] font-black border-l-2 border-black">מינון</th>
                <th className="p-4 min-w-[200px] font-black border-l-2 border-black">חומר פעיל</th>
                <th className="p-4 min-w-[150px] font-black border-l-2 border-black">משטח (Adjuvant)</th>
                <th className="p-4 w-16 font-black">מחק</th>
              </tr>
            </thead>
            <tbody>
              {(experiment?.treatments || []).map((t, idx) => {
                const productCount = Math.max(t.products.length, 1);
                return (
                  <React.Fragment key={t.id}>
                    {Array.from({ length: productCount }).map((_, pIdx) => {
                      const product = t.products[pIdx];
                      return (
                        <tr key={product?.id || `empty-${pIdx}`} className={`${t.isControl ? 'bg-amber-50/30' : 'hover:bg-slate-50'} transition-colors`}>
                          {pIdx === 0 && (
                            <>
                              <td rowSpan={productCount} className="p-4 font-black border-l-2 border-black bg-slate-50">{t.number}</td>
                              <td rowSpan={productCount} className="p-2 border-l-2 border-black bg-white">
                                <input 
                                  className="w-full p-3 font-black text-sm bg-transparent border-none outline-none focus:ring-2 focus:ring-teal-500 rounded-xl"
                                  value={t.name}
                                  onChange={e => updateTreatmentField(t.id, 'name', e.target.value)}
                                  placeholder="שם הטיפול..."
                                />
                              </td>
                              <td rowSpan={productCount} className="p-2 border-l-2 border-black bg-white">
                                <div className="relative flex justify-center">
                                  <button onClick={() => setActiveColorPicker(activeColorPicker === t.id ? null : t.id)} className="p-1">
                                    <TreatmentCircle colors={t.colors} size="w-10 h-10" />
                                  </button>
                                  {activeColorPicker === t.id && (
                                    <div className="absolute top-12 right-0 z-[100] bg-white shadow-2xl rounded-2xl p-4 border-2 border-black flex flex-wrap gap-2 w-48">
                                      {COLOR_OPTIONS.map(co => (
                                        <button key={co.name} onClick={() => toggleColor(t.id, co.name)} className={`w-8 h-8 rounded-lg border-2 border-black ${t.colors.includes(co.name) ? 'ring-2 ring-teal-500 scale-110' : 'border-transparent'}`} style={{ backgroundColor: co.hex }}>
                                          {t.colors.includes(co.name) && <Check size={14} className={co.name === 'לבן' || co.name === 'צהוב' ? 'text-black' : 'text-white'} />}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                          
                          <td className="p-2 border-l-2 border-black">
                            {product ? (
                              <div className="flex items-center gap-2 group">
                                <div className="flex-1 font-bold text-sm text-slate-900 text-right pr-2">{product.name}</div>
                                <button onClick={() => updateTreatmentField(t.id, 'products', t.products.filter(pr => pr.id !== product.id))} className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                              </div>
                            ) : (
                              <div className="relative">
                                <button 
                                  onClick={() => setActiveTreatmentForAdd(t.id)}
                                  className="w-full py-2 px-3 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 hover:border-teal-500 hover:text-teal-600 transition-all"
                                >
                                  + הוסף תכשיר
                                </button>
                                {activeTreatmentForAdd === t.id && (
                                  <div className="absolute top-10 right-0 w-64 z-[110] bg-white shadow-2xl rounded-2xl border-2 border-black p-4 animate-in fade-in zoom-in-95 duration-200">
                                    <div className="flex items-center gap-2 mb-3 bg-slate-50 p-2 rounded-xl border border-black/10">
                                      <Search size={14} className="text-slate-400" />
                                      <input autoFocus className="bg-transparent border-none outline-none text-xs font-bold w-full" placeholder="חפש..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                      <button onClick={() => setActiveTreatmentForAdd(null)} className="text-slate-300 hover:text-slate-900"><X size={14}/></button>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                      {/* Manual Add Option - ALWAYS VISIBLE if there is search text */}
                                      {searchTerm.trim().length > 0 && (
                                        <div 
                                          className="p-2 mb-2 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg cursor-pointer font-black text-[10px] border border-teal-200 transition-colors flex items-center gap-2"
                                          onClick={() => addProductToTreatment(t.id, searchTerm)}
                                        >
                                          <Plus size={12} /> הוסף כטקסט חופשי: "{searchTerm}"
                                        </div>
                                      )}
                                      
                                      {/* DB Results */}
                                      {dbNames.filter(name => name.toLowerCase().includes(searchTerm.toLowerCase())).map(name => (
                                        <div key={name} className="p-2 hover:bg-teal-50 rounded-lg cursor-pointer font-bold text-xs border border-transparent hover:border-teal-200 transition-colors" onClick={() => addProductToTreatment(t.id, name)}>
                                          {name}
                                        </div>
                                      ))}
                                      
                                      {dbNames.filter(name => name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && searchTerm.trim().length === 0 && (
                                        <p className="text-[10px] text-slate-400 italic text-center p-2">הקלד לחיפוש או להוספה ידנית</p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-1 border-l-2 border-black min-w-[160px]">
                            {product && (
                              <input 
                                className="w-full p-2 bg-transparent border-none outline-none text-center font-bold text-xs focus:bg-teal-50 rounded-lg transition-colors"
                                value={product.dosage}
                                onChange={e => updateProductField(t.id, product.id, 'dosage', e.target.value)}
                                placeholder="למשל: 30 סמ''ק"
                              />
                            )}
                          </td>
                          <td className="p-1 border-l-2 border-black">
                            {product && (
                              <textarea 
                                className="w-full p-2 bg-transparent border-none outline-none text-right font-medium text-[10px] focus:bg-teal-50 rounded-lg transition-colors h-12 scrollbar-hide"
                                value={product.activeIngredient}
                                onChange={e => updateProductField(t.id, product.id, 'activeIngredient', e.target.value)}
                                placeholder="פירוט חומרים פעילים..."
                              />
                            )}
                          </td>

                          {pIdx === 0 && (
                            <>
                              <td rowSpan={productCount} className="p-2 border-l-2 border-black bg-white">
                                <div className="space-y-1">
                                  <input 
                                    className="w-full p-1 bg-transparent border-none outline-none text-center font-bold text-[10px] focus:bg-slate-50 border-b border-dashed border-slate-200"
                                    value={t.adjuvantName || ''}
                                    onChange={e => updateTreatmentField(t.id, 'adjuvantName', e.target.value)}
                                    placeholder="שם משטח..."
                                  />
                                  <input 
                                    className="w-full p-1 bg-transparent border-none outline-none text-center font-bold text-[10px] text-teal-600 focus:bg-slate-50"
                                    value={t.adjuvantConcentration || ''}
                                    onChange={e => updateTreatmentField(t.id, 'adjuvantConcentration', e.target.value)}
                                    placeholder="ריכוז %"
                                  />
                                </div>
                              </td>
                              <td rowSpan={productCount} className="p-2 bg-white">
                                <button 
                                  onClick={() => setExperiment(prev => ({ ...prev, treatments: (prev?.treatments || []).filter(tr => tr.id !== t.id)}))}
                                  className="p-3 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                >
                                  <Trash2 size={20} />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {(experiment?.treatments || []).length === 0 && (
                <tr>
                  <td colSpan={8} className="p-20 text-center font-bold text-slate-300 italic border-t-2 border-black">
                    טרם נוספו טיפולים לניסוי. ניתן להשתמש ב-AI או להוסיף ידנית.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* BULK ADJUANT SHORTCUT */}
        <div className="bg-amber-50/50 p-8 rounded-[3rem] border-2 border-black flex flex-wrap items-center justify-between gap-6 shadow-sm no-print">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500 text-white rounded-2xl border-2 border-black"><Droplet size={24} /></div>
            <div>
              <h4 className="font-black text-amber-900 text-sm">החלת משטח גורף</h4>
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">עדכן את כל הטיפולים בלחיצה אחת</p>
            </div>
          </div>
          <div className="flex flex-1 max-w-xl gap-4 items-center">
            <input className="flex-1 bg-white border-2 border-black rounded-2xl p-4 text-xs font-black outline-none shadow-sm focus:ring-2 focus:ring-amber-500 transition-all" placeholder="שם המשטח..." value={bulkAdjName} onChange={e => setBulkAdjName(e.target.value)} />
            <input className="w-24 bg-white border-2 border-black rounded-2xl p-4 text-xs font-black outline-none shadow-sm focus:ring-2 focus:ring-amber-500 transition-all" placeholder="ריכוז %" value={bulkAdjConc} onChange={e => setBulkAdjConc(e.target.value)} />
            <button onClick={applyBulkAdjuvant} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black border-2 border-black hover:bg-black shadow-lg transition-all active:scale-95">החל על הכל</button>
          </div>
        </div>
      </section>

      {/* FINAL NEXT BUTTON */}
      <button onClick={onNext} className="w-full bg-slate-900 text-white py-8 rounded-[3rem] font-black text-2xl shadow-2xl mt-8 border-2 border-black hover:bg-black transition-all flex items-center justify-center gap-4 active:scale-95">
        שמור את התכנון והמשך למיפוי <ArrowDownToLine size={28} />
      </button>
    </div>
  );
};

export default PlanExperiment;
