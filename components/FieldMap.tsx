
import React, { useState, useEffect, useCallback } from 'react';
import { Experiment, COLOR_OPTIONS, DesignType, FieldBlock, Treatment } from '../types';
import { Shuffle, Printer, Eye, EyeOff, Map as MapIcon, ChevronLeft, ChevronRight, RotateCcw, RotateCw, Info } from 'lucide-react';

interface Props {
  experiment: Experiment;
  setExperiment: React.Dispatch<React.SetStateAction<Experiment>>;
  onNext: () => void;
  onBack: () => void;
}

interface Selection {
  blockIdx: number;
  treatmentIdx: number;
}

const TreatmentCircle: React.FC<{ colors: string[], size?: string }> = ({ colors, size = "w-10 h-10" }) => {
  const c1 = COLOR_OPTIONS.find(c => c.name === colors?.[0])?.hex || '#ccc';
  const c2 = colors?.[1] ? COLOR_OPTIONS.find(c => c.name === colors[1])?.hex : c1;
  const background = colors?.length > 1 
    ? `linear-gradient(to right, ${c1} 50%, ${c2} 50%)` 
    : c1;
    
  return (
    <div 
      className={`${size} rounded-full border-2 border-black shadow-sm transition-all shrink-0`} 
      style={{ background }}
    />
  );
};

