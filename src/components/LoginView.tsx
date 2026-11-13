import React, { useEffect, useRef, useState } from 'react';
import { Shield, KeyRound, User, ArrowRight, Lock, Mail } from 'lucide-react';
import { verifyRoom, recordRoomVisit } from '../lib/api';
import { ExamRoom, ParticipantSession } from '../types';
import { LoadingScreen } from './LoadingScreen';

interface LoginViewProps {
  onRoomJoined: (session: ParticipantSession, room: ExamRoom) => void;
  onOpenProctorLogin: () => void;
  onOpenAdminLogin?: () => void;
  connectedPCs: number;
  syncMode: 'server' | 'firebase';
}

const AnimatedLoginBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    const pointer = { x: -9999, y: -9999 };

    interface ParticleNode {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      tone: 'emerald' | 'blue' | 'slate';
    }

    let nodes: ParticleNode[] = [];

    const buildNodes = (w: number, h: number) => {
      const targetCount = Math.min(54, Math.max(24, Math.floor((w * h) / 28000)));
      const tones: Array<'emerald' | 'blue' | 'slate'> = ['emerald', 'blue', 'emerald', 'slate'];
      nodes = Array.from({ length: targetCount }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.42,
        vy: (Math.random() - 0.5) * 0.42,
        radius: 1.3 + Math.random() * 1.4,
        tone: tones[i % tones.length]
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildNodes(width, height);
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };

    const onPointerLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    const drawFrame = () => {
      ctx.clearRect(0, 0, width, height);

      const maxDist = 148;
      const pointerDist = 180;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if (!prefersReducedMotion) {
          node.x += node.vx;
          node.y += node.vy;

          if (node.x < 0 || node.x > width) node.vx *= -1;
          if (node.y < 0 || node.y > height) node.vy *= -1;
          node.x = Math.max(0, Math.min(width, node.x));
          node.y = Math.max(0, Math.min(height, node.y));

          // Gentle pointer repulsion/parallax
          const dxp = node.x - pointer.x;
          const dyp = node.y - pointer.y;
          const dp = Math.hypot(dxp, dyp);
          if (dp > 1 && dp < pointerDist) {
            const push = (1 - dp / pointerDist) * 0.018;
            node.x += (dxp / dp) * push * 18;
            node.y += (dyp / dp) * push * 18;
          }
        }

        // Draw links between nearby nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const other = nodes[j];
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.hypot(dx, dy);

          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.22;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle =
              node.tone === 'blue' || other.tone === 'blue'
                ? `rgba(56, 189, 248, ${alpha * 0.85})`
                : `rgba(16, 185, 129, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        // Draw pointer link if close
        const pdx = node.x - pointer.x;
        const pdy = node.y - pointer.y;
        const pdist = Math.hypot(pdx, pdy);
        if (pdist < pointerDist) {
          const pAlpha = (1 - pdist / pointerDist) * 0.3;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.strokeStyle = `rgba(52, 211, 153, ${pAlpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Draw node dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        if (node.tone === 'emerald') {
          ctx.fillStyle = 'rgba(52, 211, 153, 0.55)';
        } else if (node.tone === 'blue') {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
        }
        ctx.fill();
      }

      if (!prefersReducedMotion) {
        animationFrameId = window.requestAnimationFrame(drawFrame);
      }
    };

    resize();
    drawFrame();

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerleave', onPointerLeave);

    return () => {
      if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden z-0"
    >
      {/* Drifting Architectural Grid */}
      <div className="absolute -inset-16 bg-login-grid animate-grid-drift opacity-55 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_45%,#000_35%,transparent_100%)]" />

      {/* Moving Ambient Gradient Fields */}
      <div className="absolute -top-36 -left-32 w-[42rem] h-[42rem] rounded-full bg-emerald-500/15 blur-3xl animate-aurora-a" />
      <div className="absolute -bottom-44 -right-32 w-[44rem] h-[44rem] rounded-full bg-sky-500/15 blur-3xl animate-aurora-b" />

      {/* Sweeping Light Beam */}
      <div className="absolute top-1/4 -left-1/4 w-[140%] h-40 bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent blur-2xl animate-beam-sweep" />

      {/* Interactive Synchronized Constellation Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Soft Vignette for Content Contrast */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/35 via-transparent to-slate-950/75" />
    </div>
  );
};

export const LoginView: React.FC<LoginViewProps> = ({
  onRoomJoined,
  onOpenProctorLogin,
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
        // Record visit for room analytics
        recordRoomVisit(res.room.id).catch(() => {});

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
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500/30 selection:text-emerald-200 overflow-x-hidden">
      <AnimatedLoginBackground />

      {/* Top Header Bar */}
      <header className="relative z-10 px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md">
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
          {/* Proctor Login */}
          <button
            type="button"
            onClick={onOpenProctorLogin || onOpenAdminLogin}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 hover:text-emerald-400 transition-all hover:border-emerald-500/40 shadow-sm"
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Proctor Login</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </header>

      {/* Main Grid: Left Presentation, Right Login Form */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
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

            <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-2xl font-normal">
              Manage examination rooms, monitor active sessions, and provide examinees with a seamless testing experience, all through one reliable platform.
            </p>

            <div className="inline-block px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs sm:text-sm font-semibold text-slate-300">
              <span className="text-emerald-400 font-bold">Your Examination.</span>{' '}
              <span className="text-blue-400 font-bold">Your Room.</span>{' '}
              <span className="text-slate-100 font-bold">Your Secure Assessment.</span>
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
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-4 border-t border-slate-800/80 bg-slate-950/50 backdrop-blur-sm text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2 gap-y-1">
            <span>Proctor+ Centralized Examination Portal</span>
            <span aria-hidden="true">•</span>
            <span>All rights reserved 2026</span>
            <span aria-hidden="true">•</span>
            <span className="text-slate-400 font-medium">Version 1.0.0</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="text-slate-400">Contact Admin:</span>
            <a
              href="mailto:danielgabrielroda@sixeleven.com"
              className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              danielgabrielroda@sixeleven.com
            </a>
          </div>
        </div>
      </footer>

      {/* Login Progress Loading Screen */}
      {loading && (
        <LoadingScreen
          message="Authenticating Examination Room..."
          subtext="Verifying Room ID, Passcode & Candidate Access"
        />
      )}
    </div>
  );
};
