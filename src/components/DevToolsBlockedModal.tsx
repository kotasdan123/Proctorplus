import React from 'react';
import { ShieldAlert, Lock, AlertTriangle, RefreshCw } from 'lucide-react';

interface DevToolsBlockedModalProps {
  onDismissCheck: () => void;
}

export const DevToolsBlockedModal: React.FC<DevToolsBlockedModalProps> = ({ onDismissCheck }) => {
  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-slate-900 border-2 border-red-500/60 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(239,68,68,0.3)] text-center relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Ambient warning aura */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-red-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Circular Spinning Logo with Warning Shield Badge */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-red-500/60 p-1 bg-slate-950 shadow-[0_0_25px_rgba(239,68,68,0.4)] flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Proctor+ Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-full animate-spin-slow pointer-events-none"
            />
          </div>
          <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-xl bg-red-600 border-2 border-slate-900 flex items-center justify-center text-white shadow-lg">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold uppercase tracking-wider mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          <span>PROCTOR+ ANTI-TAMPER SHIELD ACTIVE</span>
        </div>

        {/* Heading */}
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
          Developer Mode Restricted
        </h2>

        {/* Description */}
        <p className="text-slate-300 text-sm leading-relaxed mb-4">
          Browser developer tools and inspect mode have been detected. To safeguard source code, examination integrity, and prevent unauthorized manipulation, portal access is locked while DevTools is active.
        </p>

        {/* Instructions */}
        <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 text-left text-xs space-y-2 mb-6 text-slate-300">
          <div className="flex items-center gap-2 font-bold text-emerald-400">
            <Lock className="w-3.5 h-3.5" />
            <span>How to unlock and continue:</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li>Close the browser Inspect / Developer Tools panel (<kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-200">F12</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-200">Ctrl+Shift+I</kbd>).</li>
            <li>Close any browser console or DOM inspector extensions.</li>
            <li>Once closed, portal access will automatically restore instantly.</li>
          </ul>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={onDismissCheck}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          <RefreshCw className="w-4 h-4" />
          <span>I Have Closed Developer Tools — Resume</span>
        </button>

        <p className="text-[11px] text-slate-500 mt-4">
          Session security is logged and protected by PROCTOR+ Portal Engine.
        </p>
      </div>
    </div>
  );
};
