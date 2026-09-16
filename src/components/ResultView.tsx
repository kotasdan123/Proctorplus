import React from 'react';
import { ExamRoom } from '../types';
import { CheckCircle2, Clock, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';

interface ResultViewProps {
  room: ExamRoom;
  result: {
    status: 'Completed' | 'Time Expired';
    violations: number;
    durationSeconds: number;
  };
  onReturn: () => void;
}

export const ResultView: React.FC<ResultViewProps> = ({ room, result, onReturn }) => {
  const isTimeExpired = result.status === 'Time Expired';

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins} min ${secs} sec`;
    }
    return `${secs} seconds`;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Status Icon */}
        <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-xl ${
          isTimeExpired
            ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-amber-500/10'
            : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-emerald-500/10'
        }`}>
          {isTimeExpired ? <Clock className="w-10 h-10" /> : <CheckCircle2 className="w-10 h-10" />}
        </div>

        <span className={`text-[11px] font-bold tracking-widest uppercase px-3 py-1 rounded-full border ${
          isTimeExpired
            ? 'bg-amber-950/60 border-amber-800 text-amber-400'
            : 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
        }`}>
          {isTimeExpired ? 'TIME EXPIRED' : 'EXAMINATION COMPLETED'}
        </span>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-4 mb-2 tracking-tight">
          {isTimeExpired ? 'Your Time Has Ended' : 'Thank You For Taking The Exam!'}
        </h1>

        <p className="text-sm text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
          {isTimeExpired
            ? 'The allotted examination time elapsed. Your session was automatically recorded and finalized.'
            : 'Your examination answers and proctoring session have been recorded successfully.'}
        </p>

        {/* Summary Details Grid */}
        <div className="grid grid-cols-2 gap-3 text-left mb-8">
          <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Examination
            </span>
            <strong className="text-sm text-white font-semibold line-clamp-1">
              {room.title}
            </strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Room Number
            </span>
            <strong className="text-sm font-mono text-indigo-300 font-semibold">
              {room.roomNumber}
            </strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Duration Taken
            </span>
            <strong className="text-sm text-slate-200 font-semibold">
              {formatDuration(result.durationSeconds)}
            </strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Violations Logged
            </span>
            <strong className={`text-sm font-semibold ${result.violations > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {result.violations} violation{result.violations === 1 ? '' : 's'}
            </strong>
          </div>
        </div>

        {/* Return Button */}
        <button
          type="button"
          onClick={onReturn}
          className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-2xl text-white font-bold text-sm shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
        >
          <span>Return to Room Lobby</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
