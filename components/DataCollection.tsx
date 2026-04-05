import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Experiment, COLOR_OPTIONS, DesignType, Treatment, DataPoint } from '../types';
import { ChevronRight, BarChart3, Info, Plus, Calendar, Printer, Scan, Camera, Loader2, X, ArrowLeft, CheckCircle2, AlertTriangle, RefreshCcw, Check, ArrowRight, UserCheck, Search, LayoutGrid, ListChecks, Wand2, ChevronDown, ChevronUp, Edit2, Trash2 } from 'lucide-react';
import { extractDataFromImage } from '../services/geminiService';

// Props interface for DataCollection component
interface Props {
  experiment: Experiment;
  setExperiment: React.Dispatch<React.SetStateAction<Experiment>>;
  onBack: () => void;
  onNext: () => void;
}

interface DataCellProps {
  samples: DataPoint[];
  onSave: (index: number, value: string) => void;
  placeholder?: string;
}

const DataCell: React.FC<DataCellProps> = ({ samples, onSave, placeholder = "0" }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate average of valid numbers including 0
  const average = useMemo(() => {
    const validValues = samples
      .map(s => s.value)
      .filter(v => v !== "" && v !== null && !isNaN(Number(v)))
      .map(v => Number(v));
      
    if (validValues.length === 0) return null;
    return (validValues.reduce((a, b) => a + b, 0) / validValues.length).toFixed(1);
  }, [samples]);

  // Count only non-empty samples
  const activeSamplesCount = useMemo(() => {
    return samples.filter(s => s.value !== "" && s.value !== null).length;
  }, [samples]);

  return (
    <div className="relative h-full flex flex-col items-center justify-center group min-h-[120px]">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full h-full flex flex-col items-center justify-center cursor-pointer transition-colors ${isExpanded ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
      >
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">AVG</span>
          <span className="font-black text-5xl text-slate-900">
            {average !== null ? average : <span className="text-slate-100 italic">0</span>}
          </span>
          <div className="flex items-center gap-1 mt-2 text-teal-600 font-black text-[10px]">
            <Edit2 size={10} />
            <span>{activeSamplesCount}/10 SAMPLES</span>
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="absolute top-full left-0 right-0 z-[100] bg-white border-4 border-black rounded-[2rem] p-6 shadow-2xl mt-2 animate-in slide-in-from-top-4 duration-200">
           <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-black text-slate-900 uppercase">Edit Individual Samples</h4>
              <button onClick={() => setIsExpanded(false)} className="p-1 hover:bg-slate-100 rounded-full"><X size={14}/></button>
           </div>
           <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => {
                const sample = samples.find(s => s.sampleIndex === i + 1);
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-[8px] font-black text-slate-400">S{i + 1}</span>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2 text-center font-black text-sm outline-none focus:border-teal-500 focus:bg-white transition-all"
                      value={sample?.value ?? ''}
                      placeholder="-"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^-?\d*\.?\d*$/.test(val)) {
                          onSave(i + 1, val);
                        }
                      }}
                    />
                  </div>
                );
              })}
           </div>
        </div>
      )}
    </div>
  );
};

const formatDate = (isoString: string) => {
  if (!isoString) return '';
  const [year, month, day] = isoString.split('-');
  return `${day}/${month}/${year}`;
};

const TreatmentCircle: React.FC<{ colors: string[], size?: string }> = ({ colors, size = "w-6 h-6" }) => {
  const c1 = COLOR_OPTIONS.find(c => c.name === colors[0])?.hex || '#ccc';
  const c2 = colors[1] ? COLOR_OPTIONS.find(c => c.name === colors[1])?.hex : c1;
  const background = colors.length > 1 
    ? `linear-gradient(to right, ${c1} 50%, ${c2} 50%)` 
    : c1;
    
  return (
    <div 
      className={`${size} rounded-full border-2 border-black shadow-sm shrink-0 transition-all`} 
      style={{ background }}
    />
  );
};

