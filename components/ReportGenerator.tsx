
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Experiment, GlobalSettings, COLOR_OPTIONS, Product, Treatment, ResearchVariable, DataPoint } from '../types';
import { Download, Sparkles, Loader2, BrainCircuit, Printer, TableProperties, FileText, Image as ImageIcon, Target, Microscope, FlaskConical, Info, Edit3, BarChart, FileCode } from 'lucide-react';
import { generateReportAnalysis } from '../services/geminiService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle, ImageRun } from 'docx';
import { saveAs } from 'file-saver';

// --- SHARED LABELS ---
const CONTEXT_LABELS: Record<string, string> = {
  growerName: 'שם המגדל',
  cropAndVariety: 'הגידול והזן',
  location: 'מיקום (Location)',
  season: 'עונה (Season)',
  growthMethod: 'שיטת הגידול',
  plantingDate: 'מועד שתילה/זריעה',
  trialDesign: 'מתכונת הניסוי',
  irrigationMethod: 'שיטת ההשקיה',
  weatherData: 'נתונים מטאורולוגיים',
  growthStageAtTreatment: 'שלב הצימוח בעת הטיפול',
  appMethod: 'שיטת היישום',
  sprayerType: 'סוג מרסס',
  sprayPressure: 'לחץ ריסוס',
  sprayVolume: 'נפח ריסוס',
  evaluationMethod: 'שיטת הערכה',
  sampleSize: 'גודל המדגם',
  initialPressure: 'נגיעות התחלתית',
  applicationDatesList: 'מועדי יישומים (ריסוסים):',
  evaluationDatesList: 'מועדי ביצוע הערכות:'
};

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
    console.error("Tukey Error in Report:", err);
    stats.forEach(s => { results[s.id].letter = 'a'; });
  }
  return results;
}

interface Props {
  experiment: Experiment;
  setExperiment: React.Dispatch<React.SetStateAction<Experiment>>;
  settings: GlobalSettings;
}

const formatDate = (isoString: string) => {
  if (!isoString) return '';
  const [year, month, day] = isoString.split('-');
  return `${day}/${month}/${year}`;
};

