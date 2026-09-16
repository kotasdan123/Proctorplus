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
  KeyRound
} from 'lucide-react';
import { RoomModal } from './RoomModal';
import { FirebaseConfigModal } from './FirebaseConfigModal';
import { updateAdminCredentials } from '../lib/api';

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
  onConfigUpdated
}) => {
  const [currentPage, setCurrentPage] = useState<
    'dashboard' | 'rooms' | 'submissions' | 'violations' | 'analytics' | 'settings'
  >('dashboard');

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

  // Metrics
  const activeRooms = rooms.filter((r) => r.active).length;
  const liveSessions = attempts.filter((a) => a.status === 'In Progress').length;
  const completedSessions = attempts.filter((a) => a.status === 'Completed').length;
  const expiredSessions = attempts.filter((a) => a.status === 'Time Expired').length;
  const uniqueExaminees = new Set(attempts.map((a) => a.participantId)).size;
  const completionRate = attempts.length > 0 ? Math.round((completedSessions / attempts.length) * 100) : 0;

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const getAvailability = (room: ExamRoom) => {
    if (!room.active) return { status: 'Closed', color: 'text-slate-400 bg-slate-800' };
    const now = Date.now();
    if (room.startAt && new Date(room.startAt).getTime() > now) {
      return { status: 'Upcoming', color: 'text-indigo-400 bg-indigo-950/60' };
    }
    if (room.endAt && new Date(room.endAt).getTime() < now) {
      return { status: 'Expired', color: 'text-amber-400 bg-amber-950/60' };
    }
    return { status: 'Open', color: 'text-emerald-400 bg-emerald-950/60' };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex selection:bg-indigo-500/30">
      {/* Left Navigation Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between hidden md:flex flex-shrink-0">
        <div className="p-6 space-y-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-black text-xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
              +
            </div>
            <div>
              <span className="font-extrabold tracking-tight text-white text-base">Proctor+</span>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Admin Control Center</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage('dashboard')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentPage('rooms')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'rooms'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
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
              onClick={() => setCurrentPage('submissions')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'submissions'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
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
              onClick={() => setCurrentPage('violations')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'violations'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
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
              onClick={() => setCurrentPage('analytics')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'analytics'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentPage('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentPage === 'settings'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
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
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-400 text-xs">
              A
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">{adminSession.name}</div>
              <div className="text-[10px] text-slate-400 truncate">Administrator</div>
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
                onChange={(e) => setCurrentPage(e.target.value as any)}
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
              {currentPage === 'settings' ? 'System Settings & Firebase' : currentPage}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Sync Badge */}
            <div
              onClick={() => setFirebaseModalOpen(true)}
              className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-xs text-slate-300 transition-colors"
              title="Click to configure Firebase or switch sync mode"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="hidden sm:inline">
                {systemConfig?.syncMode === 'firebase' ? 'Firebase RTDB Sync' : 'Built-in Multi-PC Sync'}
              </span>
              <span className="text-[10px] text-indigo-400 font-semibold underline">Settings</span>
            </div>

            {/* Create Room Button */}
            <button
              type="button"
              onClick={() => {
                setEditingRoom(null);
                setCreateModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.02]"
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
              <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/20 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-400 block mb-1">
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
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/25 flex items-center gap-2"
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
                  <strong className="text-2xl font-bold text-indigo-400">{liveSessions}</strong>
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
                    <span className="text-3xl font-black text-indigo-400">{completionRate}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span>{completedSessions} completed submissions</span>
                    <span>{attempts.length} total recorded sessions</span>
                  </div>
                </div>

                <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
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
                      <strong className="text-lg font-bold text-indigo-400 block">{rooms.length}</strong>
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
                    onClick={() => setCurrentPage('submissions')}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
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
                            <td className="py-3 px-3 font-mono text-indigo-300 font-bold">{attempt.roomNumber}</td>
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
                                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
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
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/25 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Room</span>
                </button>
              </div>

              {rooms.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
                  <p className="text-sm text-slate-400">No examination rooms created yet.</p>
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                  >
                    Create Your First Room
                  </button>
                </div>
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
                                className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg font-medium flex items-center gap-1"
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
                          </div>
                        </div>

                        {/* Passcode Box */}
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-800 text-xs">
                          <span className="text-slate-400">Passcode:</span>
                          <strong className="font-mono text-indigo-300 font-bold tracking-wider">{room.passcode}</strong>
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
                        </div>

                        {/* Metrics Bar */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800/80 text-center">
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
                            <strong className="text-xs text-indigo-400">{roomLive}</strong>
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
                            onClick={() => onUpdateRoom(room.id, { active: !room.active })}
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
                    className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
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
                    <option value="Time Expired">Time Expired</option>
                  </select>
                </div>
              </div>

              {/* Submissions Table */}
              <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-slate-400 bg-slate-950/60 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Participant</th>
                        <th className="py-3 px-4">Room</th>
                        <th className="py-3 px-4">Examination</th>
                        <th className="py-3 px-4">Started At</th>
                        <th className="py-3 px-4">Ended At</th>
                        <th className="py-3 px-4">Duration</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Violations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {attempts
                        .filter((a) => {
                          if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
                          if (!searchFilter.trim()) return true;
                          const q = searchFilter.toLowerCase();
                          return (
                            a.participantName.toLowerCase().includes(q) ||
                            a.participantId.toLowerCase().includes(q) ||
                            a.roomNumber.toLowerCase().includes(q) ||
                            a.examTitle.toLowerCase().includes(q)
                          );
                        })
                        .map((attempt) => (
                          <tr key={attempt.id} className="hover:bg-slate-800/30">
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
                            <td className="py-3 px-4 font-mono font-bold text-indigo-300">
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
                                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
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
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              4. SECURITY EVENTS
             ========================================================= */}
          {currentPage === 'violations' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-white">Proctor Security Events</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Audit log of all detected anti-cheat events (tab switching, focus loss, fullscreen exits, restricted shortcuts).
                </p>
              </div>

              {violations.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 text-xs text-slate-500">
                  No security events recorded. All examinations are running cleanly without flagged actions.
                </div>
              ) : (
                <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-slate-400 bg-slate-950/60 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-3 px-4">Timestamp</th>
                          <th className="py-3 px-4">Participant</th>
                          <th className="py-3 px-4">Room</th>
                          <th className="py-3 px-4">Examination</th>
                          <th className="py-3 px-4">Event #</th>
                          <th className="py-3 px-4">Reason / Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {violations.map((vio) => (
                          <tr key={vio.id} className="hover:bg-slate-800/30">
                            <td className="py-3 px-4 text-slate-400">
                              {new Date(vio.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-3 px-4 font-mono text-white font-medium">
                              {vio.participantId}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-indigo-300">
                              {vio.roomNumber}
                            </td>
                            <td className="py-3 px-4 text-slate-300">{vio.examTitle}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                                #{vio.number}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-red-300 font-medium">{vio.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              5. ANALYTICS
             ========================================================= */}
          {currentPage === 'analytics' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-white">Examination Analytics</h1>
                <p className="text-xs text-slate-400 mt-1">
                  High-level breakdown of examinee completion outcomes and room utilization.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Live In Progress
                  </span>
                  <strong className="text-3xl font-black text-indigo-400">{liveSessions}</strong>
                  <span className="text-xs text-slate-400 block mt-1">Currently taking exam</span>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
                <h3 className="text-base font-bold text-white">Sessions Distribution by Examination Room</h3>
                <div className="space-y-3">
                  {rooms.map((room) => {
                    const roomAttempts = attempts.filter((a) => a.examId === room.id);
                    const percent = attempts.length > 0 ? Math.round((roomAttempts.length / attempts.length) * 100) : 0;
                    return (
                      <div key={room.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-300 truncate">
                            {room.roomNumber} — {room.title}
                          </span>
                          <span className="text-slate-400 font-mono font-semibold">
                            {roomAttempts.length} ({percent}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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
                      <h3 className="text-base font-bold text-white">Database &amp; Synchronization</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Current mode:{' '}
                        <strong className="text-indigo-400">
                          {systemConfig?.syncMode === 'firebase'
                            ? 'Custom Firebase Realtime Database'
                            : 'Built-in Server Multi-PC Sync'}
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
                    <span>Replace Firebase Config</span>
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ready for Multi-Computer Testing</span>
                  </div>
                  <p className="text-slate-400">
                    By default, Proctor+ uses the <strong>Built-in Server Synchronization</strong> engine. Any computer visiting the site URL can join rooms and take exams without needing Firebase setup. If you prefer to synchronize through your personal Firebase project, click <em>"Replace Firebase Config"</em> to paste your project credentials.
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
                  <div>Role: <span className="text-indigo-400 font-semibold">System Administrator</span></div>
                </div>

                {/* Change Password Form */}
                <form onSubmit={handleChangePassword} className="p-5 rounded-2xl bg-slate-950/40 border border-slate-800 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Lock className="w-3.5 h-3.5 text-indigo-400" />
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
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">New Password</label>
                      <input
                        type="password"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="New password"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        placeholder="Repeat new password"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={pwChangeLoading || !newPw}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{pwChangeLoading ? 'Updating...' : 'Update Password'}</span>
                    </button>
                  </div>
                </form>
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
              await onCreateRoom(roomData);
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
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">ROOM OVERVIEW</span>
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
                <strong className="text-xl font-mono text-indigo-300 tracking-wider block mt-0.5">
                  {viewRoomModal.passcode}
                </strong>
              </div>
            </div>

            {/* Specifications & Violation Ejection Limit */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl">
                <span className="text-[9px] text-slate-400 uppercase block">Timer</span>
                <strong className="text-xs text-white">
                  {viewRoomModal.timerEnabled ? `${viewRoomModal.durationMinutes} min` : 'Off'}
                </strong>
              </div>
              <div className="p-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl">
                <span className="text-[9px] text-slate-400 uppercase block">Anti-Cheat</span>
                <strong className="text-xs text-emerald-400">
                  {viewRoomModal.antiCheat ? 'Active' : 'Off'}
                </strong>
              </div>
              <div className="p-2.5 bg-amber-950/30 border border-amber-500/30 rounded-xl">
                <span className="text-[9px] text-amber-400 uppercase block font-bold">Violation Limit</span>
                <strong className="text-xs text-amber-300">
                  {viewRoomModal.antiCheat ? `${viewRoomModal.maxViolations || 5} max` : 'None'}
                </strong>
              </div>
            </div>

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
    </div>
  );
};
