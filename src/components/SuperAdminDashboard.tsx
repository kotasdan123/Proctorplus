import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  KeyRound,
  Lock,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Search,
  Filter,
  Copy,
  ExternalLink,
  Laptop,
  Server,
  Flame,
  ArrowRight,
  RefreshCw,
  Clock,
  ShieldAlert,
  ChevronRight,
  Shield,
  Layers,
  Sparkles,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import {
  ProctorAccount,
  ExamRoom,
  ExamAttempt,
  SecurityViolation,
  SystemConfig,
  SuperAdminSession
} from '../types';
import {
  fetchProctors,
  createProctor,
  updateProctor,
  deleteProctor,
  updateAdminCredentials
} from '../lib/api';
import { LoadingScreen } from './LoadingScreen';

interface SuperAdminDashboardProps {
  superAdminSession: SuperAdminSession | { username: string; name: string };
  rooms: ExamRoom[];
  attempts: ExamAttempt[];
  violations: SecurityViolation[];
  systemConfig: SystemConfig | null;
  connectedPCs: number;
  onLogout: () => void;
  onSwitchToProctorView?: () => void;
  onUpdateRoom?: (id: string, roomData: Partial<ExamRoom>) => Promise<void>;
  onDeleteRoom?: (id: string) => Promise<void>;
  roomsError?: string | null;
  onRetryLoadRooms?: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  superAdminSession,
  rooms,
  attempts,
  violations,
  systemConfig,
  connectedPCs,
  onLogout,
  onSwitchToProctorView,
  onUpdateRoom,
  onDeleteRoom,
  roomsError,
  onRetryLoadRooms
}) => {
  const [activeTab, setActiveTab] = useState<'proctors' | 'all-rooms' | 'system'>('proctors');
  const [proctors, setProctors] = useState<ProctorAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Proctor Management States
  const [searchProctor, setSearchProctor] = useState('');
  const [proctorModalOpen, setProctorModalOpen] = useState(false);
  const [editingProctor, setEditingProctor] = useState<ProctorAccount | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Form states for Add / Edit Proctor
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    notes: '',
    active: true
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Delete confirmation
  const [deletingProctor, setDeletingProctor] = useState<ProctorAccount | null>(null);

  // Rooms Filter in Admin Control
  const [roomSearch, setRoomSearch] = useState('');
  const [selectedProctorFilter, setSelectedProctorFilter] = useState('ALL');

  // Super Admin Password Update State
  const [adminPassForm, setAdminPassForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [adminPassStatus, setAdminPassStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [adminPassLoading, setAdminPassLoading] = useState(false);

  // Load Proctors
  const loadProctorAccounts = async () => {
    setLoading(true);
    try {
      const data = await fetchProctors();
      setProctors(data);
    } catch (err) {
      console.error('Failed to load proctors:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProctorAccounts();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Open modal for Create
  const handleOpenCreateProctor = () => {
    setEditingProctor(null);
    setFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      notes: '',
      active: true
    });
    setFormError(null);
    setProctorModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditProctor = (proctor: ProctorAccount) => {
    setEditingProctor(proctor);
    setFormData({
      username: proctor.username,
      password: proctor.password,
      name: proctor.name,
      email: proctor.email || '',
      notes: proctor.notes || '',
      active: proctor.active !== false
    });
    setFormError(null);
    setProctorModalOpen(true);
  };

  // Save (Create or Update) Proctor Account
  const handleSubmitProctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUser = formData.username.trim();
    const cleanPass = formData.password.trim();
    const cleanName = formData.name.trim();

    if (!cleanUser || !cleanPass) {
      setFormError('Username and password are required.');
      return;
    }

    setFormSubmitting(true);
    try {
      if (editingProctor) {
        await updateProctor(editingProctor.id, {
          username: cleanUser,
          password: cleanPass,
          name: cleanName || cleanUser,
          email: formData.email.trim(),
          notes: formData.notes.trim(),
          active: formData.active
        });
      } else {
        await createProctor({
          username: cleanUser,
          password: cleanPass,
          name: cleanName || cleanUser,
          email: formData.email.trim(),
          notes: formData.notes.trim(),
          active: formData.active
        });
      }
      setProctorModalOpen(false);
      await loadProctorAccounts();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save proctor account.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle Proctor active status
  const handleToggleProctorStatus = async (proctor: ProctorAccount) => {
    try {
      await updateProctor(proctor.id, { active: !proctor.active });
      await loadProctorAccounts();
    } catch (err) {
      console.error('Failed to toggle proctor status:', err);
    }
  };

  // Confirm delete proctor
  const handleConfirmDeleteProctor = async () => {
    if (!deletingProctor) return;
    try {
      await deleteProctor(deletingProctor.id);
      setDeletingProctor(null);
      await loadProctorAccounts();
    } catch (err) {
      console.error('Failed to delete proctor:', err);
    }
  };

  // Super Admin Password Update
  const handleUpdateAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPassStatus(null);

    if (adminPassForm.newPassword !== adminPassForm.confirmPassword) {
      setAdminPassStatus({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    if (adminPassForm.newPassword.length < 6) {
      setAdminPassStatus({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }

    setAdminPassLoading(true);
    try {
      await updateAdminCredentials({
        currentPassword: adminPassForm.currentPassword,
        newPassword: adminPassForm.newPassword
      });
      setAdminPassStatus({ type: 'success', message: 'Super Admin password updated successfully!' });
      setAdminPassForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      setAdminPassStatus({ type: 'error', message: err.message || 'Failed to update admin password.' });
    } finally {
      setAdminPassLoading(false);
    }
  };

  // Filtered Proctors
  const filteredProctors = proctors.filter((p) => {
    const q = searchProctor.toLowerCase();
    return (
      p.username.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q))
    );
  });

  // Filtered Rooms across all proctors
  const filteredRooms = rooms.filter((r) => {
    const q = roomSearch.toLowerCase();
    const matchesSearch =
      r.roomNumber.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      (r.createdByProctor && r.createdByProctor.toLowerCase().includes(q)) ||
      r.createdBy.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (selectedProctorFilter === 'ALL') return true;
    return (
      r.createdBy === selectedProctorFilter ||
      r.createdByProctor === selectedProctorFilter
    );
  });

  const activeProctorCount = proctors.filter((p) => p.active !== false).length;
  const activeRoomsCount = rooms.filter((r) => r.active).length;
  const liveExamsCount = attempts.filter((a) => a.status === 'In Progress').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Super Admin Header */}
      <header className="px-6 py-4 border-b border-amber-500/20 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full border-2 border-amber-500/50 p-0.5 bg-slate-900 shadow-lg shadow-amber-500/20 flex-shrink-0">
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
                  Proctor<span className="text-amber-400">+</span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-sm">
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                  SUPER ADMIN CONTROL
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                High-Privilege Proctor Credentials &amp; Cross-Exam Hierarchy Oversight
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Multi-PC Sync Node Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300">
              <Laptop className="w-3.5 h-3.5 text-emerald-400" />
              <span>{connectedPCs} PC{connectedPCs > 1 ? 's' : ''} Online</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            {/* Quick Switch to Proctor View */}
            {onSwitchToProctorView && (
              <button
                type="button"
                onClick={onSwitchToProctorView}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all hover:scale-[1.02]"
                title="Open the Proctor Examination Dashboard"
              >
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Switch to Proctor View</span>
              </button>
            )}

            {/* Current Session Badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold">{superAdminSession.name || 'Super Administrator'}</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 font-bold">
                @{superAdminSession.username || 'admin'}
              </span>
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/60 text-xs font-bold text-red-300 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto px-6 py-8 flex-1 space-y-8">
        {/* Hierarchy Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 border border-amber-500/20 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-amber-400 uppercase">
                Proctor Accounts
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{proctors.length}</span>
              <span className="text-xs text-emerald-400 font-bold">({activeProctorCount} Active)</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Exam proctors authorized to create &amp; oversee rooms
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-950/30 via-slate-900 to-slate-900 border border-blue-500/20 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-blue-400 uppercase">
                All Proctor Rooms
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{rooms.length}</span>
              <span className="text-xs text-blue-400 font-bold">({activeRoomsCount} Active)</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Total examination rooms created across all proctors
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/20 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-emerald-400 uppercase">
                Live Submissions
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{attempts.length}</span>
              <span className="text-xs text-emerald-400 font-bold">({liveExamsCount} Testing Now)</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Examinee attempts recorded across all rooms
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-red-950/30 via-slate-900 to-slate-900 border border-red-500/20 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-red-400 uppercase">
                Security Violations
              </span>
              <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{violations.length}</span>
              <span className="text-xs text-red-400 font-bold">Flagged Events</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Anti-cheat proctoring infractions logged
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('proctors')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'proctors'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Proctor Accounts &amp; Passwords</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === 'proctors' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {proctors.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all-rooms')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'all-rooms'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>All Rooms from Proctors</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === 'all-rooms' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {rooms.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'system'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Admin Control Security</span>
          </button>
        </div>

        {/* TAB 1: PROCTOR ACCOUNTS & PASSWORDS MANAGEMENT */}
        {activeTab === 'proctors' && (
          <div className="space-y-6">
            {/* Top Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchProctor}
                  onChange={(e) => setSearchProctor(e.target.value)}
                  placeholder="Search proctors by username or display name..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={loadProctorAccounts}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
                  title="Refresh proctors list"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={handleOpenCreateProctor}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Proctor Account</span>
                </button>
              </div>
            </div>

            {/* Proctors List Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                      <th className="px-6 py-4">Proctor Profile</th>
                      <th className="px-6 py-4">Login Username</th>
                      <th className="px-6 py-4">Login Password (Admin Controlled)</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Rooms Created</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-sm">
                    {filteredProctors.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                          <Users className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                          <p className="font-semibold">No proctor accounts found</p>
                          <p className="text-xs text-slate-500 mt-1">
                            Click &quot;Create Proctor Account&quot; to authorize an exam supervisor.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredProctors.map((proctor) => {
                        const isPwVisible = Boolean(visiblePasswords[proctor.id]);
                        const roomsByThisProctor = rooms.filter(
                          (r) =>
                            r.createdBy === proctor.username ||
                            r.createdByProctor === proctor.name ||
                            r.createdBy === proctor.name
                        ).length;

                        return (
                          <tr key={proctor.id} className="hover:bg-slate-800/40 transition-colors">
                            {/* Proctor Profile */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-sm">
                                  {proctor.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-bold text-white flex items-center gap-2">
                                    <span>{proctor.name}</span>
                                    {proctor.notes && (
                                      <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                                        {proctor.notes}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    {proctor.email || 'No email provided'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Username */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold px-2 py-1 rounded bg-slate-950 border border-slate-700 text-amber-300">
                                  {proctor.username}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(proctor.username, `user-${proctor.id}`)}
                                  className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                                  title="Copy username"
                                >
                                  {copiedId === `user-${proctor.id}` ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>

                            {/* Password with Reveal & Quick Edit */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-white min-w-[90px]">
                                  {isPwVisible ? proctor.password : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility(proctor.id)}
                                  className="p-1 text-slate-400 hover:text-white transition-colors"
                                  title={isPwVisible ? 'Hide password' : 'View password'}
                                >
                                  {isPwVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(proctor.password, `pass-${proctor.id}`)}
                                  className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                                  title="Copy password"
                                >
                                  {copiedId === `pass-${proctor.id}` ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4">
                              <button
                                type="button"
                                onClick={() => handleToggleProctorStatus(proctor)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                                  proctor.active !== false
                                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60'
                                    : 'bg-red-950/60 text-red-300 border-red-500/40 hover:bg-red-900/60'
                                }`}
                                title="Click to toggle active status"
                              >
                                {proctor.active !== false ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    <span>Active</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-3 h-3 text-red-400" />
                                    <span>Disabled</span>
                                  </>
                                )}
                              </button>
                            </td>

                            {/* Rooms Created Count */}
                            <td className="px-6 py-4">
                              <span className="font-bold text-white text-xs px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
                                {roomsByThisProctor} Room{roomsByThisProctor !== 1 ? 's' : ''}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditProctor(proctor)}
                                  className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                                  title="Edit username, password or profile"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingProctor(proctor)}
                                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                                  title="Delete proctor account"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ALL EXAMINATION ROOMS (CROSS-PROCTOR OVERSIGHT) */}
        {activeTab === 'all-rooms' && (
          <div className="space-y-6">
            {roomsError && (
              <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/80 text-red-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-red-300">Firestore Room Sync Warning</p>
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

            {/* Filter toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder="Search by Room Number, Title, or Proctor author..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Proctor filter selector */}
              <div className="flex items-center gap-3">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedProctorFilter}
                  onChange={(e) => setSelectedProctorFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">All Proctors ({rooms.length} Rooms)</option>
                  {proctors.map((p) => (
                    <option key={p.id} value={p.username}>
                      {p.name} (@{p.username})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Rooms Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRooms.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
                  <Layers className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                  <h3 className="text-base font-bold text-white">No Examination Rooms Found</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Proctors create rooms through the Proctor Examination Dashboard. Any room created by a proctor appears here with full supervisor attribution.
                  </p>
                </div>
              ) : (
                filteredRooms.map((room) => {
                  const roomAttempts = attempts.filter((a) => a.examId === room.id);
                  const activeExaminees = roomAttempts.filter((a) => a.status === 'In Progress').length;
                  const roomViolations = violations.filter((v) => v.examId === room.id).length;

                  return (
                    <div
                      key={room.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 hover:border-amber-500/40 transition-all shadow-lg flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                              ROOM {room.roomNumber}
                            </span>
                            <h3 className="text-base font-bold text-white mt-1 leading-snug">
                              {room.title}
                            </h3>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              room.active
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {room.active ? 'Active' : 'Closed'}
                          </span>
                        </div>

                        {/* Proctor Creator Badge */}
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                          <span className="text-slate-400">Created by:</span>
                          <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-amber-400" />
                            {room.createdByProctor || room.createdBy || 'Proctor'}
                          </span>
                        </div>

                        {/* Room Credentials (Passcode & Timer) */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Passcode</span>
                            <span className="font-mono font-bold text-white">{room.passcode}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Duration</span>
                            <span className="font-semibold text-white">
                              {room.timerEnabled ? `${room.durationMinutes} mins` : 'Untimed'}
                            </span>
                          </div>
                        </div>

                        {/* Form URL preview */}
                        {room.formUrl && (
                          <div className="text-xs truncate text-slate-400">
                            <span className="text-slate-500 block text-[10px]">Google Form URL:</span>
                            <a
                              href={room.formUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 hover:underline truncate inline-flex items-center gap-1"
                            >
                              <span>{room.formUrl}</span>
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Card Footer Metrics */}
                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                        <div className="flex items-center gap-3">
                          <span>
                            <strong className="text-white">{activeExaminees}</strong> Live
                          </span>
                          <span>
                            <strong className="text-white">{roomAttempts.length}</strong> Total
                          </span>
                        </div>
                        {roomViolations > 0 && (
                          <span className="text-red-400 font-bold flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3" />
                            {roomViolations} Event{roomViolations !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SYSTEM SECURITY & SUPER ADMIN CREDENTIALS */}
        {activeTab === 'system' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Super Admin Password Update */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Super Admin Password</h3>
                  <p className="text-xs text-slate-400">Change master credentials for username: <code className="text-amber-300">admin</code></p>
                </div>
              </div>

              {adminPassStatus && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    adminPassStatus.type === 'success'
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                      : 'bg-red-950/60 border border-red-800 text-red-300'
                  }`}
                >
                  {adminPassStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{adminPassStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleUpdateAdminPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={adminPassForm.currentPassword}
                    onChange={(e) =>
                      setAdminPassForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                    }
                    placeholder="Enter current password (default: 123admin)"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    New Super Admin Password
                  </label>
                  <input
                    type="password"
                    required
                    value={adminPassForm.newPassword}
                    onChange={(e) =>
                      setAdminPassForm((prev) => ({ ...prev, newPassword: e.target.value }))
                    }
                    placeholder="New password (min 6 characters)"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={adminPassForm.confirmPassword}
                    onChange={(e) =>
                      setAdminPassForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                    }
                    placeholder="Re-enter new password"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={adminPassLoading}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {adminPassLoading ? 'Updating Master Password...' : 'Save New Master Password'}
                </button>
              </form>
            </div>

            {/* Architecture & Role Hierarchy Overview */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">PROCTOR+ Access Hierarchy</h3>
                  <p className="text-xs text-slate-400">Role &amp; Privilege Structure</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                {/* Level 1: Super Admin */}
                <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-300 uppercase tracking-wide">
                      Level 1 • Super Admin (Admin Control)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                      admin
                    </span>
                  </div>
                  <p className="text-slate-300">
                    Highest authority. Creates &amp; manages all Proctor accounts, sets usernames &amp; passwords, inspects all examination rooms across every proctor, and configures synchronization.
                  </p>
                </div>

                {/* Level 2: Proctor */}
                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-emerald-300 uppercase tracking-wide">
                      Level 2 • Examination Proctor
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">
                      proctor / proctor1
                    </span>
                  </div>
                  <p className="text-slate-300">
                    Creates examination rooms, manages Google Form URLs, sets timers &amp; violation limits, monitors live candidate attempts, terminates cheating examinees, and syncs data to Google Sheets.
                  </p>
                </div>

                {/* Level 3: Candidate */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-300 uppercase tracking-wide">
                      Level 3 • Examinee / Student
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">
                      Room + Passcode
                    </span>
                  </div>
                  <p className="text-slate-400">
                    Joins using Room Number &amp; Passcode. Takes the proctored exam under full-screen browser lockdown, countdown timer, and automated anti-tamper monitoring.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* CREATE / EDIT PROCTOR MODAL */}
      {proctorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  {editingProctor ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editingProctor ? 'Edit Proctor Account' : 'New Proctor Account'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Configure login credentials and authorization
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProctorModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitProctor} className="p-6 space-y-4" autoComplete="off">
              {formError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Proctor Display Name <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Lead Proctor Maria or Room Supervisor"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Login Username <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="e.g. proctor2 or exam_lead"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Login Password <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Password for this proctor"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  As Super Admin, you can view, change, or reset this password anytime.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email / Contact (Optional)
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="proctor@domain.com"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Role Notes / Room Assignment (Optional)
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Assigned to HR Exams or Lab 3"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="proctor-active-check"
                  checked={formData.active}
                  onChange={(e) => setFormData((prev) => ({ ...prev, active: e.target.checked }))}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-950 border-slate-700"
                />
                <label htmlFor="proctor-active-check" className="text-xs font-semibold text-slate-300">
                  Account Active &amp; Allowed to Log In
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setProctorModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {formSubmitting ? 'Saving...' : editingProctor ? 'Update Account' : 'Create Proctor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingProctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-red-500/30 rounded-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-white">Delete Proctor Account?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Are you sure you want to remove <strong className="text-amber-300">{deletingProctor.name}</strong> (@{deletingProctor.username})? They will immediately lose access to the Proctor Examination Dashboard.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingProctor(null)}
                className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProctor}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-lg shadow-red-600/20"
              >
                Yes, Delete Proctor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
