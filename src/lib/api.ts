import { ExamRoom, ExamAttempt, SecurityViolation, SystemConfig, FirebaseConfig } from '../types';

const BASE_URL = '';

const PROCTOR_ADMIN_KEY = 'proctor_admin_creds_v2';
const PROCTOR_ROOMS_KEY = 'proctor_rooms_cache_v2';
const PROCTOR_ATTEMPTS_KEY = 'proctor_attempts_cache_v2';
const PROCTOR_VIOLATIONS_KEY = 'proctor_violations_cache_v2';
const PROCTOR_CONFIG_KEY = 'proctor_config_cache_v2';

const DEFAULT_ADMIN = {
  username: 'admin',
  password: '123admin',
  name: 'System Administrator'
};

const DEFAULT_ROOMS: ExamRoom[] = [
  {
    id: 'sample-room-1',
    roomNumber: '101202',
    passcode: 'PASS99',
    title: 'General Assessment & Knowledge Check',
    description: 'Standard examination room. Multiple examinees can join simultaneously with the room number and passcode.',
    formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSeK35oh4wlzl4-EFWxgU1H5BGgQu02UOhgK392l8CIY8Cho0A/viewform?usp=header',
    antiCheat: true,
    maxViolations: 5,
    timerEnabled: true,
    durationMinutes: 60,
    startAt: '',
    endAt: '',
    active: true,
    createdAt: Date.now() - 3600000,
    createdBy: 'admin'
  }
];

// Helper functions for Local Storage caching & GitHub Pages / Static fallback
function getLocalAdminCreds() {
  try {
    const saved = localStorage.getItem(PROCTOR_ADMIN_KEY);
    return saved ? { ...DEFAULT_ADMIN, ...JSON.parse(saved) } : DEFAULT_ADMIN;
  } catch {
    return DEFAULT_ADMIN;
  }
}

function saveLocalAdminCreds(creds: Partial<typeof DEFAULT_ADMIN>) {
  try {
    const current = getLocalAdminCreds();
    localStorage.setItem(PROCTOR_ADMIN_KEY, JSON.stringify({ ...current, ...creds }));
  } catch {
    // Ignore storage quota
  }
}

