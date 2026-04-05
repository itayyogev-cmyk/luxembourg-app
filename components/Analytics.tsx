
import React, { useState, useMemo, useEffect } from 'react';
import { Experiment, COLOR_OPTIONS, Treatment, DataPoint } from '../types';
import { BarChart3, ChevronRight, FileBarChart, Filter, TableProperties, BarChart, Download } from 'lucide-react';

// --- SHARED STATISTICAL ENGINE ---
const Q_TABLE_05: Record<number, number[]> = {
  2: [2.77, 3.31, 3.63, 3.86, 4.03, 4.17, 4.29, 4.39],
  5: [2.57, 3.03, 3.29, 3.48, 3.61, 3.73, 3.82, 3.90],
  10: [2.48, 2.91, 3.14, 3.30, 3.41, 3.50, 3.58, 3.64],
  20: [2.42, 2.83, 3.05, 3.18, 3.29, 3.37, 3.43, 3.49],
  60: [2.39, 2.78, 2.98, 3.11, 3.21, 3.28, 3.33, 3.38],
  120: [2.37, 2.75, 2.95, 3.07, 3.16, 3.23, 3.28, 3.32]
};

const getQValue = (k: number, df: number): number => {
  const keys = Object.keys(Q_TABLE_05).map(Number).sort((a, b) => a - b);
  let bestKey = keys[0];
  for (const kVal of keys) if (df >= kVal) bestKey = kVal;
  const row = Q_TABLE_05[bestKey];
  const col = Math.min(Math.max(k - 2, 0), row.length - 1);
  return row[col];
};

interface StatisticalResult {
  mean: number;
  letter: string;
  se: number;
  n: number;
}

function calculateTukey(treatments: Treatment[], dataPoints: DataPoint[]): Record<string, StatisticalResult> {
  const results: Record<string, StatisticalResult> = {};
  const stats = treatments.map(t => {
    const tData = dataPoints.filter(d => d.treatmentId === t.id);
    const repGroups: Record<number, number[]> = {};
    tData.forEach(d => {
      const val = typeof d.value === 'string' ? parseFloat(d.value) : Number(d.value);
      if (!isNaN(val)) {
        if (!repGroups[d.rep]) repGroups[d.rep] = [];
        repGroups[d.rep].push(val);
      }
    });
    const repMeans = Object.values(repGroups).map(samples => samples.reduce((a, b) => a + b, 0) / samples.length);
    const n = repMeans.length;
    const mean = n > 0 ? repMeans.reduce((a, b) => a + b, 0) / n : 0;
    let sd = 0;
    if (n > 1) {
      const sumSqLocal = repMeans.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
      sd = Math.sqrt(sumSqLocal / (n - 1));
    }
    const se = n > 0 ? sd / Math.sqrt(n) : 0;
    const totalSumSq = repMeans.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
    return { id: t.id, mean, n, se, sumSq: totalSumSq };
  }).filter(s => s.n > 0);

  stats.forEach(s => { results[s.id] = { mean: s.mean, letter: '', se: s.se, n: s.n }; });
  if (stats.length < 2) return results;

  try {
    const totalN = stats.reduce((acc, s) => acc + s.n, 0);
    const dfErr = totalN - stats.length;
    if (dfErr <= 0) {
      stats.forEach(s => { results[s.id].letter = 'a'; });
      return results;
    }
    const totalSumSq = stats.reduce((acc, s) => acc + s.sumSq, 0);
    const MSE = totalSumSq / dfErr;
    const q = getQValue(stats.length, dfErr);
    const sorted = [...stats].sort((a, b) => b.mean - a.mean);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const lettersMap: Record<string, string[]> = {};
    sorted.forEach(s => lettersMap[s.id] = []);
    let letterIndex = 0;
    const groups: number[][] = []; 
    for (let i = 0; i < sorted.length; i++) {
      let group = [i];
      for (let j = i + 1; j < sorted.length; j++) {
        const HSD = (q / Math.sqrt(2)) * Math.sqrt(MSE * (1 / sorted[i].n + 1 / sorted[j].n));
        if (Math.abs(sorted[i].mean - sorted[j].mean) <= HSD) group.push(j);
      }
      const isRedundant = groups.some(prevGroup => group.every(idx => prevGroup.includes(idx)));
      if (!isRedundant && group.length > 0) {
        groups.push(group);
        const letter = alphabet[letterIndex % alphabet.length];
        group.forEach(idx => { lettersMap[sorted[idx].id].push(letter); });
        letterIndex++;
      }
    }
    stats.forEach(s => {
      const sortedLetters = lettersMap[s.id].sort().join('');
      results[s.id].letter = (groups.length === 1 && groups[0].length === sorted.length) ? 'a' : (sortedLetters || 'a');
    });
  } catch (err) { 
    console.error("Tukey Error:", err); 
    stats.forEach(s => { results[s.id].letter = 'a'; });
  }
  return results;
}

