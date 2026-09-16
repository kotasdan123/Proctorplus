import React, { useState } from 'react';
import { ExamRoom } from '../types';
import { X, RefreshCw, AlertCircle, ShieldCheck, Clock, FileText, CheckCircle2 } from 'lucide-react';

interface RoomModalProps {
  room?: ExamRoom | null;
  onClose: () => void;
  onSave: (roomData: Partial<ExamRoom>) => Promise<void>;
}

const DEFAULT_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSf_PLACEHOLDER/viewform?embedded=true';

export const RoomModal: React.FC<RoomModalProps> = ({ room, onClose, onSave }) => {
  const isEditing = Boolean(room);

  // Generate clean random alphanumeric codes
  const generateRandomCode = (len = 6) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = '';
    for (let i = 0; i < len; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  const generateRandomDigits = () => String(Math.floor(100000 + Math.random() * 900000));

  const [roomNumber, setRoomNumber] = useState(room?.roomNumber || generateRandomDigits());
  const [passcode, setPasscode] = useState(room?.passcode || generateRandomCode(6));
  const [title, setTitle] = useState(room?.title || '');
  const [description, setDescription] = useState(room?.description || '');
  const [formUrl, setFormUrl] = useState(room?.formUrl || DEFAULT_FORM);
  const [timerEnabled, setTimerEnabled] = useState(room ? room.timerEnabled : true);
  const [durationMinutes, setDurationMinutes] = useState(room?.durationMinutes || 60);
  const [antiCheat, setAntiCheat] = useState(room ? room.antiCheat : true);
  const [maxViolations, setMaxViolations] = useState(room?.maxViolations || 3);
  const [startAt, setStartAt] = useState(room?.startAt ? room.startAt.slice(0, 16) : '');
  const [endAt, setEndAt] = useState(room?.endAt ? room.endAt.slice(0, 16) : '');
  const [active, setActive] = useState(room ? room.active : true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegenerate = () => {
    setRoomNumber(generateRandomDigits());
    setPasscode(generateRandomCode(6));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanRoom = roomNumber.trim();
    const cleanPass = passcode.trim();
    const cleanTitle = title.trim();
    const cleanForm = formUrl.trim();

    if (!cleanRoom || !cleanPass || !cleanTitle) {
      setError('Room Number, Passcode, and Examination Title are required.');
      return;
    }

    if (!cleanForm.startsWith('http://') && !cleanForm.startsWith('https://')) {
      setError('Please provide a valid URL for the Google Form (must start with https://).');
      return;
    }

    setLoading(true);
    try {
      await onSave({
        roomNumber: cleanRoom,
        passcode: cleanPass,
        title: cleanTitle,
        description: description.trim(),
        formUrl: cleanForm,
        timerEnabled,
        durationMinutes: Number(durationMinutes) || 60,
        antiCheat,
        maxViolations: Number(maxViolations) || 3,
        startAt: startAt ? new Date(startAt).toISOString() : '',
        endAt: endAt ? new Date(endAt).toISOString() : '',
        active
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save examination room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/70 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/80">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-indigo-400 uppercase">
              {isEditing ? 'EDIT EXAMINATION' : 'NEW EXAMINATION ROOM'}
            </span>
            <h2 className="text-xl font-bold text-white mt-0.5">
              {isEditing ? 'Update Examination Room' : 'Create Examination Room'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice */}
        <div className="px-6 pt-5">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-indigo-200 text-xs leading-relaxed">
            <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-white font-semibold block mb-0.5">Multi-Computer Shared Room</strong>
              You can type your own custom Room Number and Passcode below, or generate random ones. Multiple computers can join this room at the same time using these credentials.
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-300 bg-red-950/50 border border-red-800/60 rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Credentials Box with Typing enabled */}
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Room Number &amp; Passcode Access</span>
              <button
                type="button"
                onClick={handleRegenerate}
                className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Generate Random</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Room Number (Type or edit)
                </label>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="e.g. 101202 or MATH-101"
                  className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-white font-mono text-base tracking-wider focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Students type this to locate the exam</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Passcode (Type or edit)
                </label>
                <input
                  type="text"
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="e.g. PASS99"
                  className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-white font-mono text-base tracking-wider focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Security key required to enter room</span>
              </div>
            </div>
          </div>

          {/* Exam Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Examination Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Midterm Examination - Computer Science 101"
                className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Description / Special Instructions
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Instructions displayed to students before starting the examination..."
                className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Google Forms URL <span className="text-red-400">*</span></span>
                <span className="text-[11px] text-indigo-400 font-normal">Pasted link opens directly inside proctored exam</span>
              </label>
              <input
                type="url"
                required
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://docs.google.com/forms/d/e/.../viewform?embedded=true"
                className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Tip: In Google Forms, click <strong>Send &gt; Embed HTML (&lt;&gt;)</strong> or copy the regular view link. Students will take this form in the anti-cheat window.
              </p>
            </div>
          </div>

          {/* Proctoring & Timer Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-800/30 border border-slate-800">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="timerEnabled"
                  checked={timerEnabled}
                  onChange={(e) => setTimerEnabled(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-900"
                />
                <label htmlFor="timerEnabled" className="text-xs font-medium text-slate-300 flex items-center gap-1.5 cursor-pointer">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Countdown Timer</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="1440"
                  disabled={!timerEnabled}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 bg-slate-950/70 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-40"
                />
                <span className="text-xs text-slate-400">minutes</span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="antiCheat"
                  checked={antiCheat}
                  onChange={(e) => setAntiCheat(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-900"
                />
                <label htmlFor="antiCheat" className="text-xs font-medium text-slate-300 flex items-center gap-1.5 cursor-pointer">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Anti-Cheat Proctoring</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Flag after</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  disabled={!antiCheat}
                  value={maxViolations}
                  onChange={(e) => setMaxViolations(Number(e.target.value))}
                  className="w-16 px-2.5 py-1.5 bg-slate-950/70 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-40"
                />
                <span className="text-xs text-slate-400">violations</span>
              </div>
            </div>
          </div>

          {/* Schedule & Active State */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Available From (Optional)</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Available Until (Optional)</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-2">
            <input
              type="checkbox"
              id="roomActive"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-900"
            />
            <label htmlFor="roomActive" className="text-xs text-slate-300 font-medium cursor-pointer">
              Room is currently Active (examinees can join immediately)
            </label>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
            >
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Examination Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
