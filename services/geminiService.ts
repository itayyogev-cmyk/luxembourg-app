
import { GoogleGenAI, Type } from "@google/genai";
import { Experiment, GlobalSettings, ExperimentCategory, COLOR_OPTIONS } from "../types";

const generateSafeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const extractJson = (text?: string): any => {
  if (!text || typeof text !== 'string') return {};
  try {
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = cleanText.indexOf('{');
    const firstBracket = cleanText.indexOf('[');
    let startIdx = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
    } else if (firstBracket === -1 && firstBrace === -1) {
        return {};
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
    }
    
    if (startIdx === -1) {
      return JSON.parse(cleanText || "{}");
    }

    const lastBrace = cleanText.lastIndexOf('}');
    const lastBracket = cleanText.lastIndexOf(']');
    const endIdx = Math.max(lastBrace, lastBracket);
    
    if (endIdx === -1) return JSON.parse(cleanText || "{}");
    
    const jsonStr = cleanText.substring(startIdx, endIdx + 1);
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn("JSON extraction failed, attempting raw parse");
    try { return JSON.parse(text || "{}"); } catch { return {}; }
  }
};

export const suggestExperiment = async (topic: string, category: ExperimentCategory, settings: GlobalSettings): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  
  const dbNames = Object.keys(settings.pesticideDb || {});
  const dbContext = dbNames.length > 0 
    ? `\nחובה להשתמש בשמות התכשירים הבאים בלבד מהמאגר אם הם רלוונטיים: [${dbNames.join(', ')}].\n`
    : "\nאין מאגר תכשירים מוגדר.\n";

  const prompt = `
    תכנן ניסוי שדה מקצועי בתחום ${category} בנושא: "${topic}".
    ${dbContext}
    
    הוראות חשובות:
    1. בדוק אם הבקשה הגיונית וקשורה לחקלאות/ניסויים. אם התיאור אינו הגיוני, חסר פרטים מהותיים או לא קשור לתחום, החזר את הערך 'insufficient_info' בשדה ה-"error".
    2. אם הבקשה תקינה: זהה את מטרות הניסוי (עשבים ספציפיים, מחלות או מזיקים) והחזר אותם ב-"parameters".
    3. הבדל בין "תכשיר" (החומר הכימי) לבין "פרמטר" (העשב/מזיק שנבדק).
    4. החזר JSON תקין בעברית בלבד לפי המבנה המבוקש.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            error: { type: Type.STRING },
            hypothesis: { type: Type.STRING },
            parameters: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }
            },
            variables: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  unit: { type: Type.STRING }
                },
                required: ["name", "unit"]
              }
            },
            treatments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  products: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        dosage: { type: Type.STRING }
                      },
                      required: ["name", "dosage"]
                    }
                  },
                  adjuvantName: { type: Type.STRING },
                  adjuvantConcentration: { type: Type.STRING }
                },
                required: ["name", "products"]
              }
            },
            targetSpecies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING }
                },
                required: ["name"]
              }
            }
          },
          required: ["hypothesis", "parameters", "variables", "treatments", "targetSpecies"]
        }
      }
    });

    const result = extractJson(response.text);
    
    if (result.error === 'insufficient_info') {
      return { error: 'insufficient_info' };
    }

    const db = settings.pesticideDb || {};
    
    return {
      hypothesis: result.hypothesis || "לא הוגדרה השערה",
      parameters: (result.parameters || []).map((p: string) => ({
        id: generateSafeId(),
        name: p,
        unit: '%'
      })),
      variables: (result.variables || []).map((v: any) => ({ 
        id: generateSafeId(), 
        name: v.name || "מדד",
        unit: v.unit || ""
      })),
      targetSpecies: (result.targetSpecies || []).map((s: any) => ({ 
        id: generateSafeId(),
        name: s.name || "מטרה"
      })),
      treatments: (result.treatments || []).map((t: any, idx: number) => ({
        id: generateSafeId(),
        number: idx + 1,
        name: t.name || `טיפול ${idx + 1}`,
        colors: [COLOR_OPTIONS[idx % COLOR_OPTIONS.length].name],
        isControl: (t.name || "").includes('ביקורת'),
        adjuvantName: t.adjuvantName || '',
        adjuvantConcentration: t.adjuvantConcentration || '',
        products: (t.products || []).map((p: any) => {
          const entry = db[p.name];
          const ais = [];
          if (entry) {
            if (entry.ai1) ais.push(`${entry.ai1} (${entry.amt1})`);
            if (entry.ai2) ais.push(`${entry.ai2} (${entry.amt2})`);
          }
          return {
            id: generateSafeId(),
            name: p.name || "",
            activeIngredient: entry ? ais.join(', ') : "לא נמצא במאגר",
            formulation: entry ? entry.formulation : "-",
            dosage: p.dosage || ""
          };
        })
      }))
    };
  } catch (error) {
    console.error("Suggestion Error:", error);
    throw error;
  }
};

export const generateReportAnalysis = async (experiment: Experiment, settings: GlobalSettings): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  
  const summaryContext = experiment.parameters.map(p => {
    return `Parameter: ${p.name} (${p.unit}):\n` + 
      Object.keys(experiment.evaluations).sort().map(date => {
        const dayData = experiment.evaluations[date];
        const means = experiment.treatments.map(t => {
          const vals = dayData.filter(d => d.treatmentId === t.id && d.parameterId === p.id).map(d => Number(d.value)).filter(v => !isNaN(v));
          const mean = vals.length > 0 ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(2) : "N/A";
          return `  - Treatment ${t.name}: Mean = ${mean}`;
        }).join('\n');
        return `Date: ${date}\n${means}`;
      }).join('\n');
  }).join('\n\n');

  const prompt = `You are a professional agronomist. Analyze the following Master Table results from the field trial "${experiment.title}":