function getLocalRooms(): ExamRoom[] {
  try {
    const saved = localStorage.getItem(PROCTOR_ROOMS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Fallback
  }
  return DEFAULT_ROOMS;
}

function saveLocalRooms(rooms: ExamRoom[]) {
  try {
    localStorage.setItem(PROCTOR_ROOMS_KEY, JSON.stringify(rooms));
  } catch {
    // Ignore storage quota
  }
}

function getLocalAttempts(): ExamAttempt[] {
  try {
    const saved = localStorage.getItem(PROCTOR_ATTEMPTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveLocalAttempts(attempts: ExamAttempt[]) {
  try {
    localStorage.setItem(PROCTOR_ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch {
    // Ignore storage quota
  }
}

function getLocalViolations(): SecurityViolation[] {
  try {
    const saved = localStorage.getItem(PROCTOR_VIOLATIONS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveLocalViolations(violations: SecurityViolation[]) {
  try {
    localStorage.setItem(PROCTOR_VIOLATIONS_KEY, JSON.stringify(violations));
  } catch {
    // Ignore storage quota
  }
}

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
  try {
    const res = await fetch(`${BASE_URL}/api/status`);
    if (res.ok) return await res.json();
  } catch {
    // Fallback for static/GitHub Pages
  }

  const rooms = getLocalRooms();
  const attempts = getLocalAttempts();
  const violations = getLocalViolations();
  return {
    status: 'ok',
    connectedPCs: 1,
    syncMode: 'server',
    firebaseConfigured: false,
    roomsCount: rooms.length,
    activeRooms: rooms.filter((r) => r.active).length,
    activeAttempts: attempts.filter((a) => a.status === 'In Progress').length,
    totalAttempts: attempts.length,
    totalViolations: violations.length
  };
}

export async function fetchConfig(): Promise<SystemConfig> {
  try {
    const res = await fetch(`${BASE_URL}/api/config`);
    if (res.ok) return await res.json();
  } catch {
    // Fallback
  }

  const adminCreds = getLocalAdminCreds();
  return {
    syncMode: 'server',
    firebase: {
      apiKey: '',
      authDomain: '',
      databaseURL: '',
      projectId: '',
      enabled: false
    },
    admin: {
      username: adminCreds.username,
      name: adminCreds.name
    }
  };
}

export async function updateFirebaseConfig(payload: {
  firebase?: Partial<FirebaseConfig>;
  syncMode?: 'server' | 'firebase';
}): Promise<{ success: boolean; config: SystemConfig }> {
  try {
    const res = await fetch(`${BASE_URL}/api/config/firebase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) return await res.json();
  } catch {
    // Fallback
  }

  const adminCreds = getLocalAdminCreds();
  const currentConfig: SystemConfig = {
    syncMode: payload.syncMode || 'server',
    firebase: {
      apiKey: payload.firebase?.apiKey || '',
      authDomain: payload.firebase?.authDomain || '',
      databaseURL: payload.firebase?.databaseURL || '',
      projectId: payload.firebase?.projectId || '',
      enabled: Boolean(payload.firebase?.enabled)
    },
    admin: {
      username: adminCreds.username,
      name: adminCreds.name
    }
  };
  return { success: true, config: currentConfig };
}

export async function adminLogin(username: string, password: string): Promise<{
  success: boolean;
  admin: { username: string; name: string };
}> {
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '').trim();

  if (!cleanUser || !cleanPass) {
    throw new Error('Username and password are required');
  }

  // 1. First attempt verification against backend server
  try {
    const res = await fetch(`${BASE_URL}/api/auth/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUser, password: cleanPass })
    });

    if (res.ok) {
      const data = await res.json();
      saveLocalAdminCreds({
        username: data.admin?.username || cleanUser,
        name: data.admin?.name || 'System Administrator'
      });
      return data;
    }

    // If server responded with 401 or 400 (explicit authentication rejection)
    if (res.status === 401 || res.status === 400) {
      const localCreds = getLocalAdminCreds();
      // Allow default login as well as locally verified credentials
      if (
        (cleanUser.toLowerCase() === 'admin' && cleanPass === '123admin') ||
        (cleanUser.toLowerCase() === localCreds.username.toLowerCase() && cleanPass === localCreds.password)
      ) {
        return {
          success: true,
          admin: { username: localCreds.username || 'admin', name: localCreds.name || 'System Administrator' }
        };
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Incorrect administrator username or password');
    }

    // If 404 or 5xx: Backend server is not running (e.g. GitHub Pages or static host)
    if (res.status === 404 || res.status >= 500) {
      return checkOfflineAdminAuth(cleanUser, cleanPass);
    }
  } catch (err: any) {
    // If network error (TypeError, failed to fetch, offline, GitHub Pages static)
    if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('Failed to fetch')) {
      return checkOfflineAdminAuth(cleanUser, cleanPass);
    }
    throw err;
  }

  return checkOfflineAdminAuth(cleanUser, cleanPass);
}

function checkOfflineAdminAuth(username: string, pass: string): {
  success: boolean;
  admin: { username: string; name: string };
} {
  const localCreds = getLocalAdminCreds();
  const inputUser = username.trim().toLowerCase();
  const inputPass = pass.trim();

  if (
    (inputUser === 'admin' && inputPass === '123admin') ||
    (inputUser === localCreds.username.toLowerCase() && inputPass === localCreds.password)
  ) {
    return {
      success: true,
      admin: {
        username: localCreds.username || 'admin',
        name: localCreds.name || 'System Administrator'
      }
    };
  }

  throw new Error('Incorrect administrator username or password');
}

export async function updateAdminCredentials(payload: {
  currentPassword?: string;
  newUsername?: string;
  newPassword?: string;
  newName?: string;
}): Promise<{ success: boolean }> {
  try {
    const res = await fetch(`${BASE_URL}/api/config/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      if (payload.newUsername || payload.newPassword || payload.newName) {
        saveLocalAdminCreds({
          ...(payload.newUsername ? { username: payload.newUsername.trim() } : {}),
          ...(payload.newPassword ? { password: payload.newPassword.trim() } : {}),
          ...(payload.newName ? { name: payload.newName.trim() } : {})
        });
      }
      return await res.json();
    }
  } catch {
    // Fallback for static hosting
  }

  const localCreds = getLocalAdminCreds();
  if (payload.currentPassword && payload.currentPassword !== localCreds.password && payload.currentPassword !== '123admin') {
    throw new Error('Current password does not match');
  }

  saveLocalAdminCreds({
    username: payload.newUsername ? payload.newUsername.trim() : localCreds.username,
    password: payload.newPassword ? payload.newPassword.trim() : localCreds.password,
    name: payload.newName ? payload.newName.trim() : localCreds.name
  });

  return { success: true };
}

export async function fetchRooms(): Promise<ExamRoom[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/rooms`);
    if (res.ok) {
      const data = await res.json();
      saveLocalRooms(data);
      return data;
    }
  } catch {
    // Static fallback
  }
  return getLocalRooms();
}

export async function createRoom(room: Partial<ExamRoom>): Promise<ExamRoom> {
  try {
    const res = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room)
    });
    if (res.ok) {
      const created = await res.json();
      const current = getLocalRooms();
      saveLocalRooms([created, ...current]);
      return created;
    }
    if (res.status === 400) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create room');
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('fetch')) {
      throw err;
    }
  }

  // Local fallback creation
  const id = `room-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  const newRoom: ExamRoom = {
    id,
    roomNumber: String(room.roomNumber || '').trim(),
    passcode: String(room.passcode || '').trim(),
    title: String(room.title || '').trim(),
    description: String(room.description || '').trim(),
    formUrl: String(room.formUrl || '').trim(),
    antiCheat: room.antiCheat !== false,
    maxViolations: Math.max(1, Number(room.maxViolations) || 3),
    timerEnabled: room.timerEnabled !== false,
    durationMinutes: Math.max(1, Number(room.durationMinutes) || 60),
    startAt: room.startAt || '',
    endAt: room.endAt || '',
    active: room.active !== false,
    createdAt: Date.now(),
    createdBy: 'admin'
  };

  const current = getLocalRooms();
  saveLocalRooms([newRoom, ...current]);
  return newRoom;
}

export async function updateRoom(id: string, room: Partial<ExamRoom>): Promise<ExamRoom> {
  try {
    const res = await fetch(`${BASE_URL}/api/rooms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room)
    });
    if (res.ok) {
      const updated = await res.json();
      const current = getLocalRooms().map((r) => (r.id === id ? updated : r));
      saveLocalRooms(current);
      return updated;
    }
  } catch {
    // Fallback
  }

  const current = getLocalRooms();
  const found = current.find((r) => r.id === id);
  if (!found) throw new Error('Room not found');
  const updated = { ...found, ...room };
  saveLocalRooms(current.map((r) => (r.id === id ? updated : r)));
  return updated;
}

