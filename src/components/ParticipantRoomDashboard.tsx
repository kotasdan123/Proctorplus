import React, { useState } from 'react';
import { ExamRoom, ExamAttempt, ParticipantSession } from '../types';
import { Clock, ShieldCheck, Users, LogOut, ArrowRight, Play, CheckCircle2, AlertCircle } from 'lucide-react';

interface ParticipantRoomDashboardProps {
  room: ExamRoom;
  session: ParticipantSession;
  attempts: ExamAttempt[];
  onStartExam: () => void;
  onLogout: () => void;
}

export const ParticipantRoomDashboard: React.FC<ParticipantRoomDashboardProps> = ({
  room,
  session,
  attempts,
  onStartExam,
  onLogout
}) => {
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const ownAttempts = attempts.filter(
    (a) => a.examId === room.id && a.participantId === session.participantId
  );

  const liveAttemptsCount = attempts.filter(
    (a) => a.examId === room.id && a.status === 'In Progress'
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-lg shadow-indigo-600/30">
            +
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-indigo-400 uppercase">
                EXAMINATION ROOM
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                ACTIVE
              </span>
            </div>
            <h1 className="text-lg font-bold text-white leading-tight">
              {room.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <div className="text-xs font-semibold text-white">
              {session.participantName || session.participantId}
            </div>
            <div className="text-[11px] text-slate-400">
              Room {room.roomNumber}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Leave Room</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Room Welcome Hero */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/20 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <span className="text-xs font-bold tracking-wider text-indigo-400 uppercase">
                SHARED ROOM • MULTI-PC ACCESS
              </span>
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-semibold text-slate-400">ROOM NUMBER</span>
                <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-wider">
                  {room.roomNumber}
                </span>
              </div>
              <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
                {room.description || 'Welcome to this shared examination room. Other participants can join simultaneously using the same Room Number and Passcode.'}
              </p>
            </div>

            <div className="flex flex-col items-center sm:items-end justify-center p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex-shrink-0 min-w-[140px]">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-2xl">
                <Users className="w-5 h-5" />
                <span>{liveAttemptsCount}</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5">Examinees live now</span>
            </div>
          </div>
        </div>

        {/* Exam Specifications */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Clock className="w-4 h-4" />
              <span>Timer</span>
            </div>
            <div className="text-lg font-bold text-white">
              {room.timerEnabled ? `${room.durationMinutes} min` : 'No Timer'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Anti-Cheat</span>
            </div>
            <div className="text-lg font-bold text-white">
              {room.antiCheat ? 'Enabled' : 'Disabled'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Your Sessions
            </div>
            <div className="text-lg font-bold text-white">
              {ownAttempts.length}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Passcode
            </div>
            <div className="text-lg font-mono font-bold text-indigo-300">
              {room.passcode}
            </div>
          </div>
        </div>

        {/* Start Action Panel */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white mb-1">
              Ready to Begin Your Examination?
            </h3>
            <p className="text-xs text-slate-400 max-w-md">
              The Google Form will open inside a full-screen lockdown interface with countdown timer and proctoring.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInstructionsOpen(true)}
            className="px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-2xl text-white font-bold text-sm shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 flex-shrink-0 transition-all hover:scale-[1.02]"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Start Examination</span>
          </button>
        </div>

        {/* Your Previous Sessions Table */}
        {ownAttempts.length > 0 && (
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              Your Activity in this Room
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Session ID</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Violations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {ownAttempts.map((attempt) => (
                    <tr key={attempt.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-mono text-slate-300">{attempt.id}</td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {new Date(attempt.startedAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          attempt.status === 'Completed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : attempt.status === 'Time Expired'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-indigo-500/10 text-indigo-400'
                        }`}>
                          {attempt.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{attempt.violations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Instructions Modal Before Start */}
      {instructionsOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Examination Instructions</h3>
            <p className="text-xs text-slate-400 mb-4">
              Please read the proctoring guidelines before launching the exam:
            </p>

            <ul className="space-y-2.5 text-xs text-slate-300 mb-6 bg-slate-800/40 p-4 rounded-xl border border-slate-800">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <span>
                  {room.timerEnabled
                    ? `You will have exactly ${room.durationMinutes} minutes to complete this attempt.`
                    : 'No countdown timer is enforced.'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <span>
                  {room.antiCheat
                    ? `Anti-cheat monitoring is active. Do not exit fullscreen, switch browser tabs, or minimize the window.`
                    : 'Standard proctoring is enabled.'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <span>Complete and submit the Google Form before clicking "Submit Exam".</span>
              </li>
            </ul>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setInstructionsOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setInstructionsOpen(false);
                  onStartExam();
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/20"
              >
                I Understand, Start Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