const DataCollection: React.FC<Props> = ({ experiment, setExperiment, onBack, onNext }) => {
  const [viewMode, setViewMode] = useState<'edit' | 'print'>('edit');
  const [isBlinded, setIsBlinded] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  
  // OCR State
  const [ocrResults, setOcrResults] = useState<any[] | null>(null);
  const [ocrHeaderMap, setOcrHeaderMap] = useState<Record<string, string>>({});
  const [ocrTreatmentMap, setOcrTreatmentMap] = useState<Record<string, string>>({});
  
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null);
  const [showOcrReview, setShowOcrReview] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoContext, setActivePhotoContext] = useState<{tId: string, rep: number} | null>(null);
  
  const evalDates = useMemo(() => Object.keys(experiment.evaluations || {}).sort(), [experiment.evaluations]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return evalDates.length > 0 ? evalDates[evalDates.length - 1] : new Date().toISOString().split('T')[0];
  });

  const [selectedParamIdForScan, setSelectedParamIdForScan] = useState<string>(
    experiment.parameters[0]?.id || ''
  );

  const [newDateInput, setNewDateInput] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (evalDates.length > 0 && !evalDates.includes(selectedDate)) {
      setSelectedDate(evalDates[evalDates.length - 1]);
    }
  }, [evalDates, selectedDate]);

  const currentGridData = useMemo(() => {
    return experiment.evaluations[selectedDate] || [];
  }, [experiment.evaluations, selectedDate]);

  const uniqueScannedHeaders = useMemo(() => {
    if (!ocrResults) return [];
    return Array.from(new Set(ocrResults.map(r => r.parameterName).filter(Boolean)));
  }, [ocrResults]);

  const uniqueScannedLabels = useMemo(() => {
    if (!ocrResults) return [];
    return Array.from(new Set(ocrResults.map(r => r.treatmentName).filter(Boolean)));
  }, [ocrResults]);

  const handleAddNewDate = () => {
    if (!newDateInput) return;
    setExperiment(prev => {
      const evaluations = { ...(prev.evaluations || {}) };
      if (!evaluations[newDateInput]) {
        evaluations[newDateInput] = [];
      }
      return { ...prev, evaluations };
    });
    setSelectedDate(newDateInput);
  };

  const handleDeleteDate = () => {
    if (evalDates.length === 0) return;
    if (window.confirm(`האם אתה בטוח שברצונך למחוק את כל הנתונים מתאריך ${formatDate(selectedDate)}? הפעולה אינה ניתנת לביטול.`)) {
      setExperiment(prev => {
        const nextEval = { ...prev.evaluations };
        delete nextEval[selectedDate];
        return { ...prev, evaluations: nextEval };
      });
      // Selected date will be updated by the useEffect above
    }
  };

  const autoMatchMappings = () => {
    const newHeaderMap: Record<string, string> = {};
    const newTreatmentMap: Record<string, string> = {};

    uniqueScannedHeaders.forEach(h => {
      const cleanH = h.trim().toLowerCase();
      const match = experiment.parameters.find(p => 
        p.name.trim().toLowerCase() === cleanH || 
        cleanH.includes(p.name.trim().toLowerCase()) ||
        p.name.trim().toLowerCase().includes(cleanH)
      );
      if (match) newHeaderMap[h] = match.id;
      else if (uniqueScannedHeaders.length === 1) newHeaderMap[h] = selectedParamIdForScan;
    });

    uniqueScannedLabels.forEach(l => {
      const cleanL = l.trim().toLowerCase();
      const match = experiment.treatments.find(t => 
        t.name.trim().toLowerCase() === cleanL || 
        t.fieldLabel?.trim().toLowerCase() === cleanL ||
        cleanL.includes(`t${t.number}`) ||
        cleanL.includes(`טיפול ${t.number}`)
      );
      if (match) newTreatmentMap[l] = match.id;
    });

    setOcrHeaderMap(prev => ({ ...prev, ...newHeaderMap }));
    setOcrTreatmentMap(prev => ({ ...prev, ...newTreatmentMap }));
  };

  const handleScanForm = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsScanning(true);
    setScanError(null);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64WithHeader = event.target?.result as string;
      const base64 = base64WithHeader.split(',')[1];
      setOcrPreviewUrl(base64WithHeader);
      try {
        const results = await extractDataFromImage(base64, file.type);
        if (!Array.isArray(results) || results.length === 0) {
          throw new Error("Table not detected or unreadable.");
        }
        setOcrResults(results);
        setOcrHeaderMap({});
        setOcrTreatmentMap({});
        setShowOcrReview(true);
      } catch (err) {
        setScanError("Image too blurry or table not detected. Please try again with better lighting.");
        setTimeout(() => setScanError(null), 5000);
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const updateOcrSampleValue = (rowIndex: number, sampleIndex: number, newValue: string) => {
    if (!ocrResults) return;
    const newResults = [...ocrResults];
    // Update the value, and clear the uncertainty flag since user intervened
    const val = newValue === '' ? null : Number(newValue);
    if (newResults[rowIndex].samples[sampleIndex]) {
      newResults[rowIndex].samples[sampleIndex].value = val;
      newResults[rowIndex].samples[sampleIndex].uncertain = false;
    }
    setOcrResults(newResults);
  };

  const applyOcrResults = () => {
    if (!ocrResults) return;

    setExperiment(prev => {
      const nextEval = JSON.parse(JSON.stringify(prev.evaluations || {}));
      let dayData = [...(nextEval[selectedDate] || [])];
      
      ocrResults.forEach((ocrRow) => {
        // Fix: corrected variable name typo (removed space)
        const matchedTreatmentId = ocrTreatmentMap[ocrRow.treatmentName];
        if (!matchedTreatmentId) return;

        const rep = Number(ocrRow.repNumber);
        if (isNaN(rep) || rep < 1 || rep > 4) return;

        const targetParamId = ocrHeaderMap[ocrRow.parameterName] || selectedParamIdForScan;
        if (!targetParamId) return;

        if (Array.isArray(ocrRow.samples)) {
          // Filter out existing points for this cell to overwrite with new scan data
          dayData = dayData.filter(d => 
            !(d.treatmentId === matchedTreatmentId && d.rep === rep && d.parameterId === targetParamId)
          );

          ocrRow.samples.forEach((sampleObj, sIdx) => {
            const val = sampleObj.value;
            if (val === null || val === undefined) return;
            
            dayData.push({
              id: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dp-${Date.now()}-${Math.random()}`),
              treatmentId: matchedTreatmentId,
              rep: rep,
              parameterId: targetParamId,
              sampleIndex: sIdx + 1,
              value: Number(val),
              timestamp: new Date().toISOString()
            });
          });
        }
      });

      nextEval[selectedDate] = dayData;
      return { ...prev, evaluations: nextEval };
    });

    setShowOcrReview(false);
    setOcrResults(null);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const updateSampleValue = (treatmentId: string, rep: number, parameterId: string, sampleIndex: number, value: string, photo?: string) => {
    setExperiment(prev => {
      const evaluations = JSON.parse(JSON.stringify(prev.evaluations || {}));
      let currentDayData = [...(evaluations[selectedDate] || [])];
      
      const existingIdx = currentDayData.findIndex(
        (d) => d.treatmentId === treatmentId && d.parameterId === parameterId && d.rep === rep && d.sampleIndex === sampleIndex
      );
      
      const timestamp = new Date().toISOString();
      
      if (existingIdx > -1) {
        if (value === '' && !photo) {
          currentDayData.splice(existingIdx, 1);
        } else {
          currentDayData[existingIdx] = { 
            ...currentDayData[existingIdx], 
            value: value !== '' ? value : currentDayData[existingIdx].value, 
            photo: photo || currentDayData[existingIdx].photo,
            timestamp
          };
        }
      } else if (value !== '' || photo) {
        currentDayData.push({
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dp-${Date.now()}-${Math.random()}`,
          treatmentId,
          rep,
          parameterId,
          sampleIndex,
          value: value,
          photo: photo,
          timestamp
        });
      }

      evaluations[selectedDate] = currentDayData;
      return { ...prev, evaluations };
    });
  };

  const tableRows = useMemo(() => {
    const rows: { treatment: Treatment; rep: number }[] = [];
    experiment.treatments.forEach(t => {
      [1, 2, 3, 4].forEach(r => rows.push({ treatment: t, rep: r }));
    });
    if (experiment.designType === DesignType.RCBD) {
      rows.sort((a, b) => a.rep - b.rep);
    }
    return rows;
  }, [experiment.treatments, experiment.designType]);

  const firstAppDate = experiment.applicationDates?.[0] || experiment.applicationDetails?.date;
  const daa = firstAppDate ? Math.floor((new Date(selectedDate).getTime() - new Date(firstAppDate).getTime()) / 86400000) : 'N/A';
  
  const activeParams = experiment.parameters.slice(0, 3);
  const qrData = `exp:${experiment.id}|date:${selectedDate}|params:${activeParams.map(p => p.name).join(',')}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;

  const handlePrint = () => {
    const printContent = document.getElementById('printable-content');
    if (!printContent) return;
    const printWindow = window.open('', '_blank', 'height=800,width=1000');
    if (!printWindow) return;
    
    printWindow.document.write('<html><head><title>Field Capture Form</title>');
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(style => {
      printWindow.document.write(style.outerHTML);
    });
    printWindow.document.write('</head><body style="background:white; padding: 0; margin: 0;">');
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write('</body></html>');
    
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePhotoContext) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const firstParamId = experiment.parameters[0]?.id;
      if (firstParamId) {
        updateSampleValue(activePhotoContext.tId, activePhotoContext.rep, firstParamId, 1, '', base64);
      }
      setActivePhotoContext(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (viewMode === 'print') {
    return (
      <div className="fixed inset-0 bg-white z-[500] p-0 overflow-y-auto" dir="ltr" style={{ direction: 'ltr' }}>
        <style>{`
          @page { size: A4 landscape; margin: 0mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important; color: #000000 !important; direction: ltr !important; }
          .final-stable-root { width: 297mm; height: 210mm; margin: 0; background: white; padding: 8mm; display: block; }
          .final-stable-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid black; padding-bottom: 4mm; margin-bottom: 6mm; }
          .final-qr { width: 32mm; height: 32mm; border: 2px solid black; background: white; margin-right: 5mm; margin-top: 5mm; }
          .final-stable-meta { text-align: left; flex: 1; }
          .final-stable-meta h1 { font-size: 26pt; font-weight: 900; margin: 0 0 2mm 0; text-transform: uppercase; letter-spacing: -1px; }
          .final-meta-details { display: flex; gap: 15mm; font-size: 11pt; font-weight: 700; }
          .final-capture-table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; border: 3pt solid black !important; page-break-inside: avoid !important; }
          .final-capture-table th, .final-capture-table td { border: 2pt solid black !important; padding: 2px !important; vertical-align: middle; text-align: center; }
          .final-capture-table th { font-weight: 900 !important; font-size: 10pt !important; background-color: #f1f5f9 !important; text-transform: uppercase; }
          .final-capture-table td { height: 18mm !important; font-size: 14pt !important; }
          .final-label-cell { text-align: left !important; padding-left: 5mm !important; width: 15% !important; background-color: #f8fafc !important; font-weight: 900 !important; font-size: 16pt !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
          .final-sample-cell { width: 8.5% !important; font-size: 8pt !important; color: #666 !important; }
          @media print { .no-print { display: none !important; } body { margin: 0 !important; overflow: visible !important; } .final-stable-root { max-width: 95% !important; margin: auto !important; padding: 10mm !important; width: 100% !important; box-sizing: border-box !important; } }
        `}</style>
        
        <div className="no-print sticky top-0 bg-slate-900 p-4 border-b-4 border-black flex items-center justify-between shadow-2xl z-[600]">
          <button onClick={() => setViewMode('edit')} className="flex items-center gap-2 px-6 py-2 bg-white text-slate-900 rounded-xl font-black border-2 border-black hover:bg-slate-100 transition-colors">
            <X size={18} /> Close View
          </button>
          <h2 className="text-white font-black text-sm uppercase tracking-widest">STABLE A4 LANDSCAPE SCIENTIFIC FORM (LTR)</h2>
          <button onClick={handlePrint} className="flex items-center gap-2 px-8 py-2 bg-teal-500 text-white rounded-xl font-black border-2 border-black hover:bg-teal-600 transition-colors shadow-lg">
            <Printer size={18} /> Print Sheet
          </button>
        </div>

        <div id="printable-content" className="final-stable-root">
          <div className="final-stable-header">
            <div className="final-stable-meta">
              <h1>{experiment.title || 'FIELD DATA COLLECTION'}</h1>
              <div className="final-meta-details">
                <div><span style={{color:'#666', fontSize:'8pt', display:'block', textTransform:'uppercase'}}>Date</span>{formatDate(selectedDate)}</div>
                <div><span style={{color:'#666', fontSize:'8pt', display:'block', textTransform:'uppercase'}}>DAA</span>{daa}</div>
                <div><span style={{color:'#666', fontSize:'8pt', display:'block', textTransform:'uppercase'}}>Design</span>{experiment.designType}</div>
              </div>
            </div>
            <img src={qrSrc} className="final-qr" alt="QR Map" crossOrigin="anonymous" />
          </div>

          <table className="final-capture-table">
            <thead>
              <tr>
                <th rowSpan={2} className="final-label-cell">REP / COLOR</th>
                <th colSpan={10}>SAMPLES (1-10)</th>
              </tr>
              <tr>
                {Array.from({ length: 10 }).map((_, i) => (
                  <th key={i} className="final-sample-cell">S{i+1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(0, 10).map(({ treatment, rep }, idx) => {
                const displayLabel = treatment.fieldLabel?.trim() || `T-${treatment.number}`;
                return (
                  <tr key={idx}>
                    <td className="final-label-cell">{displayLabel} (R{rep})</td>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <td key={i}></td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen relative flex flex-col overflow-visible">
      {isScanning && (
        <div className="fixed inset-0 z-[600] bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-white">
          <div className="bg-white/10 p-12 rounded-[3rem] border-4 border-white/20 flex flex-col items-center gap-6 shadow-2xl">
            <Loader2 size={80} className="animate-spin text-teal-400" />
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black">מפענח טופס עם 10 דגימות...</h3>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Gemini Vision AI is analyzing hierarchical sheet data</p>
            </div>
          </div>
        </div>
      )}

      {showSuccessToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[700] bg-teal-600 text-white px-8 py-4 rounded-2xl shadow-2xl border-2 border-black animate-in slide-in-from-top-4 duration-300 flex items-center gap-3">
           <div className="bg-white/20 p-1 rounded-full"><Check size={20} /></div>
           <span className="font-black text-sm">הנתונים יובאו ונשמרו בהצלחה!</span>
        </div>
      )}

      {scanError && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[700] bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl border-2 border-black animate-in slide-in-from-top-4 duration-300 flex items-center gap-3">
           <AlertTriangle size={24} />
           <span className="font-black text-sm">{scanError}</span>
        </div>
      )}

      {showOcrReview && ocrResults && (
        <div className="fixed inset-0 z-[600] bg-slate-900/95 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[95vw] rounded-[3rem] border-4 border-black shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col h-[95vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
               <div className="flex items-center gap-4">
                  <div className="bg-teal-500 p-3 rounded-2xl shadow-lg"><UserCheck size={28} /></div>
                  <div>
                    <h2 className="text-2xl font-black">בדיקת נתונים ואימות סריקה (Verification)</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">הנתונים שנסרקו על ידי ה-AI מופיעים למטה. ערכים חשודים מסומנים בכתום.</p>
                  </div>
               </div>
               <button onClick={() => setShowOcrReview(false)} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
               <div className="lg:w-1/4 bg-slate-200 flex items-center justify-center p-4 overflow-auto border-b-4 lg:border-b-0 lg:border-r-4 border-black">
                 <img src={ocrPreviewUrl || ''} className="max-w-full rounded-2xl border-4 border-black shadow-lg" alt="Uploaded Form" />
               </div>
               
               <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-8 scrollbar-hide">
                 {/* Header Mapping Section */}
                 <div className="bg-white p-6 rounded-3xl border-2 border-black shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b-2 border-slate-100 pb-2">
                       <h3 className="text-sm font-black flex items-center gap-3"><LayoutGrid className="text-teal-600" /> מיפוי עמודות וטיפולים</h3>
                       <button onClick={autoMatchMappings} className="px-4 py-2 bg-teal-600 text-white border-2 border-black rounded-xl font-black text-[10px] shadow-md hover:bg-teal-700 transition-all flex items-center gap-2"><Wand2 size={12} /> התאמה אוטומטית</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">עמודת נתון שנסרקה</label>
                          {uniqueScannedHeaders.map(h => (
                            <select key={h} value={ocrHeaderMap[h] || ''} onChange={(e) => setOcrHeaderMap(prev => ({...prev, [h]: e.target.value}))} className="w-full p-2 rounded-xl border-2 border-black font-black text-xs">
                              <option value="">-- בחר פרמטר (למשל {h}) --</option>
                              {experiment.parameters.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          ))}
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">זיהוי בלוק טיפול</label>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {uniqueScannedLabels.map(l => (
                              <div key={l} className="flex items-center gap-2">
                                <span className="text-[10px] font-bold shrink-0 w-20 truncate">"{l}" →</span>
                                <select value={ocrTreatmentMap[l] || ''} onChange={(e) => setOcrTreatmentMap(prev => ({...prev, [l]: e.target.value}))} className="flex-1 p-1.5 rounded-lg border border-black font-black text-[10px]">
                                  <option value="">-- בחר טיפול --</option>
                                  {experiment.treatments.map(t => <option key={t.id} value={t.id}>{t.name} ({t.fieldLabel || t.number})</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                       </div>
                    </div>
                 </div>

                 {/* Data Verification Table */}
                 <div className="space-y-4">
                    <h3 className="text-sm font-black flex items-center gap-3"><CheckCircle2 className="text-teal-600" /> וידוא נתונים (10 דגימות לשורה)</h3>
                    <div className="bg-white border-2 border-black rounded-3xl overflow-hidden shadow-xl">
                      <table className="w-full border-collapse">
                        <thead className="bg-slate-900 text-white">
                          <tr>
                            <th className="p-3 text-[10px] font-black text-right border-l border-white/10 w-32">טיפול / בלוק</th>
                            {Array.from({ length: 10 }).map((_, i) => (
                              <th key={i} className="p-3 text-[10px] font-black text-center border-l border-white/10">S{i+1}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {ocrResults.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 bg-slate-50 border-l border-slate-200">
                                <div className="text-[10px] font-black text-slate-900 leading-tight">"{row.treatmentName}"</div>
                                <div className="text-[8px] font-bold text-slate-400">REP {row.repNumber}</div>
                              </td>
                              {row.samples.map((s: any, sIdx: number) => (
                                <td key={sIdx} className={`p-1 border-l border-slate-100 ${s.uncertain ? 'bg-amber-100' : ''}`}>
                                  <div className="relative group">
                                    <input 
                                      type="text" 
                                      value={s.value ?? ''} 
                                      onChange={(e) => updateOcrSampleValue(rIdx, sIdx, e.target.value)}
                                      className={`w-full p-2 text-center font-black text-sm rounded-lg border-2 ${s.uncertain ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-transparent bg-transparent hover:border-slate-200'}`}
                                      placeholder="-"
                                    />
                                    {s.uncertain && (
                                      <div className="absolute -top-1 -right-1 bg-amber-500 text-white p-0.5 rounded-full shadow-md">
                                        <AlertTriangle size={8} />
                                      </div>
                                    )}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                 </div>

                 <div className="bg-amber-50 p-6 rounded-[2rem] border-2 border-black flex items-start gap-4">
                    <AlertTriangle className="text-amber-600 shrink-0 mt-1" />
                    <div className="space-y-2">
                       <p className="text-[10px] font-black text-amber-900 leading-relaxed uppercase">שים לב לסימונים הכתומים</p>
                       <p className="text-[10px] font-bold text-amber-800">
                         ה-AI סימן ערכים אלו כ"לא ודאיים" בשל איכות הכתב או טשטוש. מומלץ לוודא אותם מול התמונה מצד ימין לפני האישור הסופי. לחיצה על תא מאפשרת עריכה ותיקון.
                       </p>
                    </div>
                 </div>
               </div>
            </div>
            
            <div className="p-6 bg-white border-t-4 border-black flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-4">
                 <div className="bg-slate-50 px-4 py-2 rounded-xl border-2 border-black flex items-center gap-2">
                    <Search size={16} className="text-slate-400" />
                    <span className="text-xs font-black uppercase tracking-tighter">שורות לסנכרון: <span className="text-teal-600">{ocrResults.length}</span></span>
                 </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowOcrReview(false)} className="px-8 py-4 bg-white border-2 border-black rounded-2xl font-black text-slate-600 hover:bg-slate-100 transition-colors">ביטול סריקה</button>
                <button 
                  onClick={applyOcrResults} 
                  disabled={Object.keys(ocrTreatmentMap).length === 0}
                  className="px-12 py-4 bg-teal-600 text-white border-2 border-black rounded-2xl font-black shadow-xl hover:bg-teal-700 transition-all flex items-center gap-3 disabled:opacity-50 disabled:grayscale"
                >
                   <CheckCircle2 size={24} /> אישור וסנכרון כל הנתונים
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow-sm p-4 sticky top-16 z-40 border-b-4 border-black no-print">
        <div className="max-w-[1600px] mx-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2.5 text-slate-400 bg-slate-50 rounded-xl hover:text-teal-600 transition-colors border-2 border-black shadow-sm">
                <ChevronRight size={22} />
              </button>
              
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border-2 border-black shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">יום בדיקה:</span>
                <select 
                  className="bg-transparent font-black text-slate-700 text-sm outline-none cursor-pointer" 
                  value={selectedDate} 
                  onChange={e => setSelectedDate(e.target.value)}
                >
                  {evalDates.map(date => <option key={date} value={date}>{formatDate(date)}</option>)}
                  {evalDates.length === 0 && <option value={selectedDate}>{formatDate(selectedDate)} (חדש)</option>}
                </select>
                {evalDates.length > 0 && (
                   <button onClick={handleDeleteDate} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors ml-1" title="מחק תאריך זה">
                      <Trash2 size={16} />
                   </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 bg-teal-50/50 p-2 rounded-2xl border-2 border-black shadow-sm no-print">
              <div className="p-1.5 bg-white rounded-lg border-2 border-black/10"><Calendar className="text-teal-600" size={16} /></div>
              <input 
                type="date" 
                className="bg-white border-2 border-black rounded-lg px-2 py-1 text-xs font-black outline-none"
                value={newDateInput}
                onChange={e => setNewDateInput(e.target.value)}
              />
              <button onClick={handleAddNewDate} className="bg-teal-600 text-white p-1.5 rounded-lg border-2 border-black hover:bg-teal-700 transition-all shadow-md"><Plus size={16} /></button>
            </div>

            <div className="flex items-center gap-2 no-print">
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border-2 border-black shadow-sm mr-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">סרוק עבור:</span>
                <select 
                  className="bg-transparent font-black text-slate-700 text-xs outline-none cursor-pointer"
                  value={selectedParamIdForScan}
                  onChange={e => setSelectedParamIdForScan(e.target.value)}
                >
                  {experiment.parameters.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <button 
                onClick={() => setViewMode('print')} 
                className="px-4 py-2 bg-white text-slate-900 rounded-xl font-black border-2 border-black flex items-center gap-2 hover:bg-slate-50 transition-all text-xs shadow-sm"
              >
                <Printer size={14} /> טופס שטח
              </button>
              
              <button 
                onClick={() => cameraInputRef.current?.click()} 
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-black border-2 border-black flex items-center gap-2 hover:bg-black transition-all text-xs shadow-sm disabled:opacity-50"
                disabled={isScanning}
              >
                <Camera size={14} /> Scan 10-Sample Sheet
              </button>
              <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleScanForm} />
              
              <button onClick={() => setIsBlinded(!isBlinded)} className={`px-4 py-2 rounded-xl font-black border-2 border-black transition-all text-xs shadow-sm ${isBlinded ? 'bg-amber-50 text-amber-600' : 'bg-slate-800 text-white'}`}>
                {isBlinded ? 'סמוי' : 'גלוי'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-48 flex-1">
        <div className="relative overflow-auto border-4 border-black rounded-3xl bg-white shadow-2xl max-h-[70vh] scrollbar-hide">
          <table className="scientific-table data-collection-table table-fixed w-full border-collapse">
            <thead className="sticky top-0 z-40 bg-white">
              <tr>
                <th className="sticky right-0 z-40 min-w-[260px] p-6 font-black bg-slate-100 border-b-4 border-black border-l-4 shadow-[0_4px_0_0_rgba(0,0,0,1)]">
                  טיפול / חזרה
                </th>
                {experiment.parameters.map(param => (
                  <th key={param.id} className="p-6 font-black bg-slate-100 border-b-4 border-black shadow-[0_4px_0_0_rgba(0,0,0,1)]">
                    {param.name} ({param.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map(({ treatment, rep }) => {
                const dataPointsForCell = currentGridData.filter(d => d.treatmentId === treatment.id && d.rep === rep);
                const firstDataWithPhoto = dataPointsForCell.find(d => d.photo);

                return (
                  <tr key={`${treatment.id}-${rep}`} className="hover:bg-teal-50/20 group h-40">
                    <td className="sticky right-0 z-30 p-4 border-2 border-black bg-white border-l-4 border-black shadow-[2px_0_0_0_rgba(0,0,0,1)]">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center gap-2 shrink-0">
                          <TreatmentCircle colors={treatment.colors} size="w-12 h-12" />
                          <button 
                            onClick={() => {
                              setActivePhotoContext({ tId: treatment.id, rep });
                              photoInputRef.current?.click();
                            }}
                            className={`p-2 rounded-xl border-2 border-black shadow-sm transition-all ${firstDataWithPhoto?.photo ? 'bg-teal-600 text-white' : 'bg-white text-slate-400 hover:text-slate-900'}`}
                          >
                            <Camera size={16} />
                          </button>
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-base font-black text-slate-900 leading-tight truncate">
                            {isBlinded ? String(treatment.fieldLabel || `T-${treatment.number}`) : String(treatment.name)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">
                            REP {rep}
                          </span>
                        </div>
                      </div>
                    </td>
                    {experiment.parameters.map(param => {
                      const samplesInCell = dataPointsForCell.filter(d => d.parameterId === param.id);
                      return (
                        <td 
                          key={`${treatment.id}-${rep}-${param.id}`}
                          className="p-0 border-2 border-black bg-white !important min-h-[140px]"
                        >
                          <DataCell 
                            samples={samplesInCell}
                            onSave={(sIdx, val) => updateSampleValue(treatment.id, rep, param.id, sIdx, val)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <input type="file" ref={photoInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/95 backdrop-blur-md border-t-4 border-black z-50 flex items-center justify-between shadow-2xl no-print">
        <div className="flex items-center gap-3">
           <div className="bg-slate-100 p-2 rounded-xl border border-black"><Info className="text-slate-400" size={24} /></div>
           <div className="flex flex-col">
              <span className="text-sm font-black text-slate-900">10-Sample Mode Active</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Average displayed in grid</span>
           </div>
        </div>
        <button onClick={onNext} className="bg-slate-900 text-white px-16 py-6 rounded-[2.5rem] font-black shadow-2xl flex items-center gap-4 hover:bg-black transition-all border-2 border-black active:scale-95 text-xl tracking-tighter">
          סיום והמשך לניתוח <BarChart3 size={28} />
        </button>
      </div>
    </div>
  );
};

export default DataCollection;