import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface SecurityToastProps {
  message: string | null;
  onClose: () => void;
}

export const SecurityToast: React.FC<SecurityToastProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[99998] max-w-sm w-full bg-slate-900 border-2 border-emerald-500/80 rounded-2xl p-4 shadow-[0_10px_35px_rgba(0,0,0,0.7)] animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 flex-shrink-0 mt-0.5">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
              PROCTOR+ SHIELD
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-slate-200 leading-snug">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
};