const FieldMap: React.FC<Props> = ({ experiment, setExperiment, onNext, onBack }) => {
  const [isBlinded, setIsBlinded] = useState(true);
  const [isHorizontal, setIsHorizontal] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);

  const generateMap = useCallback(() => {
    setExperiment(prev => {
      const treatmentIds = (prev?.treatments || []).map(t => t.id);
      if (treatmentIds.length === 0) return prev;
      
      const shuffle = <T,>(arr: T[]) => {
        const a = [...arr];
        for(let i=a.length-1; i>0; i--){
          const j = Math.floor(Math.random()*(i+1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };

      const newLayout: FieldBlock[] = [];
      if (prev?.designType === DesignType.RCBD) {
        for (let r = 0; r < 4; r++) {
          newLayout.push({ rep: r + 1, treatmentIds: shuffle(treatmentIds) });
        }
      } else {
        const allPlots: string[] = [];
        for (let i = 0; i < 4; i++) allPlots.push(...treatmentIds);
        const globalShuffle = shuffle(allPlots);
        for (let r = 0; r < 4; r++) {
          newLayout.push({ rep: r + 1, treatmentIds: globalShuffle.slice(r * treatmentIds.length, (r + 1) * treatmentIds.length) });
        }
      }
      return { ...prev, fieldMap: newLayout };
    });
  }, [setExperiment]);

  useEffect(() => {
    if (!experiment?.fieldMap && (experiment?.treatments?.length || 0) > 0) generateMap();
  }, [experiment?.fieldMap, experiment?.treatments?.length, generateMap]);

  const handleCellClick = useCallback((blockIdx: number, treatmentIdx: number) => {
    setSelection(prevSelection => {
      if (!prevSelection) {
        return { blockIdx, treatmentIdx };
      }
      
      const s = prevSelection;
      if (s.blockIdx === blockIdx && s.treatmentIdx === treatmentIdx) return null;

      setExperiment(prevExp => {
        if (!prevExp?.fieldMap) return prevExp;
        
        const newFieldMap = prevExp.fieldMap.map(block => ({
          ...block,
          treatmentIds: [...(block?.treatmentIds || [])]
        }));

        const sourceVal = newFieldMap[s.blockIdx].treatmentIds[s.treatmentIdx];
        const targetVal = newFieldMap[blockIdx].treatmentIds[treatmentIdx];
        
        newFieldMap[s.blockIdx].treatmentIds[s.treatmentIdx] = targetVal;
        newFieldMap[blockIdx].treatmentIds[treatmentIdx] = sourceVal;

        return { 
          ...prevExp, 
          fieldMap: newFieldMap 
        };
      });
      
      return null;
    });
  }, [setExperiment]);

  if (!experiment?.treatments || experiment.treatments.length === 0) return <div className="p-12 text-center font-black text-slate-400 italic">טרם הוגדרו טיפולים. חזור לטאב התכנון.</div>;

  return (
    <div className="space-y-8 pb-32" dir="rtl">
      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border-2 border-black flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl border-2 border-black"><MapIcon size={24} /></div>
          <div><h2 className="text-xl font-black">מפת ניסוי שדה</h2><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{experiment?.designType}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsHorizontal(!isHorizontal)} className="p-3 border-2 border-black rounded-2xl bg-white hover:bg-slate-50 transition-colors">{isHorizontal ? <RotateCw size={18} /> : <RotateCcw size={18} />}</button>
          <button onClick={() => setIsBlinded(!isBlinded)} className={`px-6 py-2 rounded-2xl border-2 border-black font-black transition-all ${isBlinded ? 'bg-amber-50 text-amber-600' : 'bg-slate-800 text-white'}`}>{isBlinded ? 'תצוגה גלויה' : 'תצוגה סמויה'}</button>
          <button onClick={generateMap} className="p-3 bg-slate-100 border-2 border-black rounded-2xl hover:bg-slate-200 transition-colors" title="ערבב מפה"><Shuffle size={18} /></button>
          <button onClick={() => window.print()} className="p-3 bg-slate-900 text-white border-2 border-black rounded-2xl hover:bg-black transition-colors"><Printer size={18} /></button>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[3rem] shadow-xl border-2 border-black overflow-x-auto min-h-[400px]">
        <div className={`flex gap-6 ${isHorizontal ? 'flex-col min-w-full' : 'min-w-[700px] flex-row'}`}>
          {(experiment?.fieldMap || []).map((block, bIdx) => (
            <div key={block.rep} className={`flex-1 space-y-4 ${isHorizontal ? 'flex items-center gap-4' : ''}`}>
              <div className={`bg-slate-900 text-white p-3 rounded-2xl text-center font-black text-xs border-2 border-black ${isHorizontal ? 'w-24 shrink-0' : ''}`}>בלוק {block.rep}</div>
              <div className={`flex gap-3 ${isHorizontal ? 'flex-row' : 'flex-col'}`}>
                {(block?.treatmentIds || []).map((tId, tIdx) => {
                  const treatment = (experiment?.treatments || []).find(t => t.id === tId);
                  const isSelected = selection?.blockIdx === bIdx && selection?.treatmentIdx === tIdx;
                  return (
                    <div 
                      key={tIdx} 
                      onClick={() => handleCellClick(bIdx, tIdx)} 
                      className={`bg-slate-50 border-2 p-4 rounded-3xl flex flex-col items-center gap-2 cursor-pointer transition-all ${isSelected ? 'border-teal-500 ring-4 ring-teal-500 bg-teal-50 scale-105 z-10' : 'border-black hover:bg-slate-100'}`}
                    >
                      <TreatmentCircle colors={treatment?.colors || []} size="w-16 h-16" />
                      <span className="text-[10px] font-black uppercase">T-{treatment?.number || '?'}</span>
                      {!isBlinded && <p className="text-[10px] font-black truncate max-w-[100px] text-slate-900">{treatment?.name}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 p-6 rounded-[2rem] border-2 border-black flex items-start gap-4 shadow-sm no-print">
         <Info className="text-amber-600 shrink-0 mt-1" size={24} />
         <div>
            <h4 className="font-black text-amber-900 text-sm">סידור חלקות הניסוי</h4>
            <p className="text-xs text-amber-800 leading-relaxed font-bold mt-1">
              ניתן להחליף בין מיקומי חלקות על ידי לחיצה על החלקה הראשונה ולאחריה על החלקה השנייה. השינוי יתעדכן באופן מיידי בכל חלקי המערכת.
            </p>
         </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t z-50 flex items-center justify-between shadow-2xl no-print">
        <button onClick={onBack} className="bg-slate-100 px-8 py-4 rounded-3xl font-black border-2 border-black hover:bg-slate-200 transition-all">חזור לתכנון</button>
        <button onClick={onNext} className="bg-teal-600 text-white px-10 py-4 rounded-3xl font-black border-2 border-black shadow-xl hover:bg-teal-700 transition-all">המשך לאיסוף נתונים</button>
      </div>
    </div>
  );
};

export default FieldMap;