export async function deleteRoom(id: string): Promise<{ success: boolean; id: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/rooms/${id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const current = getLocalRooms().filter((r) => r.id !== id);
      saveLocalRooms(current);
      return { success: true, id };
    }
  } catch {
    // Fallback
  }

  const current = getLocalRooms().filter((r) => r.id !== id);
  saveLocalRooms(current);
  return { success: true, id };
}

export async function verifyRoom(roomNumber: string, passcode: string): Promise<{
  success: boolean;
  room: ExamRoom;
}> {
  const cleanRoom = String(roomNumber || '').trim().toLowerCase();
  const cleanPass = String(passcode || '').trim();

  try {
    const res = await fetch(`${BASE_URL}/api/rooms/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomNumber: cleanRoom, passcode: cleanPass })
    });
    if (res.ok) {
      return await res.json();
    }
    if (res.status === 404 || res.status === 403) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Invalid room number or passcode');
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('fetch')) {
      throw err;
    }
  }

  // Local fallback
  const rooms = getLocalRooms();
  const match = rooms.find(
    (r) => r.roomNumber.toLowerCase() === cleanRoom && r.passcode === cleanPass
  );

  if (!match) {
    throw new Error('Invalid Room Number or Passcode. Please check and try again.');
  }

  if (!match.active) {
    throw new Error('This examination room is currently closed by the administrator.');
  }

  return { success: true, room: match };
}

export async function fetchAttempts(): Promise<ExamAttempt[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/attempts`);
    if (res.ok) {
      const data = await res.json();
      saveLocalAttempts(data);
      return data;
    }
  } catch {
    // Fallback
  }
  return getLocalAttempts();
}