const ReportGenerator: React.FC<Props> = ({ experiment, setExperiment, settings }) => {
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [includeChart, setIncludeChart] = useState(true);

  const evalDates = useMemo(() => Object.keys(experiment?.evaluations || {}).sort(), [experiment?.evaluations]);
  const appDatesSorted = useMemo(() => [...(experiment?.applicationDates || [])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime()), [experiment?.applicationDates]);

  const getDAA = (evalDate: string) => {
    if (!appDatesSorted.length || !evalDate) return null;
    const evalTime = new Date(evalDate).getTime();
    const relevantApps = appDatesSorted.filter(d => new Date(d).getTime() <= evalTime);
    if (relevantApps.length === 0) return 'Pre-trial';
    const latestAppDate = relevantApps[relevantApps.length - 1];
    const diffDays = Math.ceil((evalTime - new Date(latestAppDate).getTime()) / (1000 * 60 * 60 * 24));
    return `${diffDays} DAA`;
  };
  
  const reportDetails = useMemo(() => {
    return {
      growerName: experiment.reportMetadata?.growerName || '',
      cropAndVariety: experiment.reportMetadata?.cropAndVariety || experiment.variety || '',
      location: experiment.reportMetadata?.location || '',
      season: experiment.reportMetadata?.season || '',
      growthMethod: experiment.reportMetadata?.growthMethod || '',
      plantingDate: experiment.reportMetadata?.plantingDate || experiment.plantingDate || '',
      trialDesign: experiment.reportMetadata?.trialDesign || experiment.designType || '',
      irrigationMethod: experiment.reportMetadata?.irrigationMethod || experiment.irrigationMethod || '',
      weatherData: experiment.reportMetadata?.weatherData || '',
      growthStageAtTreatment: experiment.reportMetadata?.growthStageAtTreatment || '',
      appMethod: experiment.reportMetadata?.appMethod || experiment.applicationMethod || '',
      sprayerType: experiment.reportMetadata?.sprayerType || experiment.applicationDetails.equipment || '',
      sprayPressure: experiment.reportMetadata?.sprayPressure || experiment.applicationDetails.pressure || '',
      sprayVolume: experiment.reportMetadata?.sprayVolume || experiment.applicationDetails.volumePerDunam || '',
      evaluationMethod: experiment.reportMetadata?.evaluationMethod || '',
      sampleSize: experiment.reportMetadata?.sampleSize || '',
      initialPressure: experiment.reportMetadata?.initialPressure || '',
      applicationDatesList: experiment.applicationDates && experiment.applicationDates.length > 0 
        ? experiment.applicationDates.map(d => formatDate(d)).join(', ') 
        : 'לא הוזנו תאריכי יישום',
      evaluationDatesList: evalDates.length > 0
        ? evalDates.map(d => `${formatDate(d)} (${getDAA(d) || '0 DAA'})`).join(', ')
        : 'לא בוצעו הערכות'
    };
  }, [experiment.reportMetadata, experiment.variety, experiment.plantingDate, experiment.designType, experiment.irrigationMethod, experiment.applicationMethod, experiment.applicationDetails, experiment.applicationDates, evalDates, appDatesSorted]);

  const uniqueProducts = useMemo(() => {
    const products: Record<string, Product> = {};
    experiment.treatments.forEach(t => {
      t.products.forEach(p => {
        if (!products[p.name]) products[p.name] = p;
      });
    });
    return Object.values(products);
  }, [experiment.treatments]);

  const imagesAppendix = useMemo(() => {
    const photos: { treatment: Treatment; param: ResearchVariable; date: string; photo: string }[] = [];
    Object.keys(experiment.evaluations).forEach(date => {
      experiment.evaluations[date].forEach(dp => {
        if (dp.photo) {
          const t = experiment.treatments.find(tr => tr.id === dp.treatmentId);
          const p = experiment.parameters.find(pr => pr.id === dp.parameterId);
          if (t && p) photos.push({ treatment: t, param: p, date, photo: dp.photo });
        }
      });
    });
    return photos;
  }, [experiment]);

  const handleGenerateAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const result = await generateReportAnalysis(experiment, settings);
      setAiAnalysis(result);
    } catch (err) { alert("Error generating AI analysis."); } finally { setIsAnalyzing(false); }
  };

  const updateDetail = (field: string, value: string) => {
    setExperiment(prev => ({ ...prev, reportMetadata: { ...(prev.reportMetadata || {}), [field]: value } }));
  };

  const firstParam = experiment.parameters[0];
  const statsByDate = useMemo(() => {
    if (!firstParam) return {};
    const map: Record<string, Record<string, StatisticalResult>> = {};
    evalDates.forEach(date => {
      const dayDataSlice = experiment.evaluations[date].filter(d => d.parameterId === firstParam.id);
      map[date] = calculateTukey(experiment.treatments, dayDataSlice);
    });
    return map;
  }, [experiment.evaluations, experiment.treatments, evalDates, firstParam]);

  const reportRef = useRef<HTMLDivElement>(null);

  const handleExportToMarkdown = () => {
    const title = experiment.title || 'Field Trial Report';
    
    let md = `# ${title}\n\n`;
    md += `## 1. מטרת הניסוי והשערות\n${experiment.hypothesis || 'לא הוגדרה מטרת ניסוי.'}\n\n`;
    
    md += `## 2. פרטי רקע ולוח זמנים\n\n`;
    Object.entries(reportDetails).forEach(([key, value]) => {
      md += `* **${CONTEXT_LABELS[key] || key}**: ${value || '-'}\n`;
    });
    md += `\n`;

    md += `## 3. פרוטוקול טיפולים\n\n`;
    md += `| # | שם הטיפול | מינונים והרכב |\n`;
    md += `|---|-----------|---------------|\n`;
    experiment.treatments.forEach(t => {
      const products = t.products.map(p => `${p.name} (${p.dosage})`).join(', ');
      md += `| ${t.number} | ${t.name} | ${products} |\n`;
    });
    md += `\n`;

    md += `## 4. תוצאות וניתוח סטטיסטי\n\n`;
    if (firstParam) {
      md += `### ${firstParam.name} (${firstParam.unit})\n\n`;
      md += `| טיפול | ${evalDates.map(d => `${formatDate(d)} (${getDAA(d)})`).join(' | ')} |\n`;
      md += `|-------|${evalDates.map(() => '---').join('|')}|\n`;
      experiment.treatments.forEach(t => {
        const row = evalDates.map(d => {
          const stats = calculateTukey(experiment.treatments, experiment.evaluations[d]?.filter(dp => dp.parameterId === firstParam.id) || []);
          const res = stats[t.id];
          return res ? `${res.mean.toFixed(1)} ${res.letter}` : '-';
        }).join(' | ');
        md += `| ${t.name} | ${row} |\n`;
      });
    }
    md += `\n`;

    md += `## 5. דיון ומסקנות\n\n${aiAnalysis || 'לא הופקה אנליזה.'}\n`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Report_${title.replace(/\s+/g, '_')}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleExportToWord = async () => {
    setIsAnalyzing(true);
    try {
      const children: any[] = [
        // Header / Title Area
        new Paragraph({
          children: [
            new TextRun({
              text: "LUXEMBOURG",
              bold: true,
              size: 32,
              color: "115E59", // teal-800
            }),
          ],
          alignment: AlignmentType.LEFT,
        }),
        new Paragraph({
          text: experiment.title || 'דוח ניסוי שדה',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { before: 200, after: 400 },
        }),
        
        // Section 1: Hypothesis
        new Paragraph({
          text: '1. מטרת הניסוי והשערות',
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { before: 400, after: 200 },
        }),
        new Paragraph({
          text: experiment.hypothesis || "לא הוגדרה מטרת ניסוי.",
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { after: 400 },
        }),

        // Section 2: Details
        new Paragraph({
          text: '2. פרטי רקע ולוח זמנים',
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { before: 400, after: 200 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: Object.entries(reportDetails).map(([key, value]) => (
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ text: (value as string) || '-', alignment: AlignmentType.RIGHT, bidirectional: true })],
                  verticalAlign: AlignmentType.CENTER,
                  margins: { top: 100, bottom: 100, left: 100, right: 100 },
                }),
                new TableCell({
                  children: [new Paragraph({ 
                    children: [new TextRun({ text: CONTEXT_LABELS[key] || key, bold: true })],
                    alignment: AlignmentType.RIGHT, 
                    bidirectional: true 
                  })],
                  shading: { fill: "F1F5F9" },
                  verticalAlign: AlignmentType.CENTER,
                  margins: { top: 100, bottom: 100, left: 100, right: 100 },
                }),
              ],
            })
          )),
        }),

        // Section 3: Protocol
        new Paragraph({
          text: '3. פרוטוקול טיפולים',
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { before: 400, after: 200 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'מינונים והרכב', bold: true })], alignment: AlignmentType.RIGHT, bidirectional: true })], shading: { fill: "F1F5F9" }, margins: { top: 100, bottom: 100 } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'שם הטיפול', bold: true })], alignment: AlignmentType.RIGHT, bidirectional: true })], shading: { fill: "F1F5F9" }, margins: { top: 100, bottom: 100 } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '#', bold: true })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: "F1F5F9" }, margins: { top: 100, bottom: 100 } }),
              ],
            }),
            ...experiment.treatments.map(t => (
              new TableRow({
                children: [
                  new TableCell({
                    children: t.products.map(p => new Paragraph({ text: `${p.name} (${p.dosage})`, alignment: AlignmentType.RIGHT, bidirectional: true })),
                    margins: { top: 100, bottom: 100 },
                  }),
                  new TableCell({ children: [new Paragraph({ text: t.name, alignment: AlignmentType.RIGHT, bidirectional: true })], margins: { top: 100, bottom: 100 } }),
                  new TableCell({ children: [new Paragraph({ text: t.number.toString(), alignment: AlignmentType.CENTER, bidirectional: true })], margins: { top: 100, bottom: 100 } }),
                ],
              })
            )),
          ],
        }),

        // Section 4: Results
        new Paragraph({
          text: '4. תוצאות וניתוח סטטיסטי',
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { before: 400, after: 200 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            // Header row
            new TableRow({
              children: [
                ...[...evalDates].reverse().map(d => (
                  new TableCell({ 
                    children: [new Paragraph({ children: [new TextRun({ text: `${formatDate(d)}\n${getDAA(d)}`, bold: true })], alignment: AlignmentType.CENTER, bidirectional: true })],
                    shading: { fill: "F1F5F9" },
                    margins: { top: 100, bottom: 100 },
                  })
                )),
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: 'טיפול', bold: true })], alignment: AlignmentType.RIGHT, bidirectional: true })],
                  shading: { fill: "F1F5F9" },
                  margins: { top: 100, bottom: 100 },
                }),
              ],
            }),
            // Data rows
            ...experiment.treatments.map(t => (
              new TableRow({
                children: [
                  ...[...evalDates].reverse().map(d => {
                    const stats = calculateTukey(experiment.treatments, experiment.evaluations[d]?.filter(dp => dp.parameterId === (firstParam?.id || '')) || []);
                    const res = stats[t.id];
                    return new TableCell({
                      children: [new Paragraph({ text: res ? `${res.mean.toFixed(1)} ${res.letter}` : '-', alignment: AlignmentType.CENTER, bidirectional: true })],
                      margins: { top: 100, bottom: 100 },
                    });
                  }),
                  new TableCell({ children: [new Paragraph({ text: t.name, alignment: AlignmentType.RIGHT, bidirectional: true })], margins: { top: 100, bottom: 100 } }),
                ],
              })
            )),
          ],
        }),

        // Section 5: AI Analysis
        new Paragraph({
          text: '5. דיון ומסקנות',
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { before: 400, after: 200 },
        }),
        new Paragraph({
          text: aiAnalysis || 'לא הופקה אנליזה.',
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { after: 400 },
        }),
      ];

      // Section 6: Images Appendix
      if (imagesAppendix.length > 0) {
        children.push(new Paragraph({
          text: 'נספח תמונות',
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { before: 400, after: 200 },
        }));

        // Word handles images better in a grid or sequence
        for (const img of imagesAppendix) {
          try {
            // Convert base64 to array buffer for docx
            const base64Data = img.photo.split(',')[1];
            const binaryString = window.atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            children.push(new Paragraph({
              children: [
                new ImageRun({
                  data: bytes,
                  transformation: {
                    width: 400,
                    height: 225,
                  },
                } as any),
              ],
              alignment: AlignmentType.CENTER,
            }));
            children.push(new Paragraph({
              text: `[ ${img.treatment.name} | ${formatDate(img.date)} ]`,
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            }));
          } catch (e) {
            console.error("Error adding image to Word:", e);
          }
        }
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children: children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Report_${(experiment.title || 'Field_Trial').replace(/\s+/g, '_')}.docx`);
    } catch (err) {
      console.error("Word Export Error:", err);
      alert("שגיאה בייצוא Word.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportToPdf = async () => {
    if (!reportRef.current) return;
    
    setIsAnalyzing(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15; // mm
      const contentWidth = pageWidth - (2 * margin);
      
      let currentY = margin;
      
      // Target the report view
      const element = reportRef.current;
      
      // Get the header and all sections
      const header = element.querySelector('.report-header') as HTMLElement;
      const sections = Array.from(element.querySelectorAll('.report-section')) as HTMLElement[];
      
      const elementsToCapture = [header, ...sections].filter(Boolean);
      
      for (let i = 0; i < elementsToCapture.length; i++) {
        const el = elementsToCapture[i];
        
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const imgProps = pdf.getImageProperties(imgData);
        const imgHeight = (imgProps.height * contentWidth) / imgProps.width;
        
        // Check if we need a new page
        if (currentY + imgHeight > pageHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }
        
        pdf.addImage(imgData, 'PNG', margin, currentY, contentWidth, imgHeight);
        currentY += imgHeight + 10; // 10mm gap
      }

      pdf.save(`Report_${(experiment.title || 'Field_Trial').replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error("PDF Export Error:", err);
      alert("שגיאה בייצוא PDF. נסה להשתמש בכפתור ההדפסה.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-12 pb-32 print:pb-0 relative isolate" dir="rtl">
      <style>{`
        #report-view { 
          max-width: 210mm; 
          margin: 0 auto; 
          background: white; 
          box-shadow: 0 0 50px rgba(0,0,0,0.1); 
          padding: 20mm; 
          box-sizing: border-box;
          overflow: visible;
        }
        .report-section { margin-bottom: 40px; page-break-inside: avoid; width: 100%; }
        .report-table { width: 100%; border-collapse: collapse; border: 2px solid black; font-size: 14px; }
        .report-table th, .report-table td { border: 1px solid black; padding: 10px; text-align: right; }
        .report-table thead th { background: #f1f5f9; font-weight: 900; color: #0f172a; }
        @media print {
          #report-view { box-shadow: none; padding: 10mm; margin: 0; max-width: none; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="sticky top-5 z-[500] bg-white/95 backdrop-blur-md p-5 rounded-3xl shadow-xl border-2 border-black flex flex-wrap justify-between items-center no-print gap-4 pointer-events-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-black transition-all border-2 border-black">
            <Printer size={18} /> הדפס דוח
          </button>
          <button onClick={handleExportToPdf} disabled={isAnalyzing} className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-2xl font-black text-sm hover:bg-red-700 transition-all border-2 border-black shadow-lg disabled:opacity-50">
            {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />} ייצוא PDF
          </button>
          <button onClick={handleExportToWord} disabled={isAnalyzing} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 transition-all border-2 border-black shadow-lg disabled:opacity-50">
            {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />} ייצוא Word
          </button>
          <button onClick={handleExportToMarkdown} className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all border-2 border-black shadow-lg">
            <FileCode size={18} /> ייצוא Markdown
          </button>
          <button onClick={handleGenerateAiAnalysis} disabled={isAnalyzing} className="flex items-center gap-2 px-8 py-3 bg-teal-600 text-white rounded-2xl font-black text-sm hover:bg-teal-700 transition-all shadow-lg border-2 border-black disabled:opacity-50">
            {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />} תובנות AI
          </button>
        </div>
      </div>

      <section className="bg-slate-50 p-10 rounded-[3rem] border-4 border-black no-print space-y-8 shadow-inner pointer-events-auto max-w-4xl mx-auto">
        <div className="flex items-center gap-3 border-b-2 border-black/10 pb-4">
          <div className="bg-slate-900 text-white p-2 rounded-xl border border-black"><Edit3 size={20} /></div>
          <h3 className="text-xl font-black text-slate-800">עורך פרטי דוח</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
          {Object.keys(reportDetails).map((key) => (
            <div key={key} className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mr-2">{CONTEXT_LABELS[key] || key}</label>
              <input type="text" className="w-full bg-white border-2 border-black rounded-xl p-3 text-sm font-bold outline-none" value={(reportDetails as any)[key]} onChange={e => updateDetail(key, e.target.value)} />
            </div>
          ))}
        </div>
      </section>

      <div id="report-view" ref={reportRef}>
        <div className="report-header flex justify-between items-start mb-12 border-b-4 border-black pb-8">
          <div className="text-right">
             <h1 className="text-4xl font-black uppercase tracking-tight mb-2 leading-none text-slate-900">{experiment?.title || 'דוח ניסוי שדה'}</h1>
             <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mt-4">Scientific Field Evaluation Report</p>
          </div>
          <div className="text-left bg-teal-50 p-4 rounded-2xl border-2 border-black">
             <div className="font-black text-teal-800 text-2xl tracking-tighter">LUXEMBOURG</div>
          </div>
        </div>

        <section className="report-section">
           <h2 className="text-xl font-black mb-4 flex items-center gap-2 bg-slate-100 p-2 rounded-lg"><Target size={22} /> 1. מטרת הניסוי והשערות</h2>
           <div className="p-6 border-2 border-black rounded-3xl bg-slate-50/30 text-lg leading-relaxed whitespace-pre-wrap italic font-bold">
              {experiment.hypothesis || "לא הוגדרה מטרת ניסוי."}
           </div>
        </section>

        <section className="report-section">
           <h2 className="text-xl font-black mb-4 flex items-center gap-2 bg-slate-100 p-2 rounded-lg"><Info size={22} /> 2. פרטי רקע ולוח זמנים</h2>
           <table className="report-table">
              <tbody>
                {Object.entries(reportDetails).map(([key, value], idx) => (
                  <tr key={idx}>
                    <td className="w-1/3 bg-slate-50 font-black">{CONTEXT_LABELS[key] || key}</td>
                    <td className="font-bold">{value || '-'}</td>
                  </tr>
                ))}
              </tbody>
           </table>
        </section>

        <section className="report-section">
           <h2 className="text-xl font-black mb-4 flex items-center gap-2 bg-slate-100 p-2 rounded-lg"><FlaskConical size={22} /> 3. פרוטוקול טיפולים</h2>
           <table className="report-table">
              <thead>
                <tr><th className="w-16 text-center">#</th><th>שם הטיפול</th><th>מינונים והרכב</th></tr>
              </thead>
              <tbody>
                {experiment.treatments.map((t) => (
                  <tr key={t.id}>
                    <td className="text-center font-black">{t.number}</td>
                    <td className="font-black">{t.name}</td>
                    <td><div className="flex flex-col gap-1">{t.products.map(p => <div key={p.id} className="text-xs font-bold">{p.name} <span className="text-teal-600">({p.dosage})</span></div>)}</div></td>
                  </tr>
                ))}
              </tbody>
           </table>
        </section>

        <section className="report-section">
           <h2 className="text-xl font-black mb-4 flex items-center gap-2 bg-slate-100 p-2 rounded-lg"><TableProperties size={22} /> 4. תוצאות וניתוח סטטיסטי</h2>
           <table className="report-table text-center">
              <thead>
                <tr>
                  <th rowSpan={2} className="text-right">טיפול</th>
                  {experiment.parameters.map(p => <th key={p.id} colSpan={evalDates.length}>{p.name} ({p.unit})</th>)}
                </tr>
                <tr>
                  {experiment.parameters.map(() => evalDates.map(d => (
                    <th key={d} className="text-[10px] bg-slate-50">{formatDate(d)}<br/>{getDAA(d)}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {experiment.treatments.map(t => (
                  <tr key={t.id}>
                    <td className="text-right font-black">{t.name}</td>
                    {experiment.parameters.map(p => evalDates.map(d => {
                      const stats = calculateTukey(experiment.treatments, experiment.evaluations[d]?.filter(dp => dp.parameterId === p.id) || []);
                      const res = stats[t.id];
                      return <td key={`${p.id}-${d}`} className="font-black">{res ? `${res.mean.toFixed(1)} ${res.letter}` : '-'}</td>;
                    }))}
                  </tr>
                ))}
              </tbody>
           </table>
        </section>

        <section className="report-section">
          <h2 className="text-xl font-black mb-4 flex items-center gap-3 bg-slate-100 p-2 rounded-lg"><BrainCircuit size={28} /> 5. דיון ומסקנות</h2>
          {isAnalyzing ? (
            <div className="flex flex-col items-center py-12 gap-4"><Loader2 className="animate-spin text-teal-600" size={32} /></div>
          ) : (
            <div className="p-8 bg-slate-50 border-2 border-black text-lg whitespace-pre-wrap font-bold shadow-inner rounded-[2rem]">{aiAnalysis || "לא הופק דיון."}</div>
          )}
        </section>

        {imagesAppendix.length > 0 && (
          <section className="report-section mt-24">
            <h2 className="text-xl font-black mb-8 flex items-center gap-2 bg-slate-100 p-2 rounded-lg"><ImageIcon size={22} /> נספח תמונות</h2>
            <div className="grid grid-cols-2 gap-8">
              {imagesAppendix.map((img, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2">
                  <img src={img.photo} className="w-full h-auto rounded-xl border-2 border-black shadow-md object-cover aspect-video" alt="" />
                  <p className="text-[10px] font-black text-slate-500">[ {img.treatment.name} | {formatDate(img.date)} ]</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default ReportGenerator;
