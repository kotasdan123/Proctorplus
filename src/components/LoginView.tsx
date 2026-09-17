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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header Bar */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-emerald-500/40 p-0.5 bg-slate-900 shadow-md shadow-emerald-500/20 flex-shrink-0">
            <img
              src="/logo.png"
              alt="Proctor+ Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-white text-base">
                Proctor<span className="text-emerald-400">+</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                PORTAL
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Online Examination &amp; Proctoring System</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenAdminLogin}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 hover:text-emerald-400 transition-all hover:border-emerald-500/40"
          >
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Admin Login</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </header>

      {/* Main Grid: Left Presentation, Right Login Form */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Brand & Architecture Info */}
        <div className="lg:col-span-7 space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold tracking-wider uppercase">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>SECURE. SMART. PROCTORED.</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1]">
              Welcome to{' '}
              <span className="inline-block px-3 py-1 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-teal-500/20 border-2 border-emerald-400/60 text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.25)] font-black">
                PROCTOR+
              </span>
            </h1>

            <p className="text-slate-200 text-base sm:text-lg leading-relaxed max-w-2xl font-normal">
              A centralized online examination and proctoring portal designed for secure, organized, and efficient assessments.
            </p>

            <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl">
              Manage examination rooms, monitor active sessions, and provide examinees with a seamless testing experience—all through one reliable platform.
            </p>

            <div className="inline-block px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs sm:text-sm font-semibold text-slate-300">
              <span className="text-emerald-400 font-bold">Your Examination.</span>{' '}
              <span className="text-blue-400 font-bold">Your Room.</span>{' '}
              <span className="text-slate-100 font-bold">Your Secure Assessment.</span>
            </div>
          </div>

          {/* Key Capabilities in Green, Blue, Grey */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-colors">
              <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
                <Laptop className="w-4 h-4 text-blue-400" />
                <span>Multi-PC Synchronized</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Admins create rooms once; examinees across multiple computers join simultaneously with instant live session sync.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-colors">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Google Forms Embed</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Paste your Google Form link. Examinees complete the form in a clean, distraction-free, fullscreen exam environment.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-colors">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                <Shield className="w-4 h-4 text-emerald-300" />
                <span>Anti-Cheat Proctoring</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Detects tab switching, window minimization, fullscreen exits, and restricted shortcuts with automated incident logs.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-colors">
              <div className="flex items-center gap-2 text-blue-300 text-xs font-bold uppercase tracking-wider">
                <Users className="w-4 h-4 text-blue-300" />
                <span>Concurrent Multi-Candidate Testing</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Host simultaneous examinees in real time with synchronized submission tracking and persistent cloud backup.
              </p>
            </div>
          </div>
        </div>

        {/* Right Card: Participant Login Form */}
        <div className="lg:col-span-5 w-full">
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-xl">
            {/* Header */}
            <div>
              <span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
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
                    placeholder="e.g. 123"
                    className="w-full pl-10 pr-3.5 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-base tracking-wider focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors uppercase"
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
                    placeholder="e.g. PASSCODE"
                    className="w-full pl-10 pr-3.5 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-base tracking-wider focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors uppercase"
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
                    className="w-full pl-10 pr-3.5 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 rounded-xl text-white font-bold text-sm shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-50 mt-2"
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
