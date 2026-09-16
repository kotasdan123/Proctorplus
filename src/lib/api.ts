import { ExamRoom, ExamAttempt, SecurityViolation, SystemConfig, FirebaseConfig } from '../types';

const BASE_URL = '';

export async function fetchStatus(): Promise<{
  status: string;
  connectedPCs: number;
  syncMode: 'server' | 'firebase';
  firebaseConfigured: boolean;
  roomsCount: number;
  activeRooms: number;
  activeAttempts: number;
  totalAttempts: number;
  totalViolations: number;
}> {
  const res = await fetch(`${BASE_URL}/api/status`);
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

export async function fetchConfig(): Promise<SystemConfig> {
  const res = await fetch(`${BASE_URL}/api/config`);
  if (!res.ok) throw new Error('Failed to fetch configuration');
  return res.json();
}

export async function updateFirebaseConfig(payload: {
  firebase?: Partial<FirebaseConfig>;
  syncMode?: 'server' | 'firebase';
}): Promise<{ success: boolean; config: SystemConfig }> {
  const res = await fetch(`${BASE_URL}/api/config/firebase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update Firebase configuration');
  }
  return res.json();
}

export async function adminLogin(username: string, password: string): Promise<{
  success: boolean;
  admin: { username: string; name: string };
}> {
  const res = await fetch(`${BASE_URL}/api/auth/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Invalid credentials');
  }
  return res.json();
}

export async function fetchRooms(): Promise<ExamRoom[]> {
  const res = await fetch(`${BASE_URL}/api/rooms`);
  if (!res.ok) throw new Error('Failed to fetch rooms');
  return res.json();
}

export async function createRoom(room: Partial<ExamRoom>): Promise<ExamRoom> {
  const res = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(room)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create room');
  }
  return res.json();
}

export async function updateRoom(id: string, room: Partial<ExamRoom>): Promise<ExamRoom> {
  const res = await fetch(`${BASE_URL}/api/rooms/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(room)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update room');
  }
  return res.json();
}

export async function deleteRoom(id: string): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${BASE_URL}/api/rooms/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete room');
  }
  return res.json();
}

export async function verifyRoom(roomNumber: string, passcode: string): Promise<{
  success: boolean;
  room: ExamRoom;
}> {
  const res = await fetch(`${BASE_URL}/api/rooms/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber, passcode })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Invalid room number or passcode');
  }
  return res.json();
}

export async function fetchAttempts(): Promise<ExamAttempt[]> {
  const res = await fetch(`${BASE_URL}/api/attempts`);
  if (!res.ok) throw new Error('Failed to fetch attempts');
  return res.json();
}

export async function createAttempt(payload: {
  examId: string;
  participantId?: string;
  participantName?: string;
}): Promise<ExamAttempt> {
  const res = await fetch(`${BASE_URL}/api/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create session attempt');
  }
  return res.json();
}

export async function updateAttempt(id: string, payload: Partial<ExamAttempt>): Promise<ExamAttempt> {
  const res = await fetch(`${BASE_URL}/api/attempts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update attempt');
  }
  return res.json();
}

export async function fetchViolations(): Promise<SecurityViolation[]> {
  const res = await fetch(`${BASE_URL}/api/violations`);
  if (!res.ok) throw new Error('Failed to fetch violations');
  return res.json();
}

export async function recordViolation(attemptId: string, reason: string): Promise<{
  violation: SecurityViolation;
  attempt: ExamAttempt;
}> {
  const res = await fetch(`${BASE_URL}/api/violations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attemptId, reason })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to record violation');
  }
  return res.json();
}

// Subscribe to real-time updates via Server-Sent Events (SSE)
export function subscribeToEvents(onUpdate: (event: any) => void): () => void {
  let eventSource: EventSource | null = null;
  let retryTimer: any = null;

  function connect() {
    try {
      eventSource = new EventSource(`${BASE_URL}/api/events`);

      eventSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          onUpdate(parsed);
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // Retry connection in 3 seconds
        retryTimer = setTimeout(connect, 3000);
      };
    } catch {
      retryTimer = setTimeout(connect, 4000);
    }
  }

  connect();

  return () => {
    if (retryTimer) clearTimeout(retryTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}
