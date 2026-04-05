
import React from 'react';
import { Beaker, BookOpen, Microscope } from 'lucide-react';

interface Props {
  onStart: () => void;
}

const Setup: React.FC<Props> = ({ onStart }) => {
  return (
    <div className="max-w-md mx-auto py-12 px-4 text-center" dir="rtl">
      <div className="w-24 h-24 bg-teal-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl rotate-3">
        <Microscope size={48} />
      </div>
      
      <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">ברוך הבא ל-FieldLab</h1>
      <p className="text-slate-500 mb-12 font-medium">המערכת המתקדמת לניהול ניסויי שדה, איסוף נתונים וניתוח תוצאות מבוסס AI.</p>
      
      <div className="grid grid-cols-1 gap-4 mb-12">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 text-right">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <BookOpen size={24} />
          </div>
          <div>
            <h3 className="font-black text-slate-800">תכנון חכם</h3>
            <p className="text-xs text-slate-400 font-bold">ניהול טיפולים, תכשירים ומינונים בצורה מדויקת.</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 text-right">
          <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Beaker size={24} />
          </div>
          <div>
            <h3 className="font-black text-slate-800">איסוף בשטח</h3>
            <p className="text-xs text-slate-400 font-bold">תיעוד ויזואלי ומספרי של תוצאות הניסוי בזמן אמת.</p>
          </div>
        </div>
      </div>
      
      <button 
        onClick={onStart}
        className="w-full bg-teal-600 text-white py-5 rounded-[2rem] font-black text-xl shadow-xl hover:bg-teal-700 transition-all active:scale-95"
      >
        התחל ניסוי חדש
      </button>
      
      <p className="mt-6 text-[10px] text-slate-300 font-bold uppercase tracking-widest">Powered by Gemini Pro Vision</p>
    </div>
  );
};

export default Setup;
