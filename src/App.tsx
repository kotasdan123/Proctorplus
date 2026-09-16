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
import { LoginView } from './components/LoginView';
import { AdminPortal } from './components/AdminPortal';
import { ParticipantRoomDashboard } from './components/ParticipantRoomDashboard';
import { LiveExamView } from './components/LiveExamView';
import { ResultView } from './components/ResultView';
import { AdminLoginModal } from './components/AdminLoginModal';

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
    status: 'Completed' | 'Time Expired';
    violations: number;
    durationSeconds: number;
  } | null>(null);

  const [adminLoginOpen, setAdminLoginOpen] = useState(false);

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

  // Handlers
  const handleRoomJoined = (newSession: ParticipantSession, room: ExamRoom) => {
    setSession(newSession);
    setCurrentRoom(room);
  };

  const handleAdminLoggedIn = (admin: { username: string; name: string }) => {
    const adminSession: AdminSession = {
      role: 'admin',
      adminUsername: admin.username,
      name: admin.name
    };
    setSession(adminSession);
  };

  const handleLogout = () => {
    setSession(null);
    setCurrentRoom(null);
    setActiveAttempt(null);
    setCompletedResult(null);
  };

  const handleStartExam = async () => {
    if (!currentRoom || session?.role !== 'room') return;

    try {
      const attempt = await createAttempt({
        examId: currentRoom.id,
        participantId: session.participantId,
        participantName: session.participantName
      });
      setActiveAttempt(attempt);
    } catch (err) {
      console.error('Failed to start exam:', err);
      alert('Could not start examination session. Please try again.');
    }
  };

  const handleExamFinish = (result: {
    status: 'Completed' | 'Time Expired';
    violations: number;
    durationSeconds: number;
  }) => {
    setActiveAttempt(null);
    setCompletedResult(result);
    loadData();
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
        onReturn={() => setCompletedResult(null)}
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
}
