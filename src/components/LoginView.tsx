import React, { useState } from 'react';
import { Shield, KeyRound, User, ArrowRight, Server, Flame, CheckCircle2, Lock, Users, Laptop } from 'lucide-react';
import { verifyRoom } from '../lib/api';
import { ExamRoom, ParticipantSession } from '../types';

interface LoginViewProps {
  onRoomJoined: (session: ParticipantSession, room: ExamRoom) => void;
  onOpenAdminLogin: () => void;
  connectedPCs: number;
  syncMode: 'server' | 'firebase';
}

export const LoginView: React.FC<LoginViewProps> = ({
  onRoomJoined,
  onOpenAdminLogin,
  connectedPCs,
  syncMode
}) => {
  const [roomNumber, setRoomNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanRoom = roomNumber.trim();
    const cleanPass = passcode.trim();

    if (!cleanRoom || !cleanPass) {
      setError('Please enter both Room Number and Passcode.');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyRoom(cleanRoom, cleanPass);
      if (res.success && res.room) {
        const participantId = `EXM-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        const session: ParticipantSession = {
          role: 'room',
          roomId: res.room.id,
          roomNumber: res.room.roomNumber,
          participantId,
          participantName: name.trim()
        };
        onRoomJoined(session, res.room);
      }
    } catch (err: any) {
      setError(err.message || 'Invalid Room Number or Passcode. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500/30">
      {/* Top Header Bar */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-black text-xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
            +
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-white text-base">Proctor+</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                PORTAL
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Shared Online Examination Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Sync Status Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            <span className="text-slate-300 font-medium">
              {syncMode === 'server' ? 'Built-in Multi-PC Sync' : 'Firebase RTDB Sync'}
            </span>
            <span className="text-[10px] text-slate-500 border-l border-slate-800 pl-2">
              {connectedPCs} PC{connectedPCs === 1 ? '' : 's'} connected
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenAdminLogin}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold text-slate-200 hover:text-white transition-all hover:border-slate-600"
          >
            <Lock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Admin Login</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Grid: Left Presentation, Right Login Form */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Brand & Architecture Info */}
        <div className="lg:col-span-7 space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>Multi-Computer Examination Environment</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-[1.05]">
              Centralized <br />
              <span className="bg-gradient-to-r from-indigo-400 via-indigo-300 to-indigo-100 bg-clip-text text-transparent">
                Examination Proctoring
              </span>
            </h1>

            <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-xl">
              Proctor+ provides instant examination rooms for classrooms, training centers, and corporate assessments. Multiple examinees join with a single Room Number and Passcode to take Google Form exams under proctored lockdown.
            </p>
          </div>

          {/* Key Capabilities */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                <Laptop className="w-4 h-4" />
                <span>Multi-PC Synchronized</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Admins create rooms once; examinees across multiple computers can join simultaneously without configuration hassles.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                <span>Google Forms Embed</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Paste your existing Google Form link. Examinees complete the form within an integrated, distraction-free environment.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                <Shield className="w-4 h-4" />
                <span>Anti-Cheat Proctoring</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Detects tab switching, window minimization, fullscreen exits, and restricted developer shortcuts with admin review flags.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                <Users className="w-4 h-4" />
                <span>Unlimited Submissions</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every computer receives an independent session. No room cap or artificial participant submission locks.
              </p>
            </div>
          </div>
        </div>

        {/* Right Card: Participant Login Form */}
        <div className="lg:col-span-5 w-full">
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-xl">
            {/* Header */}
            <div>
              <span className="text-[11px] font-bold tracking-wider text-indigo-400 uppercase">
                EXAMINEE ACCESS
              </span>
              <h2 className="text-2xl font-bold text-white mt-1">Enter Examination Room</h2>
              <p className="text-xs text-slate-400 mt-1">
                Type the Room Number and Passcode provided by your administrator.
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3 text-xs text-red-300 bg-red-950/60 border border-red-800/80 rounded-xl leading-relaxed">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Room Number
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="e.g. 101202 or MATH-101"
                    className="w-full pl-10 pr-3.5 py-3 bg-slate-950 border border-slate-700/80 rounded-xl text-white font-mono text-base tracking-wider focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Room Passcode
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="e.g. PASS99"
                    className="w-full pl-10 pr-3.5 py-3 bg-slate-950 border border-slate-700/80 rounded-xl text-white font-mono text-base tracking-wider focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Your Full Name or Student ID (Optional)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Maria Santos or STU-4921"
                    className="w-full pl-10 pr-3.5 py-3 bg-slate-950 border border-slate-700/80 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-xl text-white font-bold text-sm shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-50 mt-2"
              >
                <span>{loading ? 'Validating Room...' : 'Enter Examination Room'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Ready for examination</span>
              <span className="text-emerald-400 font-medium">Independent session per PC</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-slate-800/80 text-center text-xs text-slate-500">
        Proctor+ Centralized Examination Portal • Multi-PC Synchronized • Anti-Cheat &amp; Timer Proctored
      </footer>
    </div>
  );
};