${summaryContext}

Instructions:
1. Provide exactly a 3-sentence summary in Hebrew.
2. Specifically identify the best-performing treatment(s) based on the means.
3. Note if any phytotoxicity (פיטוטוקסיות) or negative trends are observed.
4. Do not mention data not explicitly in the summary context above.
5. Use a professional, scientific tone.`;

  try {
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text || "לא התקבל ניתוח.";
  } catch (error) { 
    return "שגיאה בניתוח הנתונים."; 
  }
};

export const analyzeReportStyle = async (sampleText?: string, sampleImages?: {data: string, mimeType: string}[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  const parts: any[] = [{ text: "נתח את הסגנון הכתיבה והמבנה של הדוח הבא בעברית." }];
  if (sampleText) parts.push({ text: sampleText });
  if (sampleImages) sampleImages.forEach(img => parts.push({ inlineData: img }));

  try {
    const response = await ai.models.generateContent({ model, contents: { parts } });
    return response.text || "";
  } catch (error) { return "שגיאה בניתוח סגנון."; }
};

export const extractDataFromImage = async (base64Image: string, mimeType: string): Promise<any[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  
  const prompt = `Analyze the provided image of a hierarchical field experiment research table.
Structure:
- The table has a hierarchical structure. One treatment name (usually on the far right or left) corresponds to 4 rows (Repetitions 1-4).
- Each repetition row contains 10 numerical samples spread across 10 sub-columns for a specific parameter.

Instructions:
1. Identify the treatment name for the block.
2. Identify the repetition number (1-4).
3. Extract all 10 sample values for the parameter.
4. For each sample, assess your confidence based on visual clarity and handwriting quality. If the handwriting is messy, ambiguous, or damaged, mark 'uncertain': true for that specific sample.

Return a flat JSON array of objects.
Output ONLY a valid JSON array.`;

  try {
    // Fix: Providing responseSchema for robust JSON extraction from hierarchical data.
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { data: base64Image, mimeType } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        // Using thinkingConfig to allow the model more reasoning budget for complex visual table extraction.
        thinkingConfig: { thinkingBudget: 4000 },
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              treatmentName: { type: Type.STRING },
              repNumber: { type: Type.INTEGER },
              parameterName: { type: Type.STRING },
              samples: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    value: { type: Type.NUMBER },
                    uncertain: { type: Type.BOOLEAN }
                  },
                  required: ["uncertain"]
                }
              }
            },
            required: ["treatmentName", "repNumber", "parameterName", "samples"]
          }
        }
      }
    });
    
    const result = extractJson(response.text);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("OCR extraction error:", error);
    throw error;
  }
};
