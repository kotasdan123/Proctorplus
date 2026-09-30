import React, { useState, useEffect, useCallback } from 'react';
import {
  ExamRoom,
  ExamAttempt,
  SecurityViolation,
  SystemConfig,
  UserSession,
  ParticipantSession,
  AdminSession,
  SuperAdminSession,
  ProctorSession
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
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { ParticipantRoomDashboard } from './components/ParticipantRoomDashboard';
import { LiveExamView } from './components/LiveExamView';
import { ResultView } from './components/ResultView';
import { ProctorLoginModal } from './components/ProctorLoginModal';
import { LoadingScreen } from './components/LoadingScreen';
import { SecurityToast } from './components/SecurityToast';

const SESSION_STORAGE_KEY = 'proctor_plus_session_v6';

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
  const [roomsError, setRoomsError] = useState<string | null>(null);
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

  // Modal Login States
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Loading States
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [transitionLoading, setTransitionLoading] = useState<{
    active: boolean;
    message: string;
    subtext?: string;
  } | null>(null);

  // Security Shield Keyboard & Context-Menu Notification State
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  // Initialize Anti-Developer Tools & Security Shield
  useEffect(() => {
    securityShield.init((notice) => {
      setSecurityNotice(notice);
      setTimeout(() => {
        setSecurityNotice(null);
      }, 3500);
    });

    return () => {
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

  // Load all initial data from authoritative sources
  const loadData = useCallback(async () => {
    try {
      let roomsData: ExamRoom[] = [];
      let fetchRoomsFailed = false;
      let roomsFetchError: any = null;

      try {
        roomsData = await fetchRooms();
      } catch (err: any) {
        fetchRoomsFailed = true;
        roomsFetchError = err;
      }

      const [attemptsData, violationsData, configData, statusData] = await Promise.all([
        fetchAttempts().catch(() => []),
        fetchViolations().catch(() => []),
        fetchConfig().catch(() => null),
        fetchStatus().catch(() => null)
      ]);

      if (!fetchRoomsFailed) {
        setRooms(roomsData);
        setRoomsError(null);
        if (session?.role === 'room') {
          const found = roomsData.find((r) => r.id === session.roomId);
          if (found) setCurrentRoom(found);
        }
      } else {
        console.error('Failed to load rooms from Firestore:', roomsFetchError);
        const errorMsg =
          roomsFetchError?.message?.includes('permission-denied')
            ? 'Permission error connecting to Firestore rooms collection.'
            : 'Unable to load examination rooms from Firestore. Please check your connection.';
        setRoomsError(errorMsg);
      }

      setAttempts(attemptsData);
      setViolations(violationsData);
      if (configData) setSystemConfig(configData);
      if (statusData?.connectedPCs) setConnectedPCs(statusData.connectedPCs);
    } catch (err) {
      console.error('Failed to load application data:', err);
    } finally {
      setTimeout(() => {
        setIsInitialLoading(false);
      }, 450);
    }
  }, [session]);

  useEffect(() => {
    loadData();

    // Subscribe to authoritative real-time room updates directly via Firestore snapshot
    const unsubscribe = subscribeToEvents(
      (event) => {
        if (event.type !== 'rooms_updated') {
          loadData();
        }
      },
      (realtimeRooms) => {
        // Direct stream from Firestore onSnapshot
        setRooms(realtimeRooms);
        setRoomsError(null);

        if (session?.role === 'room') {
          const found = realtimeRooms.find((r) => r.id === session.roomId);
          if (found) setCurrentRoom(found);
        }
      },
      (firestoreErr) => {
        console.error('Real-time rooms listener error:', firestoreErr);
        const errorMsg =
          firestoreErr?.message?.includes('permission-denied')
            ? 'Permission error on Firestore rooms listener.'
            : 'Unable to stream real-time examination rooms from Firestore.';
        setRoomsError(errorMsg);
      }
    );

    // Periodic safety sync every 10s for other components
    const interval = setInterval(() => {
      fetchAttempts().then(setAttempts).catch(() => {});
      fetchViolations().then(setViolations).catch(() => {});
    }, 10000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [loadData, session]);

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

  const handleAuthLoggedIn = (auth: {
    role: 'superadmin' | 'proctor';
    username: string;
    name: string;
    proctorId?: string;
  }) => {
    setTransitionLoading({
      active: true,
      message:
        auth.role === 'superadmin'
          ? 'Entering Super Admin Control...'
          : 'Entering Proctor Control Center...',
      subtext:
        auth.role === 'superadmin'
          ? 'Loading Proctor Accounts & Hierarchy Management'
          : `Authenticated as ${auth.name} (@${auth.username})`
    });

    setTimeout(() => {
      if (auth.role === 'superadmin') {
        const superSession: SuperAdminSession = {
          role: 'superadmin',
          username: auth.username,
          name: auth.name
        };
        setSession(superSession);
      } else {
        const proctorSession: ProctorSession = {
          role: 'proctor',
          username: auth.username,
          name: auth.name,
          proctorId: auth.proctorId
        };
        setSession(proctorSession);
      }
      setLoginModalOpen(false);
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
    const created = await createRoom(roomData);
    setRooms((prev) => {
      if (prev.some((r) => r.id === created.id)) return prev;
      return [created, ...prev];
    });
  };

  const handleUpdateRoom = async (id: string, roomData: Partial<ExamRoom>) => {
    const updated = await updateRoom(id, roomData);
    setRooms((prev) => prev.map((r) => (r.id === id ? updated : r)));
  };

  const handleDeleteRoom = async (id: string) => {
    await deleteRoom(id);
    setRooms((prev) => prev.filter((r) => r.id !== id));
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

    // 3. Super Admin Control Dashboard (Separate Dashboard)
    if (session?.role === 'superadmin') {
      return (
        <SuperAdminDashboard
          superAdminSession={session}
          rooms={rooms}
          attempts={attempts}
          violations={violations}
          systemConfig={systemConfig}
          connectedPCs={connectedPCs}
          onLogout={handleLogout}
          onSwitchToProctorView={() => {
            // Temporarily switch view to proctor control center
            setSession({
              role: 'proctor',
              username: session.username,
              name: `${session.name} (Admin Preview)`
            });
          }}
          onUpdateRoom={handleUpdateRoom}
          onDeleteRoom={handleDeleteRoom}
          roomsError={roomsError}
          onRetryLoadRooms={loadData}
        />
      );
    }

    // 4. Proctor Examination Dashboard (The old administration named Proctor)
    if (session?.role === 'proctor' || session?.role === 'admin') {
      return (
        <AdminPortal
          adminSession={{
            role: session.role,
            adminUsername: (session as any).username || (session as any).adminUsername || 'proctor',
            name: session.name
          }}
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
          roomsError={roomsError}
          onRetryLoadRooms={loadData}
          onResetAllToDefault={async () => {
            await loadData();
          }}
        />
      );
    }

    // 5. Participant Room Dashboard
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

    // 6. Default: Room Login & Brand Welcome
    return (
      <>
        <LoginView
          onRoomJoined={handleRoomJoined}
          onOpenProctorLogin={() => setLoginModalOpen(true)}
          connectedPCs={connectedPCs}
          syncMode={systemConfig?.syncMode || 'server'}
        />

        {loginModalOpen && (
          <ProctorLoginModal
            onClose={() => setLoginModalOpen(false)}
            onSuccess={handleAuthLoggedIn}
          />
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 select-none">
      {/* Active Application View */}
      {renderCurrentView()}

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
