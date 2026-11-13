import React, { useState } from 'react';
import {
  ExamRoom,
  ExamAttempt,
  SecurityViolation,
  SystemConfig,
  AdminSession
} from '../types';
import {
  LayoutDashboard,
  Grid,
  FileSpreadsheet,
  ShieldAlert,
  BarChart3,
  Settings,
  Plus,
  LogOut,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Edit2,
  Trash2,
  Power,
  Flame,
  Server,
  Users,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Lock,
  KeyRound,
  Table,
  AlertTriangle,
  Calculator,
  Calendar
} from 'lucide-react';
import { RoomModal } from './RoomModal';
import { FirebaseConfigModal } from './FirebaseConfigModal';
import { SheetBoard } from './SheetBoard';
import { LoadingScreen } from './LoadingScreen';
import {
  updateAdminCredentials,
  resetAllToDefault,
  deleteAttempt,
  deleteMultipleAttempts,
  deleteAllAttempts,
  deleteViolation,
  deleteMultipleViolations,
  deleteAllViolations
} from '../lib/api';

interface AdminPortalProps {
  adminSession: AdminSession;
  rooms: ExamRoom[];
  attempts: ExamAttempt[];
  violations: SecurityViolation[];
  systemConfig: SystemConfig | null;
  connectedPCs: number;
  onLogout: () => void;
  onCreateRoom: (roomData: Partial<ExamRoom>) => Promise<void>;
  onUpdateRoom: (id: string, roomData: Partial<ExamRoom>) => Promise<void>;
  onDeleteRoom: (id: string) => Promise<void>;
  onConfigUpdated: (config: SystemConfig) => void;
  roomsError?: string | null;
  onRetryLoadRooms?: () => void;
  onResetAllToDefault?: () => Promise<void>;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  adminSession,
  rooms,
  attempts,
  violations,
  systemConfig,
  connectedPCs,
  onLogout,
  onCreateRoom,
  onUpdateRoom,
  onDeleteRoom,
  onConfigUpdated,
  roomsError,
  onRetryLoadRooms,
  onResetAllToDefault
}) => {
  const [currentPage, setCurrentPage] = useState<
    'dashboard' | 'rooms' | 'submissions' | 'violations' | 'analytics' | 'settings'
  >('dashboard');
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'metrics' | 'sheet'>('metrics');
  const [tabLoading, setTabLoading] = useState<{ active: boolean; label: string } | null>(null);

  // Danger Zone Factory Reset state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  // Submissions & Violations Selection & Deletion state
  const [selectedAttemptIds, setSelectedAttemptIds] = useState<Set<string>>(new Set());
  const [selectedViolationIds, setSelectedViolationIds] = useState<Set<string>>(new Set());
  const [deleteAttemptsModalOpen, setDeleteAttemptsModalOpen] = useState(false);
  const [deleteViolationsModalOpen, setDeleteViolationsModalOpen] = useState(false);
  const [deleteActionLoading, setDeleteActionLoading] = useState(false);
  const [portalToast, setPortalToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setPortalToast(msg);
    setTimeout(() => setPortalToast(null), 4000);
  };

  const handleNavigateTab = (
    target: 'dashboard' | 'rooms' | 'submissions' | 'violations' | 'analytics' | 'settings' | 'sheet',
    customLabel?: string
  ) => {
    let resolvedTarget: 'dashboard' | 'rooms' | 'submissions' | 'violations' | 'analytics' | 'settings' = target === 'sheet' ? 'analytics' : target;
    if (target === 'sheet') {
      setAnalyticsSubTab('sheet');
    }
    if (resolvedTarget === currentPage && target !== 'sheet') return;
    const labels: Record<string, string> = {
      dashboard: 'Switching to Overview Dashboard...',
      rooms: 'Loading Examination Rooms...',
      submissions: 'Loading Examinee Submissions...',
      sheet: 'Opening Live Spreadsheet Board in Analytics...',
      violations: 'Loading Security Violations Log...',
      analytics: 'Computing Examination Analytics...',
      settings: 'Loading Portal Security & Cloud Config...'
    };
    setTabLoading({ active: true, label: customLabel || labels[target] || 'Loading Tab...' });
    setTimeout(() => {
      setCurrentPage(resolvedTarget);
      setTabLoading(null);
    }, 380);
  };

  const handleExecuteReset = async () => {
    if (resetConfirmInput.trim().toUpperCase() !== 'RESET') return;
    setResetLoading(true);
    try {
      await resetAllToDefault();
      if (onResetAllToDefault) {
        await onResetAllToDefault();
      }
      setResetModalOpen(false);
      setResetConfirmInput('');
      setResetSuccessMsg('All examination rooms, submissions, and violations have been deleted, and proctor accounts have been restored to factory default.');
      setCurrentPage('dashboard');
      setTimeout(() => setResetSuccessMsg(null), 7000);
    } catch (err: any) {
      alert(`Reset operation failed: ${err.message || 'Unknown error'}`);
    } finally {
      setResetLoading(false);
    }
  };

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ExamRoom | null>(null);
  const [firebaseModalOpen, setFirebaseModalOpen] = useState(false);
  const [viewRoomModal, setViewRoomModal] = useState<ExamRoom | null>(null);

  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwChangeLoading, setPwChangeLoading] = useState(false);
  const [pwChangeMsg, setPwChangeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwChangeMsg(null);
    if (!newPw) {
      setPwChangeMsg({ type: 'error', text: 'New password cannot be empty.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwChangeMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setPwChangeLoading(true);
    try {
      await updateAdminCredentials({
        currentPassword: currentPw,
        newPassword: newPw
      });
      setPwChangeMsg({ type: 'success', text: 'Administrator password updated successfully!' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      setPwChangeMsg({ type: 'error', text: err.message || 'Failed to update password' });
    } finally {
      setPwChangeLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Live Progress Calculation: Filter out stale or abandoned attempts
  const isTrulyLive = (a: ExamAttempt) => {
    if (a.status !== 'In Progress') return false;
    const room = rooms.find((r) => r.id === a.examId);
    const durationMs = ((room?.durationMinutes || 60) + 15) * 60 * 1000;
    return Date.now() - a.startedAt <= durationMs;
  };

  // Metrics
  const activeRooms = rooms.filter((r) => r.active).length;
  const liveSessions = attempts.filter(isTrulyLive).length;
  const completedSessions = attempts.filter((a) => a.status === 'Completed').length;
  const expiredSessions = attempts.filter((a) => a.status === 'Time Expired' || (a.status === 'In Progress' && !isTrulyLive(a))).length;
  const uniqueExaminees = new Set(attempts.map((a) => a.participantId)).size;
  const completionRate = attempts.length > 0 ? Math.round((completedSessions / attempts.length) * 100) : 0;
  const totalRoomVisits = rooms.reduce((sum, r) => sum + (r.visitsCount || 0), 0);

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const getAvailability = (room: ExamRoom) => {
    const now = Date.now();
    const availabilityEnabled = room.availabilityEnabled !== false && Boolean(room.startAt || room.endAt);
    if (availabilityEnabled && room.endAt) {
      const endMs = new Date(room.endAt).getTime();
      if (!isNaN(endMs) && now >= endMs) {
        return { status: 'Force-Closed (Ended)', color: 'text-red-300 bg-red-950/60 border-red-800/70' };
      }
    }
    if (!room.active) return { status: 'Closed', color: 'text-slate-400 bg-slate-800' };
    if (!availabilityEnabled) {
      return { status: 'Open Anytime', color: 'text-emerald-400 bg-emerald-950/60' };
    }
    if (room.startAt && new Date(room.startAt).getTime() > now) {
      return { status: 'Upcoming', color: 'text-blue-400 bg-blue-950/60' };
    }
    return { status: 'Open', color: 'text-emerald-400 bg-emerald-950/60' };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Left Navigation Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between hidden md:flex flex-shrink-0">
        <div className="p-6 space-y-6">
          {/* Brand */}
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
              <span className="font-extrabold tracking-tight text-white text-base">
                Proctor<span className="text-emerald-400">+</span>
              </span>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Proctor Control Center</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              type="button"
              onClick={() => handleNavigateTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'dashboard'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => handleNavigateTab('rooms')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'rooms'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>Rooms &amp; Exams</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300">
                {rooms.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleNavigateTab('submissions')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'submissions'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Submissions</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300">
                {attempts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleNavigateTab('violations')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'violations'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Security Events</span>
              {violations.length > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-red-950 text-red-300 font-bold border border-red-800">
                  {violations.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleNavigateTab('analytics')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'analytics'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </button>

            <button
              type="button"
              onClick={() => handleNavigateTab('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'settings'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings &amp; Firebase</span>
            </button>
          </nav>
        </div>

        {/* User Mini Profile & Logout */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400 text-xs">
              A
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">{adminSession.name}</div>
              <div className="text-[10px] text-emerald-400 font-bold uppercase truncate">Exam Proctor</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-950/30 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 px-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile Nav Select */}
            <div className="md:hidden">
              <select
                value={currentPage}
                onChange={(e) => handleNavigateTab(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-white"
              >
                <option value="dashboard">Dashboard</option>
                <option value="rooms">Rooms &amp; Exams ({rooms.length})</option>
                <option value="submissions">Submissions ({attempts.length})</option>
                <option value="violations">Security Events ({violations.length})</option>
                <option value="analytics">Analytics</option>
                <option value="settings">Settings &amp; Firebase</option>
              </select>
            </div>
            <h2 className="text-base font-bold text-white capitalize hidden sm:block">
              {currentPage === 'settings'
                ? 'System Settings & Firebase'
                : currentPage === 'analytics'
                ? 'Examination Analytics & Google Sheet'
                : currentPage}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Sync Badge */}
            <div
              onClick={() => setFirebaseModalOpen(true)}
              className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-xs text-slate-300 transition-colors"
              title="Google Cloud Firestore Database Connected"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
              <span className="hidden sm:inline">
                Google Cloud Database Synced
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold underline">Firestore</span>
            </div>

            {/* Create Room Button */}
            <button
              type="button"
              onClick={() => {
                setEditingRoom(null);
                setCreateModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" />
              <span>Create Room</span>
            </button>
          </div>
        </header>

        {/* Dynamic Pages */}
        <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* =========================================================
              1. DASHBOARD PAGE
             ========================================================= */}
          {currentPage === 'dashboard' && (
            <div className="space-y-6">
              {/* Hero Banner */}
              <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 block mb-1">
                    EXAMINATION CONTROL CENTER
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                    Operations Dashboard
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                    Manage shared examination rooms, monitor live examinee sessions across multiple computers, and review anti-cheat flags.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRoom(null);
                      setCreateModalOpen(true);
                    }}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Examination Room</span>
                  </button>
                </div>
              </div>

              {/* KPI Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Total Rooms
                  </span>
                  <strong className="text-2xl font-bold text-white">{rooms.length}</strong>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Active Rooms
                  </span>
                  <strong className="text-2xl font-bold text-emerald-400">{activeRooms}</strong>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Live Examinees
                  </span>
                  <strong className="text-2xl font-bold text-blue-400">{liveSessions}</strong>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Total Submissions
                  </span>
                  <strong className="text-2xl font-bold text-emerald-400">{completedSessions}</strong>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Total Examinees
                  </span>
                  <strong className="text-2xl font-bold text-white">{uniqueExaminees}</strong>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Violations Logged
                  </span>
                  <strong className="text-2xl font-bold text-amber-400">{violations.length}</strong>
                </div>
              </div>

              {/* Progress and Multi-PC sync status */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        COMPLETION METRIC
                      </span>
                      <h3 className="text-base font-bold text-white">Overall Completion Rate</h3>
                    </div>
                    <span className="text-3xl font-black text-emerald-400">{completionRate}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-blue-400 transition-all duration-500"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span>{completedSessions} completed submissions</span>
                    <span>{attempts.length} total recorded sessions</span>
                  </div>
                </div>

                <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    SHARED ACCESS MODEL
                  </span>
                  <h3 className="text-base font-bold text-white">Multi-Computer Real-Time Sync</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Rooms created here are available immediately to any computer opening this portal. Examinees join with Room Number and Passcode to take the Google Form with live timer and anti-cheat proctoring.
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
                      <strong className="text-lg font-bold text-white block">∞</strong>
                      <span className="text-[10px] text-slate-400">No Submission Cap</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
                      <strong className="text-lg font-bold text-emerald-400 block">LIVE</strong>
                      <span className="text-[10px] text-slate-400">Independent Sessions</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
                      <strong className="text-lg font-bold text-blue-400 block">{rooms.length}</strong>
                      <span className="text-[10px] text-slate-400">Available Rooms</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity Table */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      LATEST SESSIONS
                    </span>
                    <h3 className="text-base font-bold text-white">Recent Examination Activity</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigateTab('submissions')}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    View All Submissions &gt;
                  </button>
                </div>

                {attempts.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-500">
                    No examination sessions recorded yet. Examinees will appear here once they start an exam.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-3 px-3">Participant</th>
                          <th className="py-3 px-3">Room</th>
                          <th className="py-3 px-3">Exam Title</th>
                          <th className="py-3 px-3">Started</th>
                          <th className="py-3 px-3">Duration</th>
                          <th className="py-3 px-3">Status</th>
                          <th className="py-3 px-3">Violations</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {attempts.slice(0, 8).map((attempt) => (
                          <tr key={attempt.id} className="hover:bg-slate-800/30">
                            <td className="py-3 px-3 font-medium text-white">
                              {attempt.participantName ? `${attempt.participantName} (${attempt.participantId})` : attempt.participantId}
                            </td>
                            <td className="py-3 px-3 font-mono text-emerald-300 font-bold">{attempt.roomNumber}</td>
                            <td className="py-3 px-3 text-slate-300">{attempt.examTitle}</td>
                            <td className="py-3 px-3 text-slate-400">{new Date(attempt.startedAt).toLocaleTimeString()}</td>
                            <td className="py-3 px-3 text-slate-300">{formatDuration(attempt.durationSeconds)}</td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                attempt.status === 'Completed'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : attempt.status === 'Terminated'
                                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                  : attempt.status === 'Time Expired'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : attempt.status === 'Exited'
                                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {attempt.status === 'Terminated' ? 'Ejected' : attempt.status}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              {(() => {
                                const maxV = attempt.maxViolations || rooms.find(r => r.id === attempt.examId)?.maxViolations || 5;
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-semibold ${attempt.violations >= maxV ? 'text-red-400 font-bold' : attempt.violations > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                      {attempt.violations} / {maxV}
                                    </span>
                                    {attempt.status === 'Terminated' ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
                                        Ejected
                                      </span>
                                    ) : attempt.flagged ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
                                        Flagged
                                      </span>
                                    ) : null}
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================
              2. ROOMS & EXAMINATIONS
             ========================================================= */}
          {currentPage === 'rooms' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Examination Rooms</h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Each room supports simultaneous access by multiple computers. Admin can type or edit room numbers and passcodes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoom(null);
                    setCreateModalOpen(true);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Room</span>
                </button>
              </div>

              {roomsError && (
                <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/80 text-red-200 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-red-300">Firestore Room Sync Alert</p>
                      <p className="text-xs text-red-400/90">{roomsError}</p>
                    </div>
                  </div>
                  {onRetryLoadRooms && (
                    <button
                      type="button"
                      onClick={onRetryLoadRooms}
                      className="px-3.5 py-1.5 bg-red-800/80 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors shrink-0"
                    >
                      Retry Connection
                    </button>
                  )}
                </div>
              )}

              {rooms.length === 0 ? (
                roomsError ? (
                  <div className="p-12 text-center rounded-3xl bg-slate-900 border border-red-900/50 space-y-3">
                    <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                    <p className="text-sm font-bold text-red-400">Unable to load examination rooms from Firestore.</p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">{roomsError}</p>
                    {onRetryLoadRooms && (
                      <button
                        type="button"
                        onClick={onRetryLoadRooms}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors"
                      >
                        Retry Connection
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
                    <p className="text-sm text-slate-400">No examination rooms created yet in the database.</p>
                    <button
                      type="button"
                      onClick={() => setCreateModalOpen(true)}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                    >
                      Create Your First Room
                    </button>
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {rooms.map((room) => {
                    const availability = getAvailability(room);
                    const roomAttempts = attempts.filter((a) => a.examId === room.id);
                    const roomLive = roomAttempts.filter((a) => a.status === 'In Progress').length;
                    const roomCompleted = roomAttempts.filter((a) => a.status === 'Completed').length;
                    const examineeCount = new Set(roomAttempts.map((a) => a.participantId)).size;

                    return (
                      <div
                        key={room.id}
                        className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-slate-700/80 transition-all space-y-4"
                      >
                        {/* Card Top */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              ROOM NUMBER
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-2xl font-black font-mono text-white tracking-wider">
                                {room.roomNumber}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(room.roomNumber, `room-${room.id}`)}
                                className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg font-medium flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" />
                                <span>{copiedId === `room-${room.id}` ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              room.active ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}>
                              {room.active ? 'ACTIVE' : 'DISABLED'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${availability.color}`}>
                              {availability.status}
                            </span>
                            {room.antiCheat && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-950/60 border-amber-800 text-amber-300">
                                Ejection: {room.maxViolations || 5} violations
                              </span>
                            )}
                            {room.calculatorEnabled !== false ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-950/60 border-emerald-800 text-emerald-300 flex items-center gap-1">
                                <Calculator className="w-3 h-3" />
                                <span>Calc: On</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-900 border-slate-700 text-slate-400">
                                Calc: Off
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Passcode Box */}
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-800 text-xs">
                          <span className="text-slate-400">Passcode:</span>
                          <strong className="font-mono text-emerald-300 font-bold tracking-wider">{room.passcode}</strong>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(room.passcode, `pass-${room.id}`)}
                            className="text-slate-400 hover:text-white ml-1"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Title & Description */}
                        <div>
                          <h3 className="text-base font-bold text-white">{room.title}</h3>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {room.description || 'No examination description provided.'}
                          </p>
                          {room.availabilityEnabled !== false && (room.startAt || room.endAt) && (
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-300 bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-1.5">
                              {room.startAt && (
                                <span>
                                  <span className="text-slate-500">Start:</span>{' '}
                                  <strong className="text-emerald-300 font-medium">
                                    {new Date(room.startAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                  </strong>
                                </span>
                              )}
                              {room.endAt && (
                                <span>
                                  <span className="text-slate-500">End:</span>{' '}
                                  <strong className="text-amber-300 font-medium">
                                    {new Date(room.endAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                  </strong>
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Metrics Bar */}
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-800/80 text-center">
                          <div className="p-2 bg-slate-950/50 rounded-xl border border-blue-500/20 bg-blue-950/20">
                            <span className="text-[9px] text-blue-400 uppercase block font-bold">Visits</span>
                            <strong className="text-xs text-blue-300 font-mono font-bold">{room.visitsCount || 0}</strong>
                          </div>
                          <div className="p-2 bg-slate-950/50 rounded-xl">
                            <span className="text-[9px] text-slate-400 uppercase block">Timer</span>
                            <strong className="text-xs text-white">
                              {room.timerEnabled ? `${room.durationMinutes}m` : 'Off'}
                            </strong>
                          </div>
                          <div className="p-2 bg-slate-950/50 rounded-xl">
                            <span className="text-[9px] text-slate-400 uppercase block">Anti-Cheat</span>
                            <strong className="text-xs text-emerald-400">
                              {room.antiCheat ? 'On' : 'Off'}
                            </strong>
                          </div>
                          <div className="p-2 bg-slate-950/50 rounded-xl border border-amber-500/20 bg-amber-950/20">
                            <span className="text-[9px] text-amber-400 uppercase block font-bold">Violation Limit</span>
                            <strong className="text-xs text-amber-300">
                              {room.antiCheat ? `${room.maxViolations || 5} max` : 'None'}
                            </strong>
                          </div>
                          <div className="p-2 bg-slate-950/50 rounded-xl">
                            <span className="text-[9px] text-slate-400 uppercase block">Live Now</span>
                            <strong className="text-xs text-emerald-400">{roomLive}</strong>
                          </div>
                          <div className="p-2 bg-slate-950/50 rounded-xl">
                            <span className="text-[9px] text-slate-400 uppercase block">Submissions</span>
                            <strong className="text-xs text-white">{roomCompleted}</strong>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setViewRoomModal(room)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingRoom(room);
                              setCreateModalOpen(true);
                            }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const ended =
                                !room.active &&
                                room.availabilityEnabled !== false &&
                                Boolean(room.endAt) &&
                                !isNaN(new Date(room.endAt!).getTime()) &&
                                Date.now() >= new Date(room.endAt!).getTime();

                              if (ended) {
                                showToast('Scheduled End Date & Time has already passed. Update or disable the schedule dates to reopen.');
                                setEditingRoom(room);
                                setCreateModalOpen(true);
                                return;
                              }
                              onUpdateRoom(room.id, { active: !room.active });
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                              room.active
                                ? 'bg-amber-950/40 text-amber-400 border border-amber-800/60 hover:bg-amber-950/70'
                                : 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-950/70'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{room.active ? 'Close' : 'Reopen'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete room "${room.roomNumber} - ${room.title}"?`)) {
                                onDeleteRoom(room.id);
                              }
                            }}
                            className="px-3 py-1.5 bg-red-950/40 text-red-400 border border-red-800/60 hover:bg-red-950/70 rounded-xl text-xs font-semibold"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              3. SUBMISSIONS
             ========================================================= */}
          {currentPage === 'submissions' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Examination Submissions</h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Every participant session is logged independently with start time, duration, and proctor flags.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {selectedAttemptIds.size > 0 && (
                    <button
                      type="button"
                      disabled={deleteActionLoading}
                      onClick={async () => {
                        if (window.confirm(`Delete ${selectedAttemptIds.size} selected examinee submission(s)?`)) {
                          setDeleteActionLoading(true);
                          try {
                            await deleteMultipleAttempts(Array.from(selectedAttemptIds));
                            setSelectedAttemptIds(new Set());
                            showToast(`Deleted ${selectedAttemptIds.size} submission(s).`);
                          } catch (err: any) {
                            alert(`Failed to delete submissions: ${err.message}`);
                          } finally {
                            setDeleteActionLoading(false);
                          }
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-200 flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Delete Selected ({selectedAttemptIds.size})</span>
                    </button>
                  )}

                  {attempts.length > 0 && (
                    <button
                      type="button"
                      disabled={deleteActionLoading}
                      onClick={() => setDeleteAttemptsModalOpen(true)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-red-950/60 border border-slate-700 hover:border-red-800 text-slate-300 hover:text-red-300 flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Delete All Submissions</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Filters Bar */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search by participant name, ID, or room..."
                    className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Exited">Exited</option>
                    <option value="Terminated">Terminated</option>
                    <option value="Time Expired">Time Expired</option>
                  </select>
                </div>
              </div>

              {/* Submissions Table */}
              <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                  {(() => {
                    const filteredAttempts = attempts.filter((a) => {
                      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
                      if (!searchFilter.trim()) return true;
                      const q = searchFilter.toLowerCase();
                      return (
                        a.participantName.toLowerCase().includes(q) ||
                        a.participantId.toLowerCase().includes(q) ||
                        a.roomNumber.toLowerCase().includes(q) ||
                        a.examTitle.toLowerCase().includes(q)
                      );
                    });

                    const allFilteredSelected =
                      filteredAttempts.length > 0 &&
                      filteredAttempts.every((a) => selectedAttemptIds.has(a.id));

                    const toggleSelectAll = () => {
                      if (allFilteredSelected) {
                        setSelectedAttemptIds(new Set());
                      } else {
                        setSelectedAttemptIds(new Set(filteredAttempts.map((a) => a.id)));
                      }
                    };

                    const toggleSelect = (id: string) => {
                      const next = new Set(selectedAttemptIds);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      setSelectedAttemptIds(next);
                    };

                    if (filteredAttempts.length === 0) {
                      return (
                        <div className="p-12 text-center text-xs text-slate-500">
                          No examinee submissions match your current filter.
                        </div>
                      );
                    }

                    return (
                      <table className="w-full text-xs text-left">
                        <thead className="text-slate-400 bg-slate-950/60 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="py-3 px-3 w-10 text-center">
                              <input
                                type="checkbox"
                                checked={allFilteredSelected}
                                onChange={toggleSelectAll}
                                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                              />
                            </th>
                            <th className="py-3 px-4">Participant</th>
                            <th className="py-3 px-4">Room</th>
                            <th className="py-3 px-4">Examination</th>
                            <th className="py-3 px-4">Started At</th>
                            <th className="py-3 px-4">Ended At</th>
                            <th className="py-3 px-4">Duration</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Violations</th>
                            <th className="py-3 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {filteredAttempts.map((attempt) => (
                            <tr key={attempt.id} className="hover:bg-slate-800/30">
                              <td className="py-3 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedAttemptIds.has(attempt.id)}
                                  onChange={() => toggleSelect(attempt.id)}
                                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                />
                              </td>
                              <td className="py-3 px-4">
                                <strong className="text-white block">
                                  {attempt.participantName || attempt.participantId}
                                </strong>
                                {attempt.participantName && (
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {attempt.participantId}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-emerald-300">
                                {attempt.roomNumber}
                              </td>
                              <td className="py-3 px-4 text-slate-300">{attempt.examTitle}</td>
                              <td className="py-3 px-4 text-slate-400">
                                {new Date(attempt.startedAt).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-slate-400">
                                {attempt.endedAt ? new Date(attempt.endedAt).toLocaleTimeString() : '—'}
                              </td>
                              <td className="py-3 px-4 text-slate-300 font-medium">
                                {formatDuration(attempt.durationSeconds)}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  attempt.status === 'Completed'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : attempt.status === 'Terminated'
                                    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                    : attempt.status === 'Time Expired'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : attempt.status === 'Exited'
                                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}>
                                  {attempt.status === 'Terminated' ? 'Ejected / Terminated' : attempt.status}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                {(() => {
                                  const maxV = attempt.maxViolations || rooms.find(r => r.id === attempt.examId)?.maxViolations || 5;
                                  return (
                                    <div className="flex items-center gap-1.5">
                                      <span className={`font-bold ${attempt.violations >= maxV ? 'text-red-400 font-black' : attempt.violations > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                        {attempt.violations} / {maxV}
                                      </span>
                                      {attempt.status === 'Terminated' ? (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
                                          Ejected
                                        </span>
                                      ) : attempt.flagged ? (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
                                          Review Flag
                                        </span>
                                      ) : null}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (window.confirm(`Delete submission for "${attempt.participantName || attempt.participantId}"?`)) {
                                      try {
                                        await deleteAttempt(attempt.id);
                                        const next = new Set(selectedAttemptIds);
                                        next.delete(attempt.id);
                                        setSelectedAttemptIds(next);
                                        showToast('Submission deleted.');
                                      } catch (err: any) {
                                        alert(`Failed to delete submission: ${err.message}`);
                                      }
                                    }
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                                  title="Delete submission"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              4. SECURITY EVENTS
             ========================================================= */}
          {currentPage === 'violations' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Proctor Security Events</h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Audit log of all detected anti-cheat events (tab switching, focus loss, fullscreen exits, restricted shortcuts).
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {selectedViolationIds.size > 0 && (
                    <button
                      type="button"
                      disabled={deleteActionLoading}
                      onClick={async () => {
                        if (window.confirm(`Delete ${selectedViolationIds.size} selected security violation event(s)?`)) {
                          setDeleteActionLoading(true);
                          try {
                            await deleteMultipleViolations(Array.from(selectedViolationIds));
                            setSelectedViolationIds(new Set());
                            showToast(`Deleted ${selectedViolationIds.size} violation event(s).`);
                          } catch (err: any) {
                            alert(`Failed to delete violations: ${err.message}`);
                          } finally {
                            setDeleteActionLoading(false);
                          }
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-200 flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Delete Selected ({selectedViolationIds.size})</span>
                    </button>
                  )}

                  {violations.length > 0 && (
                    <button
                      type="button"
                      disabled={deleteActionLoading}
                      onClick={() => setDeleteViolationsModalOpen(true)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-red-950/60 border border-slate-700 hover:border-red-800 text-slate-300 hover:text-red-300 flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Delete All Security Events</span>
                    </button>
                  )}
                </div>
              </div>

              {violations.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 text-xs text-slate-500">
                  No security events recorded. All examinations are running cleanly without flagged actions.
                </div>
              ) : (
                <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    {(() => {
                      const allVioSelected =
                        violations.length > 0 &&
                        violations.every((v) => selectedViolationIds.has(v.id));

                      const toggleSelectAllVio = () => {
                        if (allVioSelected) {
                          setSelectedViolationIds(new Set());
                        } else {
                          setSelectedViolationIds(new Set(violations.map((v) => v.id)));
                        }
                      };

                      const toggleSelectVio = (id: string) => {
                        const next = new Set(selectedViolationIds);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        setSelectedViolationIds(next);
                      };

                      return (
                        <table className="w-full text-xs text-left">
                          <thead className="text-slate-400 bg-slate-950/60 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                            <tr>
                              <th className="py-3 px-3 w-10 text-center">
                                <input
                                  type="checkbox"
                                  checked={allVioSelected}
                                  onChange={toggleSelectAllVio}
                                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                />
                              </th>
                              <th className="py-3 px-4">Timestamp</th>
                              <th className="py-3 px-4">Participant</th>
                              <th className="py-3 px-4">Room</th>
                              <th className="py-3 px-4">Examination</th>
                              <th className="py-3 px-4">Event #</th>
                              <th className="py-3 px-4">Reason / Description</th>
                              <th className="py-3 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {violations.map((vio) => (
                              <tr key={vio.id} className="hover:bg-slate-800/30">
                                <td className="py-3 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedViolationIds.has(vio.id)}
                                    onChange={() => toggleSelectVio(vio.id)}
                                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                  />
                                </td>
                                <td className="py-3 px-4 text-slate-400">
                                  {new Date(vio.timestamp).toLocaleTimeString()}
                                </td>
                                <td className="py-3 px-4 font-mono text-white font-medium">
                                  {vio.participantId}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-emerald-300">
                                  {vio.roomNumber}
                                </td>
                                <td className="py-3 px-4 text-slate-300">{vio.examTitle}</td>
                                <td className="py-3 px-4">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                                    #{vio.number}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-red-300 font-medium">{vio.reason}</td>
                                <td className="py-3 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (window.confirm(`Delete security violation event #${vio.number}?`)) {
                                        try {
                                          await deleteViolation(vio.id);
                                          const next = new Set(selectedViolationIds);
                                          next.delete(vio.id);
                                          setSelectedViolationIds(next);
                                          showToast('Security event deleted.');
                                        } catch (err: any) {
                                          alert(`Failed to delete violation: ${err.message}`);
                                        }
                                      }
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                                    title="Delete security event"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              5. ANALYTICS (WITH EMBEDDED GOOGLE SHEET DATA BOARD)
             ========================================================= */}
          {currentPage === 'analytics' && (
            <div className="space-y-6">
              {/* Header and Sub-Tab Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Examination Analytics</h1>
                  <p className="text-xs text-slate-400 mt-1">
                    High-level breakdown of examinee completion outcomes, room distribution, and live spreadsheets (Google Sheets &amp; Microsoft Excel Online).
                  </p>
                </div>

                {/* Sub-tab Navigation */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl w-fit">
                  <button
                    type="button"
                    onClick={() => setAnalyticsSubTab('metrics')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      analyticsSubTab === 'metrics'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Metrics &amp; Overview</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAnalyticsSubTab('sheet')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      analyticsSubTab === 'sheet'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Spreadsheet</span>
                  </button>
                </div>
              </div>

              {/* Sub-tab 1: Examination Metrics */}
              {analyticsSubTab === 'metrics' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Completed Sessions
                      </span>
                      <strong className="text-3xl font-black text-emerald-400">{completedSessions}</strong>
                      <span className="text-xs text-slate-400 block mt-1">
                        {completionRate}% completion rate
                      </span>
                    </div>

                    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Time Expired Sessions
                      </span>
                      <strong className="text-3xl font-black text-amber-400">{expiredSessions}</strong>
                      <span className="text-xs text-slate-400 block mt-1">Auto-submitted on timer end</span>
                    </div>

                    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                        Live In Progress
                      </span>
                      <strong className="text-3xl font-black text-emerald-400">{liveSessions}</strong>
                      <span className="text-xs text-slate-400 block mt-1">Active examinations now</span>
                    </div>

                    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block mb-1">
                        Total Room Visits
                      </span>
                      <strong className="text-3xl font-black text-blue-400 font-mono">{totalRoomVisits}</strong>
                      <span className="text-xs text-slate-400 block mt-1">Examinee room logins &amp; entries</span>
                    </div>
                  </div>

                  <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white">Sessions Distribution &amp; Room Visits</h3>
                      <span className="text-xs text-slate-400">Total Visits: <strong className="text-blue-400">{totalRoomVisits}</strong></span>
                    </div>
                    {rooms.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No examination rooms created yet.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {rooms.map((room) => {
                          const roomAttempts = attempts.filter((a) => a.examId === room.id);
                          const percent = attempts.length > 0 ? Math.round((roomAttempts.length / attempts.length) * 100) : 0;
                          return (
                            <div key={room.id} className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                <span className="font-semibold text-slate-200">
                                  {room.roomNumber} — {room.title}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span className="px-2 py-0.5 rounded-lg bg-blue-950/60 border border-blue-800/60 text-blue-300 font-mono text-[11px] font-bold">
                                    {room.visitsCount || 0} visits
                                  </span>
                                  <span className="text-slate-300 font-mono font-semibold">
                                    {roomAttempts.length} submissions ({percent}%)
                                  </span>
                                </div>
                              </div>
                              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sub-tab 2: Google Sheet Data Board */}
              {analyticsSubTab === 'sheet' && (
                <div className="animate-in fade-in duration-200">
                  <SheetBoard />
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              6. SETTINGS & FIREBASE CONFIGURATION
             ========================================================= */}
          {currentPage === 'settings' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-white">System Settings &amp; Firebase</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Manage database synchronization and replace your Firebase project configuration.
                </p>
              </div>

              {/* Sync Configuration Card */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-orange-500/15 border border-orange-500/30 text-orange-400">
                      <Flame className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Google Cloud Firestore Database</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Current status:{' '}
                        <strong className="text-emerald-400">
                          Active &amp; Globally Synchronized (Cloud Firestore)
                        </strong>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFirebaseModalOpen(true)}
                    className="px-4 py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-600/20 flex items-center gap-2 flex-shrink-0"
                  >
                    <Flame className="w-4 h-4" />
                    <span>View Cloud Database Details</span>
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Multi-PC &amp; GitHub Pages Real-Time Sync Connected</span>
                  </div>
                  <p className="text-slate-400">
                    Your examination rooms, admin credentials, examinee attempts, and proctoring violations are stored directly in your provisioned <strong>Google Cloud Firestore</strong> database. Rooms created on any PC instantly appear and allow logins on other PCs, mobile devices, or static deployments (such as GitHub Pages).
                  </p>
                </div>
              </div>

              {/* Admin Credentials & Password Change */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-5">
                <div>
                  <h3 className="text-base font-bold text-white">Administrator Account &amp; Security</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Manage administrator credentials and update password</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs space-y-1 font-mono text-slate-300">
                  <div>Username: <span className="text-white font-bold">{adminSession.adminUsername}</span></div>
                  <div>Role: <span className="text-emerald-400 font-semibold">System Administrator</span></div>
                </div>

                {/* Change Password Form */}
                <form onSubmit={handleChangePassword} className="p-5 rounded-2xl bg-slate-950/40 border border-slate-800 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Change Admin Password</span>
                  </div>

                  {pwChangeMsg && (
                    <div
                      className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                        pwChangeMsg.type === 'success'
                          ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                          : 'bg-red-950/60 border border-red-800 text-red-300'
                      }`}
                    >
                      {pwChangeMsg.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      )}
                      <span>{pwChangeMsg.text}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Current Password</label>
                      <input
                        type="password"
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        placeholder="Current password"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">New Password</label>
                      <input
                        type="password"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="New password"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        placeholder="Repeat new password"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={pwChangeLoading || !newPw}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{pwChangeLoading ? 'Updating...' : 'Update Password'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Reset Success Feedback Banner */}
              {resetSuccessMsg && (
                <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs flex items-start gap-3 shadow-lg animate-in fade-in">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-white text-sm">System Factory Reset Completed</div>
                    <p className="mt-0.5">{resetSuccessMsg}</p>
                  </div>
                </div>
              )}

              {/* Danger Zone */}
              <div className="p-6 rounded-3xl bg-red-950/20 border border-red-900/50 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-red-300">Danger Zone</h3>
                    <p className="text-xs text-red-400/80 mt-0.5">
                      Destructive operations that permanently reset and erase portal examination data.
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-950/60 border border-red-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Reset All Proctor Accounts &amp; Data to Default</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-800">
                        Factory Reset
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                      Permanently wipes all created examination rooms, examinee attempts and submissions, security violation logs, Google Sheet data, and restores all proctor accounts and passwords to default.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setResetConfirmInput('');
                      setResetModalOpen(true);
                    }}
                    className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 flex items-center gap-2 flex-shrink-0 transition-all hover:scale-[1.02]"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Reset All to Default</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create / Edit Room Modal */}
      {createModalOpen && (
        <RoomModal
          room={editingRoom}
          onClose={() => {
            setCreateModalOpen(false);
            setEditingRoom(null);
          }}
          onSave={async (roomData) => {
            if (editingRoom) {
              await onUpdateRoom(editingRoom.id, roomData);
            } else {
              await onCreateRoom({
                ...roomData,
                createdBy: (adminSession as any).username || (adminSession as any).adminUsername || 'proctor',
                createdByProctor: adminSession.name || 'Proctor'
              });
            }
          }}
        />
      )}

      {/* Firebase Config Modal */}
      {firebaseModalOpen && (
        <FirebaseConfigModal
          currentConfig={systemConfig}
          onClose={() => setFirebaseModalOpen(false)}
          onUpdated={(updated) => {
            onConfigUpdated(updated);
          }}
        />
      )}

      {/* View Room Quick Modal */}
      {viewRoomModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">ROOM OVERVIEW</span>
                <h3 className="text-lg font-bold text-white mt-0.5">{viewRoomModal.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewRoomModal(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase block">Room Number</span>
                <strong className="text-xl font-mono text-white tracking-wider block mt-0.5">
                  {viewRoomModal.roomNumber}
                </strong>
              </div>
              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase block">Passcode</span>
                <strong className="text-xl font-mono text-emerald-300 tracking-wider block mt-0.5">
                  {viewRoomModal.passcode}
                </strong>
              </div>
            </div>

            {/* Specifications & Violation Ejection Limit */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 bg-slate-800/60 border border-slate-700/60 rounded-xl">
                <span className="text-[9px] text-slate-400 uppercase block">Timer</span>
                <strong className="text-xs text-white">
                  {viewRoomModal.timerEnabled ? `${viewRoomModal.durationMinutes}m` : 'Off'}
                </strong>
              </div>
              <div className="p-2 bg-slate-800/60 border border-slate-700/60 rounded-xl">
                <span className="text-[9px] text-slate-400 uppercase block">Anti-Cheat</span>
                <strong className="text-xs text-emerald-400">
                  {viewRoomModal.antiCheat ? 'Active' : 'Off'}
                </strong>
              </div>
              <div className="p-2 bg-slate-800/60 border border-slate-700/60 rounded-xl">
                <span className="text-[9px] text-slate-400 uppercase block">Calculator</span>
                <strong className={`text-xs ${viewRoomModal.calculatorEnabled !== false ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {viewRoomModal.calculatorEnabled !== false ? 'On' : 'Off'}
                </strong>
              </div>
              <div className="p-2 bg-amber-950/30 border border-amber-500/30 rounded-xl">
                <span className="text-[9px] text-amber-400 uppercase block font-bold">Limit</span>
                <strong className="text-xs text-amber-300">
                  {viewRoomModal.antiCheat ? `${viewRoomModal.maxViolations || 5} max` : 'None'}
                </strong>
              </div>
            </div>

            {viewRoomModal.availabilityEnabled !== false && (viewRoomModal.startAt || viewRoomModal.endAt) && (
              <div className="p-3 bg-slate-800/50 border border-slate-700/60 rounded-xl space-y-1.5 text-xs">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Availability Schedule</span>
                {viewRoomModal.startAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Start Date &amp; Time:</span>
                    <span className="text-emerald-300 font-medium">
                      {new Date(viewRoomModal.startAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                )}
                {viewRoomModal.endAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">End Date &amp; Time:</span>
                    <span className="text-amber-300 font-medium">
                      {new Date(viewRoomModal.endAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 text-xs">
              <div className="text-slate-400">Google Form Destination:</div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 font-mono text-[11px] truncate">
                {viewRoomModal.formUrl}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setViewRoomModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Factory Reset Confirmation Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-red-700/80 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">
                    DANGER ZONE • IRREVERSIBLE
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">Reset All Proctor Accounts &amp; Data</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!resetLoading) setResetModalOpen(false);
                }}
                disabled={resetLoading}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/60 text-xs text-red-200 space-y-2">
              <div className="font-bold text-red-300 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>Warning: This will permanently delete:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-300 ml-1">
                <li>All examination rooms in Firestore and local database</li>
                <li>All examinee attempts, submissions, and session records</li>
                <li>All anti-cheat security violation event logs</li>
                <li>Google Sheet link and cached response data</li>
                <li>All proctor accounts and passwords (restored to default factory state)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-slate-300 font-semibold">
                To confirm this destructive action, type <span className="font-mono text-red-400 font-bold">RESET</span> below:
              </label>
              <input
                type="text"
                value={resetConfirmInput}
                onChange={(e) => setResetConfirmInput(e.target.value)}
                placeholder="RESET"
                disabled={resetLoading}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-red-500 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500/40"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                disabled={resetLoading}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                disabled={resetConfirmInput.trim().toUpperCase() !== 'RESET' || resetLoading}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all"
              >
                {resetLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Resetting System...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Permanently Reset All</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Submissions Confirmation Modal */}
      {deleteAttemptsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-red-700/80 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">
                    CONFIRMATION • IRREVERSIBLE
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">Delete All Submissions</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!deleteActionLoading) setDeleteAttemptsModalOpen(false);
                }}
                disabled={deleteActionLoading}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete all <span className="text-red-400 font-bold">{attempts.length}</span> examination submissions? This will remove all examinee scores, timings, answers, and session records permanently from Firestore and local storage.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteAttemptsModalOpen(false)}
                disabled={deleteActionLoading}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteActionLoading}
                onClick={async () => {
                  setDeleteActionLoading(true);
                  try {
                    await deleteAllAttempts();
                    setSelectedAttemptIds(new Set());
                    setDeleteAttemptsModalOpen(false);
                    showToast('All examination submissions have been deleted.');
                  } catch (err: any) {
                    alert(`Failed to delete all submissions: ${err.message}`);
                  } finally {
                    setDeleteActionLoading(false);
                  }
                }}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all"
              >
                {deleteActionLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Delete All Submissions</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Security Events Confirmation Modal */}
      {deleteViolationsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-red-700/80 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">
                    CONFIRMATION • IRREVERSIBLE
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">Delete All Security Events</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!deleteActionLoading) setDeleteViolationsModalOpen(false);
                }}
                disabled={deleteActionLoading}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete all <span className="text-red-400 font-bold">{violations.length}</span> security violation events and data findings? This log history cannot be recovered once removed.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteViolationsModalOpen(false)}
                disabled={deleteActionLoading}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteActionLoading}
                onClick={async () => {
                  setDeleteActionLoading(true);
                  try {
                    await deleteAllViolations();
                    setSelectedViolationIds(new Set());
                    setDeleteViolationsModalOpen(false);
                    showToast('All security violation events have been deleted.');
                  } catch (err: any) {
                    alert(`Failed to delete all security events: ${err.message}`);
                  } finally {
                    setDeleteActionLoading(false);
                  }
                }}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all"
              >
                {deleteActionLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Delete All Events</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal Toast Notification */}
      {portalToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 border border-emerald-500/50 shadow-2xl shadow-emerald-500/20 text-emerald-200 text-xs font-semibold rounded-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{portalToast}</span>
        </div>
      )}

      {/* Tab Transition Loading Screen */}
      {tabLoading?.active && (
        <LoadingScreen
          message={tabLoading.label}
          subtext="PROCTOR+ Control Center"
        />
      )}
    </div>
  );
};