interface Props {
  experiment: Experiment;
  onBack: () => void;
  onNext: () => void;
}

const formatDate = (isoString: string) => {
  if (!isoString) return '';
  const [year, month, day] = isoString.split('-');
  return `${day}/${month}/${year}`;
};

const Analytics: React.FC<Props> = ({ experiment, onBack, onNext }) => {
  const [viewType, setViewType] = useState<'bar' | 'table'>('bar');
  const [selectedParamId, setSelectedParamId] = useState<string>('');
  const [visibleTreatmentIds, setVisibleTreatmentIds] = useState<string[]>([]);
  
  const allDates = useMemo(() => 
    Object.keys(experiment?.evaluations || {}).sort((a, b) => new Date(a).getTime() - new Date(b).getTime()), 
    [experiment?.evaluations]
  );

  const appDatesSorted = useMemo(() => 
    [...(experiment?.applicationDates || [])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
  , [experiment?.applicationDates]);

  const getDAA = (evalDate: string) => {
    if (!appDatesSorted.length || !evalDate) return null;
    const evalTime = new Date(evalDate).getTime();
    const relevantApps = appDatesSorted.filter(d => new Date(d).getTime() <= evalTime);
    if (relevantApps.length === 0) return 'Pre-trial';
    const latestAppDate = relevantApps[relevantApps.length - 1];
    const diffDays = Math.ceil((evalTime - new Date(latestAppDate).getTime()) / (1000 * 60 * 60 * 24));
    return `${diffDays} DAA`;
  };

  useEffect(() => {
    if ((experiment?.parameters || []).length > 0 && !selectedParamId) {
      setSelectedParamId(experiment.parameters[0].id);
    }
  }, [experiment?.parameters, selectedParamId]);

  useEffect(() => {
    if ((experiment?.treatments || []).length > 0 && visibleTreatmentIds.length === 0) {
      setVisibleTreatmentIds(experiment.treatments.map(t => t.id));
    }
  }, [experiment?.treatments]);

  const statsByDate = useMemo(() => {
    const map: Record<string, Record<string, StatisticalResult>> = {};
    allDates.forEach(date => {
      const dayDataSlice = experiment.evaluations[date].filter(d => d.parameterId === selectedParamId);
      map[date] = calculateTukey(experiment.treatments, dayDataSlice);
    });
    return map;
  }, [experiment.evaluations, experiment.treatments, allDates, selectedParamId]);

  const globalMax = useMemo(() => {
    let max = 0;
    let foundAny = false;
    Object.values(statsByDate).forEach(dateStats => {
      Object.values(dateStats).forEach(s => {
        const val = s.mean + s.se;
        if (!isNaN(val)) {
          if (val > max) max = val;
          foundAny = true;
        }
      });
    });
    if (!foundAny || max === 0) return 10;
    return max * 1.1;
  }, [statsByDate]);

  const selectedParam = useMemo(() => experiment.parameters.find(p => p.id === selectedParamId), [experiment.parameters, selectedParamId]);

  const activeTreatmentsCount = visibleTreatmentIds.length;

  const handleDownloadCSV = () => {
    const headers = ["Date", "DAA", "Treatment Name", "Treatment #", "Rep", "Sample", "Parameter", "Unit", "Value"];
    const rows: string[][] = [headers];

    allDates.forEach(date => {
      const dayData = experiment.evaluations[date];
      const daa = getDAA(date) || "N/A";
      dayData.forEach(dp => {
        const treatment = experiment.treatments.find(t => t.id === dp.treatmentId);
        const parameter = experiment.parameters.find(p => p.id === dp.parameterId);
        rows.push([
          date,
          daa,
          treatment?.name || "Unknown",
          treatment?.number.toString() || "?",
          dp.rep.toString(),
          (dp.sampleIndex || 1).toString(),
          parameter?.name || "Unknown",
          parameter?.unit || "",
          dp.value.toString()
        ]);
      });
    });

    const csvContent = "\uFEFF" + rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `experiment_raw_data_${experiment.title.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-32" dir="rtl">
      <div className="bg-white p-6 shadow-sm border-b-4 border-black sticky top-16 z-40 flex flex-wrap justify-between items-center no-print gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 text-slate-400 bg-slate-50 rounded-2xl hover:text-teal-600 transition-colors border-2 border-black"><ChevronRight size={22} /></button>
          <div>
            <h2 className="text-2xl font-black text-slate-900 leading-tight">ניתוח רב-תאריכי</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">צפייה בכל מועדי ההערכה בו-זמנית</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleDownloadCSV} className="flex items-center gap-2 px-4 py-3 bg-white text-slate-900 border-2 border-black rounded-2xl font-black text-xs hover:bg-slate-50 transition-all shadow-sm">
            <Download size={16} /> הורד CSV
          </button>
          <div className="flex bg-slate-100 p-1 rounded-2xl border-2 border-black shadow-sm h-14 no-print min-w-[300px]">
            <button onClick={() => setViewType('bar')} className={`flex-1 flex items-center justify-center gap-2 font-black text-xs transition-all ${viewType === 'bar' ? 'bg-slate-900 text-white rounded-xl shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}><BarChart size={16} /> גרף</button>
            <button onClick={() => setViewType('table')} className={`flex-1 flex items-center justify-center gap-2 font-black text-xs transition-all ${viewType === 'table' ? 'bg-slate-900 text-white rounded-xl shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}><TableProperties size={16} /> טבלה</button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-6 space-y-10">
        <div className="bg-slate-900 text-white p-6 rounded-[3rem] border-2 border-black flex items-center gap-6 no-print">
           <h4 className="font-black text-xs text-slate-400 uppercase tracking-widest">בחר פרמטר להצגה:</h4>
           <select value={selectedParamId} onChange={e => setSelectedParamId(e.target.value)} className="bg-slate-800 border-2 border-slate-700 rounded-xl p-3 text-sm font-black outline-none focus:ring-2 focus:ring-teal-500 min-w-[200px]">
              {experiment.parameters.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
           </select>
        </div>

        {viewType === 'bar' ? (
          <div className="space-y-8">
            <div className="bg-white p-12 rounded-[4rem] shadow-2xl border-4 border-black overflow-x-auto min-h-[600px] scrollbar-hide relative">
              <div 
                className="h-full flex items-end"
                style={{ minWidth: `${Math.max(800, allDates.length * activeTreatmentsCount * 50 + 100)}px` }}
              >
                {/* Y Axis Ruler */}
                <div className="absolute left-10 top-24 bottom-24 w-12 border-r-4 border-black flex flex-col justify-between items-end pr-3">
                   {[100, 75, 50, 25, 0].map(p => (
                     <div key={p} className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400">{(globalMax * p / 100).toFixed(1)}</span>
                        <div className="w-2 h-[2px] bg-black" />
                     </div>
                   ))}
                </div>

                <div className="flex-1 flex flex-col h-full mr-16">
                  <h3 className="text-2xl font-black text-slate-900 mb-8 mr-4">{selectedParam?.name} לאורך זמן</h3>
                  
                  <div className="flex-1 border-b-8 border-black relative flex items-end justify-around px-8 h-[400px]">
                    {/* Horizontal Grid Lines */}
                    {[0, 25, 50, 75, 100].map(p => (
                      <div key={p} className="absolute left-0 right-0 border-t-2 border-slate-100 -z-0" style={{ bottom: `${p}%` }} />
                    ))}

                    {allDates.map(date => (
                      <div key={date} className="flex-1 flex flex-col items-center group/date relative h-full">
                        {/* Vertical Date Separation Line */}
                        <div className="absolute inset-y-0 left-0 border-l-2 border-slate-100 -z-0" />
                        
                        <div className="flex items-end justify-center gap-1.5 w-full h-[380px] mb-2 px-2 z-10">
                           {experiment.treatments.filter(t => visibleTreatmentIds.includes(t.id)).map(t => {
                              const res = statsByDate[date][t.id];
                              if (!res) return null;
                              const h = (res.mean / globalMax) * 100;
                              const seH = (res.se / globalMax) * 100;
                              const color = COLOR_OPTIONS.find(c => c.name === t.colors[0])?.hex || '#14b8a6';
                              return (
                                 <div key={t.id} className="relative flex flex-col items-center group flex-1 min-w-[30px] max-w-[45px] h-full justify-end">
                                    <div className="absolute z-30 flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded shadow-lg border border-slate-200 pointer-events-none" style={{ bottom: `${h + seH + 15}%` }}>
                                       <span className="text-[10px] font-black">{res.mean.toFixed(1)}</span>
                                    </div>
                                    <div className="absolute z-20 text-teal-600 font-black text-[12px] mb-1" style={{ bottom: `${h + seH}%` }}>{res.letter}</div>
                                    {res.n >= 2 && res.se > 0 && (
                                      <div className="absolute w-[2px] bg-slate-900 z-10" style={{ height: `${seH * 2}%`, bottom: `${h - seH}%` }}>
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-[2px] bg-slate-900" />
                                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-[2px] bg-slate-900" />
                                      </div>
                                    )}
                                    <div className="w-full border-2 border-black rounded-t-md transition-all duration-700 shadow-sm relative overflow-hidden" style={{ height: `${Math.max(h, 1)}%`, backgroundColor: color }}>
                                      <div className="absolute inset-0 bg-white/10" />
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                        <div className="mt-4 text-center pb-2 bg-white w-full border-t-4 border-black pt-2">
                           <div className="text-xs font-black text-slate-900 whitespace-nowrap">{formatDate(date)}</div>
                           <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{getDAA(date)}</div>
                        </div>
                      </div>
                    ))}
                    <div className="absolute inset-y-0 right-0 border-l-2 border-slate-100 -z-0" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[3rem] shadow-sm border-2 border-black no-print">
               <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                  <Filter size={18} className="text-teal-600" />
                  <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">פילטר טיפולים להשוואה</h3>
               </div>
               <div className="flex flex-wrap gap-3">
                  {experiment.treatments.map(t => {
                     const isVisible = visibleTreatmentIds.includes(t.id);
                     const color = COLOR_OPTIONS.find(c => c.name === t.colors[0])?.hex || '#ccc';
                     return (
                        <button key={t.id} onClick={() => setVisibleTreatmentIds(prev => isVisible ? prev.filter(id => id !== t.id) : [...prev, t.id])} className={`flex items-center gap-3 px-4 py-2 rounded-2xl border-2 transition-all ${isVisible ? 'border-black bg-slate-50 shadow-md' : 'border-slate-100 bg-white opacity-40 hover:opacity-100'}`}>
                           <div className="w-3 h-3 rounded-full border border-black/20" style={{ backgroundColor: color }} />
                           <span className="text-xs font-black">{t.name}</span>
                        </button>
                     );
                  })}
               </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[2rem] border-4 border-black shadow-2xl bg-white">
            <table className="scientific-table text-sm text-center min-w-full">
               <thead>
                  <tr className="bg-slate-900 text-white">
                     <th className="p-5 text-right bg-slate-900 border-l-4 border-black">טיפול</th>
                     {allDates.map(date => <th key={date} className="p-4 border-l-2 border-white/10">{formatDate(date)}<br/><span className="text-[9px] opacity-60">({getDAA(date)})</span></th>)}
                  </tr>
               </thead>
               <tbody>
                  {experiment.treatments.map(t => (
                     <tr key={t.id} className="hover:bg-slate-50">
                        <td className="p-5 text-right font-black border-l-4 border-black">{t.name}</td>
                        {allDates.map(date => {
                           const res = statsByDate[date][t.id];
                           return <td key={date} className="p-4 font-black border-l-2 border-slate-100">{res ? `${res.mean.toFixed(1)} ${res.letter}` : '-'}</td>;
                        })}
                     </tr>
                  ))}
               </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/95 backdrop-blur-lg border-t-4 border-black z-50 flex items-center justify-between no-print">
        <button onClick={onBack} className="bg-slate-100 px-12 py-5 rounded-3xl font-black border-2 border-black hover:bg-slate-200">חזור</button>
        <button onClick={onNext} className="bg-slate-900 text-white px-16 py-5 rounded-3xl font-black border-2 border-black shadow-2xl hover:bg-black flex items-center gap-3">המשך לדו"ח <FileBarChart size={24} /></button>
      </div>
    </div>
  );
};

export default Analytics;
