import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExamRoom, ExamAttempt } from '../types';
import { Clock, ShieldAlert, AlertTriangle, CheckCircle2, RotateCw, Send, Maximize2, Shield } from 'lucide-react';
import { recordViolation, updateAttempt } from '../lib/api';

interface LiveExamViewProps {
  room: ExamRoom;
  attempt: ExamAttempt;
  onFinish: (result: {
    status: 'Completed' | 'Time Expired' | 'Terminated';
    violations: number;
    durationSeconds: number;
    terminationReason?: string;
  }) => void;
}

export const LiveExamView: React.FC<LiveExamViewProps> = ({ room, attempt, onFinish }) => {
  const effectiveMaxViolations = Math.max(
    1,
    Number(room.maxViolations) || Number(attempt.maxViolations) || 5
  );

  const [secondsRemaining, setSecondsRemaining] = useState<number>(
    room.timerEnabled ? room.durationMinutes * 60 : 0
  );
  const [violationsCount, setViolationsCount] = useState<number>(attempt.violations || 0);
  const [violationOverlay, setViolationOverlay] = useState<{
    show: boolean;
    reason: string;
    flagged: boolean;
    ejected: boolean;
  }>({
    show: false,
    reason: '',
    flagged: false,
    ejected: false
  });

  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formKey, setFormKey] = useState<number>(Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const graceUntilRef = useRef<number>(Date.now() + 2500);
  const lastViolationTimeRef = useRef<number>(0);
  const isFinishedRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(Date.now());

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (totalSecs: number) => {
    const s = Math.max(0, totalSecs);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Request Fullscreen helper
  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
      graceUntilRef.current = Date.now() + 2000;
    } catch {
      // Fullscreen might be blocked by iframe or browser permissions, continue safely
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  // Handler to register a proctor security violation & auto-eject when limit is reached
  const handleViolation = useCallback(async (reason: string) => {
    if (isFinishedRef.current || !room.antiCheat) return;
    const now = Date.now();

    // Check grace period & debounce (800ms)
    if (now < graceUntilRef.current) return;
    if (now - lastViolationTimeRef.current < 800) return;
    lastViolationTimeRef.current = now;

    const nextCount = violationsCount + 1;
    const isEjected = nextCount >= effectiveMaxViolations;
    setViolationsCount(nextCount);

    if (isEjected) {
      // Examinee exceeded limit -> Terminate and eject!
      isFinishedRef.current = true;
      const durationSeconds = Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000));

      setViolationOverlay({
        show: true,
        reason,
        flagged: true,
        ejected: true
      });

      try {
        await recordViolation(attempt.id, reason);
        await updateAttempt(attempt.id, {
          status: 'Terminated',
          endedAt: Date.now(),
          durationSeconds,
          violations: nextCount,
          flagged: true
        });
      } catch (err) {
        console.error('Failed to log ejection to server:', err);
      }

      await exitFullscreen();
      return;
    }

    // Normal non-ejection warning
    setViolationOverlay({
      show: true,
      reason,
      flagged: false,
      ejected: false
    });

    try {
      await recordViolation(attempt.id, reason);
    } catch (err) {
      console.error('Failed to log violation to server:', err);
    }
  }, [room.antiCheat, effectiveMaxViolations, attempt.id, violationsCount, exitFullscreen]);

  // Handle final submission
  const handleCompleteExam = useCallback(async (status: 'Completed' | 'Time Expired' | 'Terminated', reason?: string) => {
    if (isFinishedRef.current && status !== 'Terminated') return;
    isFinishedRef.current = true;

    const durationSeconds = Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000));
    setIsSubmitting(true);

    try {
      await updateAttempt(attempt.id, {
        status,
        endedAt: Date.now(),
        durationSeconds,
        violations: violationsCount,
        flagged: status === 'Terminated' || violationsCount >= effectiveMaxViolations
      });
    } catch (err) {
      console.error('Error submitting exam:', err);
    }

    await exitFullscreen();
    onFinish({ status, violations: violationsCount, durationSeconds, terminationReason: reason });
  }, [attempt.id, violationsCount, effectiveMaxViolations, onFinish, exitFullscreen]);

  // Request fullscreen on start
  useEffect(() => {
    enterFullscreen();
    graceUntilRef.current = Date.now() + 2500;
  }, [enterFullscreen]);

  // Countdown timer effect
  useEffect(() => {
    if (!room.timerEnabled) return;

    const interval = setInterval(() => {
      if (isFinishedRef.current) return;

      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleCompleteExam('Time Expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [room.timerEnabled, handleCompleteExam]);

  // Anti-cheat event listeners (Fullscreen exit, tab switch, window blur, shortcut blocking)
  useEffect(() => {
    if (!room.antiCheat) return;

    const onFullscreenChange = () => {
      const inFull = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(inFull);
      if (!inFull && !isFinishedRef.current && Date.now() > graceUntilRef.current) {
        handleViolation('Exited full-screen examination mode.');
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden && !isFinishedRef.current && Date.now() > graceUntilRef.current) {
        handleViolation('Switched tabs or minimized the examination window.');
      }
    };

    const onBlur = () => {
      if (!isFinishedRef.current && Date.now() > graceUntilRef.current) {
        handleViolation('Examination window lost focus.');
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isFinishedRef.current) return;

      const key = (e.key || '').toLowerCase();
      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      // Restrict F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+T, Ctrl+N, Ctrl+W, Ctrl+R
      const isRestricted =
        key === 'f12' ||
        (ctrlOrMeta && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        (ctrlOrMeta && ['u', 't', 'n', 'w'].includes(key));

      if (isRestricted) {
        e.preventDefault();
        e.stopPropagation();
        handleViolation(`Restricted keyboard shortcut used: ${e.key}`);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onCopyCutPaste = (e: ClipboardEvent) => {
      // Prevent clipboard operations outside of form
      e.preventDefault();
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isFinishedRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy', onCopyCutPaste);
    document.addEventListener('cut', onCopyCutPaste);
    document.addEventListener('paste', onCopyCutPaste);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy', onCopyCutPaste);
      document.removeEventListener('cut', onCopyCutPaste);
      document.removeEventListener('paste', onCopyCutPaste);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [room.antiCheat, handleViolation]);

  // Resume from violation overlay
  const handleResume = async () => {
    setViolationOverlay({ show: false, reason: '', flagged: false });
    graceUntilRef.current = Date.now() + 2500;
    await enterFullscreen();
  };

  const handleRefreshForm = () => {
    setFormKey(Date.now());
  };

  const timerWarning = room.timerEnabled && secondsRemaining <= 300 && secondsRemaining > 60;
  const timerDanger = room.timerEnabled && secondsRemaining <= 60;

  const progressPercent = room.timerEnabled && room.durationMinutes > 0
    ? Math.max(0, Math.min(100, ((room.durationMinutes * 60 - secondsRemaining) / (room.durationMinutes * 60)) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950 flex flex-col select-none overflow-hidden">
      {/* Top Examination Bar */}
      <header className="h-16 px-4 sm:px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4 flex-shrink-0 z-10">
        {/* Exam and Examinee Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold flex-shrink-0">
            {room.roomNumber.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-white truncate leading-tight">
              {room.title}
            </h1>
            <p className="text-[11px] text-slate-400 truncate">
              Room <strong className="text-slate-200">{room.roomNumber}</strong> • {attempt.participantName ? `${attempt.participantName} (${attempt.participantId})` : attempt.participantId}
            </p>
          </div>
        </div>

        {/* Status Metrics: Timer, Violations, Actions */}
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          {/* Timer Display */}
          {room.timerEnabled && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono text-sm font-bold transition-colors ${
              timerDanger
                ? 'bg-red-950/80 border-red-500 text-red-400 animate-pulse'
                : timerWarning
                ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                : 'bg-slate-800/80 border-slate-700 text-white'
            }`}>
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>{formatTime(secondsRemaining)}</span>
            </div>
          )}

          {/* Violations Count */}
          {room.antiCheat && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
              violationsCount >= effectiveMaxViolations
                ? 'bg-red-950/70 border-red-700 text-red-400'
                : violationsCount > 0
                ? 'bg-amber-950/70 border-amber-700 text-amber-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-300'
            }`}>
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{violationsCount} / {effectiveMaxViolations} Violations</span>
            </div>
          )}

          {/* Refresh Form */}
          <button
            type="button"
            onClick={handleRefreshForm}
            title="Reload Google Form if it fails to load"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Refresh Form</span>
          </button>

          {/* Submit Exam Button */}
          <button
            type="button"
            onClick={() => setConfirmSubmitOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Submit Exam</span>
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      {room.timerEnabled && (
        <div className="w-full h-1 bg-slate-800 flex-shrink-0">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Proctor Notice Banner */}
      <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          <span>
            {room.antiCheat
              ? `Anti-cheat proctoring active: Do not exit fullscreen, switch tabs, or minimize window.`
              : `Standard examination mode.`}
          </span>
        </div>
        <span className="text-slate-500 hidden sm:inline">
          Complete your Google Form responses, then click "Submit Exam"
        </span>
      </div>

      {/* Embedded Google Form Canvas */}
      <main className="flex-1 w-full relative bg-slate-900 p-2 sm:p-3 overflow-hidden flex flex-col">
        <iframe
          key={formKey}
          src={room.formUrl}
          title="Google Form Examination"
          className="w-full h-full rounded-xl border border-slate-800 bg-white shadow-inner"
          referrerPolicy="no-referrer"
          loading="eager"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </main>

      {/* Anti-Cheat Violation Modal Overlay */}
      {violationOverlay.show && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-slate-900 border-2 border-red-500 rounded-2xl p-6 text-center shadow-2xl shadow-red-500/20 animate-in fade-in zoom-in-95 duration-200">
            <div className={`w-16 h-16 rounded-2xl ${violationOverlay.ejected ? 'bg-red-500/25 border-2 border-red-500 text-red-300 animate-pulse' : 'bg-red-500/15 border border-red-500/30 text-red-400'} flex items-center justify-center mx-auto mb-4`}>
              <AlertTriangle className="w-8 h-8" />
            </div>

            <span className="text-[11px] font-bold tracking-wider text-red-400 uppercase">
              {violationOverlay.ejected ? 'EXAMINATION TERMINATED • EJECTED' : 'SECURITY WARNING'}
            </span>
            <h2 className="text-xl font-bold text-white mt-1 mb-2">
              {violationOverlay.ejected ? 'Violation Limit Reached' : 'Proctor Violation Detected'}
            </h2>

            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-red-200 text-xs mb-4">
              {violationOverlay.reason}
            </div>

            <div className="p-4 bg-slate-800/60 border border-slate-700/80 rounded-xl mb-4">
              <div className="text-3xl font-black text-red-400">
                {violationsCount} / {effectiveMaxViolations}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {violationOverlay.ejected
                  ? `Maximum limit reached (${effectiveMaxViolations} allowed). You have been ejected.`
                  : `Security violations recorded (Ejection threshold: ${effectiveMaxViolations})`}
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              {violationOverlay.ejected
                ? 'Your examination session has been terminated and locked for proctor review due to exceeding the set violation limit. You cannot continue the exam.'
                : `This is security warning ${violationsCount} of ${effectiveMaxViolations}. If you commit ${effectiveMaxViolations} violations, you will be immediately ejected from the exam.`}
            </p>

            {violationOverlay.ejected ? (
              <button
                type="button"
                onClick={() => {
                  const durationSeconds = Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000));
                  onFinish({
                    status: 'Terminated',
                    violations: violationsCount,
                    durationSeconds,
                    terminationReason: violationOverlay.reason
                  });
                }}
                className="w-full py-3 bg-red-600 hover:bg-red-500 rounded-xl text-white text-sm font-bold shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2"
              >
                <span>Acknowledge &amp; Exit Examination</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResume}
                className="w-full py-3 bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 rounded-xl text-white text-sm font-bold shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Resume &amp; Re-Lock Fullscreen</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal to Submit Exam */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-white text-center mb-1">
              Confirm Final Submission
            </h3>
            <p className="text-xs text-slate-400 text-center mb-5 leading-relaxed">
              Please make sure you have clicked <strong>Submit</strong> on the Google Form inside the examination window. Submitting here will finalize and end your Proctor+ examination session.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Return to Exam
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleCompleteExam('Completed')}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all"
              >
                {isSubmitting ? 'Finalizing...' : 'Yes, Submit Exam'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
