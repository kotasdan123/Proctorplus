import React from 'react';
import { Shield } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
  subtext?: string;
  fullScreen?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Securing Portal & Loading...',
  subtext = 'PROCTOR+ Centralized Examination Environment',
  fullScreen = true
}) => {
  const content = (
    <div className="flex flex-col items-center justify-center text-center px-4 select-none">
      {/* High-Tech Circular Spinning Logo Container */}
      <div className="relative flex items-center justify-center w-36 h-36 sm:w-44 sm:h-44 mb-6">
        {/* Ambient Pulse Glow */}
        <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-2xl animate-pulse-ring" />

        {/* Outer Orbital Rotating Ring 1 - Emerald/Cyan */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 border-r-blue-400 animate-spin" />

        {/* Outer Orbital Rotating Ring 2 - Reverse Slate/Blue */}
        <div className="absolute inset-2 rounded-full border border-dashed border-slate-700 border-b-cyan-400 animate-spin-reverse" />

        {/* Circular Glowing Emblem Mask */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full p-1 bg-slate-900/90 border-2 border-emerald-500/60 shadow-[0_0_30px_rgba(16,185,129,0.35)] flex items-center justify-center overflow-hidden">
          {/* Circular Spinning Logo */}
          <img
            src="/logo.png"
            alt="Proctor+ Logo"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover rounded-full animate-spin-slow pointer-events-none drop-shadow-md"
          />
        </div>

        {/* Mini orbiting security node */}
        <div className="absolute top-1 right-3 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399] animate-ping" />
      </div>

      {/* Brand Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-extrabold text-white text-xl sm:text-2xl tracking-tight">
          Proctor<span className="text-emerald-400">+</span>
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          PROCTOR PLUSS
        </span>
      </div>

      {/* Dynamic Status Message */}
      <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-wide mb-1">
        {message}
      </h3>
      <p className="text-xs text-slate-400 max-w-sm mb-6">
        {subtext}
      </p>

      {/* Animated Loading Bar */}
      <div className="w-56 sm:w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
        <div className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-400 rounded-full animate-[shimmer_1.8s_infinite] w-2/3 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
      </div>

      {/* Security Status Tag */}
      <div className="mt-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-[11px] font-medium text-slate-400">
        <Shield className="w-3.5 h-3.5 text-emerald-400" />
        <span>Hardware &amp; Browser Anti-Cheat Active</span>
      </div>
    </div>
  );

  if (!fullScreen) {
    return (
      <div className="min-h-[350px] w-full flex items-center justify-center py-12">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center transition-opacity duration-300">
      {content}
    </div>
  );
};
