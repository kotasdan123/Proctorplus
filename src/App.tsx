import React, { useState, useEffect, useCallback } from 'react';
import {
  ExamRoom,
  ExamAttempt,
  SecurityViolation,
  SystemConfig,
  UserSession,
  ParticipantSession,
  AdminSession
} from './types';
import {
  fetchRooms,
  fetchAttempts,
  fetchViolations,
  fetchConfig,
  fetchStatus,
  createRoom,
  updateRoom,
  deleteRoom,
  createAttempt,
  subscribeToEvents
} from './lib/api';
import { securityShield } from './lib/antiDevtools';
import { LoginView } from './components/LoginView';
import { AdminPortal } from './components/AdminPortal';
import { ParticipantRoomDashboard } from './components/ParticipantRoomDashboard';
import { LiveExamView } from './components/LiveExamView';
import { ResultView } from './components/ResultView';
import { AdminLoginModal } from './components/AdminLoginModal';
import { LoadingScreen } from './components/LoadingScreen';
import { DevToolsBlockedModal } from './components/DevToolsBlockedModal';
import { SecurityToast } from './components/SecurityToast';

const SESSION_STORAGE_KEY = 'proctor_plus_session_v5';

export default function App() {
  const [session, setSession] = useState<UserSession>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [violations, setViolations] = useState<SecurityViolation[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [connectedPCs, setConnectedPCs] = useState<number>(1);

  const [activeAttempt, setActiveAttempt] = useState<ExamAttempt | null>(null);
  const [currentRoom, setCurrentRoom] = useState<ExamRoom | null>(null);

  const [completedResult, setCompletedResult] = useState<{
    status: 'Completed' | 'Time Expired' | 'Terminated';
    violations: number;
    durationSeconds: number;
    terminationReason?: string;
  } | null>(null);

  const [adminLoginOpen, setAdminLoginOpen] = useState(false);

  // Loading States
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [transitionLoading, setTransitionLoading] = useState<{
    active: boolean;
    message: string;
    subtext?: string;
  } | null>(null);

  // Security Shield & DevTools Blocking States
  const [devToolsBlocked, setDevToolsBlocked] = useState(false);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  // Initialize Anti-Developer Tools & Security Shield
  useEffect(() => {
    securityShield.init((notice) => {
      setSecurityNotice(notice);
      setTimeout(() => {
        setSecurityNotice(null);
      }, 3500);
    });

    const unsubscribe = securityShield.subscribe((isOpen) => {
      setDevToolsBlocked(isOpen);
    });

    return () => {
      unsubscribe();
      securityShield.destroy();
    };
  }, []);

  // Persist session to sessionStorage
  useEffect(() => {
    if (session) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [session]);

  // Load all initial data
  const loadData = useCallback(async () => {
    try {
      const [roomsData, attemptsData, violationsData, configData, statusData] = await Promise.all([
        fetchRooms().catch(() => []),
        fetchAttempts().catch(() => []),
        fetchViolations().catch(() => []),
        fetchConfig().catch(() => null),
        fetchStatus().catch(() => null)
      ]);

      setRooms(roomsData);
      setAttempts(attemptsData);
      setViolations(violationsData);
      if (configData) setSystemConfig(configData);
      if (statusData?.connectedPCs) setConnectedPCs(statusData.connectedPCs);

      // If user has active room session, sync current room
      if (session?.role === 'room') {
        const found = roomsData.find((r) => r.id === session.roomId);
        if (found) setCurrentRoom(found);
      }
    } catch (err) {
      console.error('Failed to load application data:', err);
    } finally {
      // Smooth initial load experience
      setTimeout(() => {
        setIsInitialLoading(false);
      }, 500);
    }
  }, [session]);

  useEffect(() => {
    loadData();

    // Subscribe to SSE updates
    const unsubscribe = subscribeToEvents(() => {
      loadData();
    });

    // Fallback periodic poll every 4s
    const interval = setInterval(loadData, 4000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [loadData]);

  // Handlers with Loading Transitions
  const handleRoomJoined = (newSession: ParticipantSession, room: ExamRoom) => {
    setTransitionLoading({
      active: true,
      message: 'Entering Examination Room...',
      subtext: `Connecting candidate session to Room ${room.roomNumber}`
    });
    setTimeout(() => {
      setSession(newSession);
      setCurrentRoom(room);
      setTransitionLoading(null);
    }, 450);
  };

  const handleAdminLoggedIn = (admin: { username: string; name: string }) => {
    setTransitionLoading({
      active: true,
      message: 'Entering Administrator Portal...',
      subtext: 'Authenticating high-privilege access & loading control center'
    });
    const adminSession: AdminSession = {
      role: 'admin',
      adminUsername: admin.username,
      name: admin.name
    };
    setTimeout(() => {
      setSession(adminSession);
      setAdminLoginOpen(false);
      setTransitionLoading(null);
    }, 450);
  };

  const handleLogout = () => {
    setTransitionLoading({
      active: true,
      message: 'Logging Out...',
      subtext: 'Safely clearing active session credentials'
    });
    setTimeout(() => {
      setSession(null);
      setCurrentRoom(null);
      setActiveAttempt(null);
      setCompletedResult(null);
      setTransitionLoading(null);
    }, 400);
  };

  const handleStartExam = async () => {
    if (!currentRoom || session?.role !== 'room') return;

    setTransitionLoading({
      active: true,
      message: 'Launching Proctored Examination...',
      subtext: 'Locking fullscreen browser state & starting countdown timer'
    });

    try {
      const attempt = await createAttempt({
        examId: currentRoom.id,
        participantId: session.participantId,
        participantName: session.participantName
      });
      setTimeout(() => {
        setActiveAttempt(attempt);
        setTransitionLoading(null);
      }, 500);
    } catch (err) {
      console.error('Failed to start exam:', err);
      setTransitionLoading(null);
      alert('Could not start examination session. Please try again.');
    }
  };

  const handleExamFinish = (result: {
    status: 'Completed' | 'Time Expired' | 'Terminated';
    violations: number;
    durationSeconds: number;
    terminationReason?: string;
  }) => {
    setTransitionLoading({
      active: true,
      message: 'Finalizing Submission & Scoring...',
      subtext: 'Syncing examination records with central Proctor+ server'
    });
    setTimeout(() => {
      setActiveAttempt(null);
      setCompletedResult(result);
      loadData();
      setTransitionLoading(null);
    }, 450);
  };

  const handleReturnFromResult = () => {
    setTransitionLoading({
      active: true,
      message: 'Returning to Room Dashboard...',
      subtext: 'Reloading assessment summary'
    });
    setTimeout(() => {
      setCompletedResult(null);
      setTransitionLoading(null);
    }, 350);
  };

  const handleCreateRoom = async (roomData: Partial<ExamRoom>) => {
    await createRoom(roomData);
    await loadData();
  };

  const handleUpdateRoom = async (id: string, roomData: Partial<ExamRoom>) => {
    await updateRoom(id, roomData);
    await loadData();
  };

  const handleDeleteRoom = async (id: string) => {
    await deleteRoom(id);
    await loadData();
  };

  // Render primary view
  const renderCurrentView = () => {
    // 1. Live Exam View
    if (activeAttempt && currentRoom) {
      return (
        <LiveExamView
          room={currentRoom}
          attempt={activeAttempt}
          onFinish={handleExamFinish}
        />
      );
    }

    // 2. Exam Result Screen
    if (completedResult && currentRoom) {
      return (
        <ResultView
          room={currentRoom}
          result={completedResult}
          onReturn={handleReturnFromResult}
        />
      );
    }

    // 3. Admin Control Center
    if (session?.role === 'admin') {
      return (
        <AdminPortal
          adminSession={session}
          rooms={rooms}
          attempts={attempts}
          violations={violations}
          systemConfig={systemConfig}
          connectedPCs={connectedPCs}
          onLogout={handleLogout}
          onCreateRoom={handleCreateRoom}
          onUpdateRoom={handleUpdateRoom}
          onDeleteRoom={handleDeleteRoom}
          onConfigUpdated={(config) => setSystemConfig(config)}
        />
      );
    }

    // 4. Participant Room Dashboard
    if (session?.role === 'room' && currentRoom) {
      return (
        <ParticipantRoomDashboard
          room={currentRoom}
          session={session}
          attempts={attempts}
          onStartExam={handleStartExam}
          onLogout={handleLogout}
        />
      );
    }

    // 5. Default: Room Login & Brand Welcome
    return (
      <>
        <LoginView
          onRoomJoined={handleRoomJoined}
          onOpenAdminLogin={() => setAdminLoginOpen(true)}
          connectedPCs={connectedPCs}
          syncMode={systemConfig?.syncMode || 'server'}
        />

        {adminLoginOpen && (
          <AdminLoginModal
            onClose={() => setAdminLoginOpen(false)}
            onSuccess={handleAdminLoggedIn}
          />
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 select-none">
      {/* Active Application View */}
      {renderCurrentView()}

      {/* Developer Tools Tamper Shield Modal */}
      {devToolsBlocked && (
        <DevToolsBlockedModal
          onDismissCheck={() => {
            const stillOpen = securityShield.isDevToolsOpen();
            setDevToolsBlocked(stillOpen);
          }}
        />
      )}

      {/* HUD Security Interception Toast */}
      <SecurityToast
        message={securityNotice}
        onClose={() => setSecurityNotice(null)}
      />

      {/* Global / Transition Circular Spinning Logo Loading Screen */}
      {(isInitialLoading || transitionLoading?.active) && (
        <LoadingScreen
          message={transitionLoading?.message || 'Initializing PROCTOR+ Portal...'}
          subtext={
            transitionLoading?.subtext ||
            'Centralized Online Examination & Anti-Cheat Proctoring Portal'
          }
        />
      )}
    </div>
  );
}