export async function createAttempt(payload: {
  examId: string;
  participantId?: string;
  participantName?: string;
}): Promise<ExamAttempt> {
  try {
    const res = await fetch(`${BASE_URL}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const created = await res.json();
      const current = getLocalAttempts();
      saveLocalAttempts([created, ...current]);
      return created;
    }
  } catch {
    // Fallback
  }

  const rooms = getLocalRooms();
  const exam = rooms.find((r) => r.id === payload.examId);
  const maxViolations = Math.max(1, Number(exam?.maxViolations) || 5);
  const attemptId = `attempt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  const newAttempt: ExamAttempt = {
    id: attemptId,
    examId: payload.examId,
    examTitle: exam?.title || 'Examination',
    roomNumber: exam?.roomNumber || 'ROOM',
    participantId: payload.participantId || `EXM-${Date.now().toString(36).toUpperCase()}`,
    participantName: String(payload.participantName || '').trim(),
    startedAt: Date.now(),
    endedAt: null,
    status: 'In Progress',
    violations: 0,
    maxViolations,
    flagged: false
  };

  const current = getLocalAttempts();
  saveLocalAttempts([newAttempt, ...current]);
  return newAttempt;
}

export async function updateAttempt(id: string, payload: Partial<ExamAttempt>): Promise<ExamAttempt> {
  try {
    const res = await fetch(`${BASE_URL}/api/attempts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const updated = await res.json();
      const current = getLocalAttempts().map((a) => (a.id === id ? updated : a));
      saveLocalAttempts(current);
      return updated;
    }
  } catch {
    // Fallback
  }

  const current = getLocalAttempts();
  const found = current.find((a) => a.id === id);
  if (!found) throw new Error('Attempt not found');
  const updated = { ...found, ...payload };
  saveLocalAttempts(current.map((a) => (a.id === id ? updated : a)));
  return updated;
}

export async function fetchViolations(): Promise<SecurityViolation[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/violations`);
    if (res.ok) {
      const data = await res.json();
      saveLocalViolations(data);
      return data;
    }
  } catch {
    // Fallback
  }
  return getLocalViolations();
}

export async function recordViolation(attemptId: string, reason: string): Promise<{
  violation: SecurityViolation;
  attempt: ExamAttempt;
}> {
  try {
    const res = await fetch(`${BASE_URL}/api/violations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId, reason })
    });
    if (res.ok) {
      const data = await res.json();
      const currentVio = getLocalViolations();
      saveLocalViolations([data.violation, ...currentVio]);
      return data;
    }
  } catch {
    // Fallback
  }

  const attempts = getLocalAttempts();
  const attempt = attempts.find((a) => a.id === attemptId);
  const rooms = getLocalRooms();
  const exam = rooms.find((r) => r.id === attempt?.examId);
  const maxViolations = attempt?.maxViolations || exam?.maxViolations || 5;

  const violationNumber = (attempt?.violations || 0) + 1;
  const violationId = `vio-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

  const newViolation: SecurityViolation = {
    id: violationId,
    attemptId,
    examId: attempt?.examId || '',
    examTitle: attempt?.examTitle || '',
    roomNumber: attempt?.roomNumber || '',
    participantId: attempt?.participantId || '',
    number: violationNumber,
    reason: String(reason || 'Security event detected'),
    timestamp: Date.now()
  };

  if (attempt) {
    attempt.violations = violationNumber;
    if (violationNumber >= maxViolations) {
      attempt.flagged = true;
      attempt.status = 'Terminated';
      if (!attempt.endedAt) {
        attempt.endedAt = Date.now();
        attempt.durationSeconds = Math.max(0, Math.round((attempt.endedAt - attempt.startedAt) / 1000));
      }
    }
    saveLocalAttempts(attempts);
  }

  const currentVio = getLocalViolations();
  saveLocalViolations([newViolation, ...currentVio]);
  return { violation: newViolation, attempt: attempt! };
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
        // Retry connection in 6 seconds, silent fail if static host
        retryTimer = setTimeout(connect, 6000);
      };
    } catch {
      retryTimer = setTimeout(connect, 6000);
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
