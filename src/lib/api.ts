import { ExamRoom, ExamAttempt, SecurityViolation, SystemConfig, FirebaseConfig, SheetData } from '../types';

export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('PROCTOR_SERVER_URL');
    if (custom && custom.trim()) return custom.trim().replace(/\/+$/, '');
  }
  return '';
};

const BASE_URL = getBaseUrl();

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
    const res = await fetch(`${getBaseUrl()}/api/status?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
    });
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
    const res = await fetch(`${getBaseUrl()}/api/config?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
    });
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
    const res = await fetch(`${getBaseUrl()}/api/config/firebase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
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
    const res = await fetch(`${getBaseUrl()}/api/rooms?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        saveLocalRooms(data);
        return data;
      }
    }
  } catch (err) {
    console.warn('Could not fetch rooms from server, checking local fallback:', err);
  }
  return getLocalRooms();
}

export async function createRoom(room: Partial<ExamRoom>): Promise<ExamRoom> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(room)
    });

    if (res.ok) {
      const created = await res.json();
      const current = getLocalRooms().filter(r => r.id !== created.id);
      saveLocalRooms([created, ...current]);
      return created;
    }

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to create room on server (Status ${res.status})`);
  } catch (err: any) {
    console.error('Failed to create room:', err);
    throw err;
  }
}

export async function updateRoom(id: string, room: Partial<ExamRoom>): Promise<ExamRoom> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/rooms/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(room)
    });

    if (res.ok) {
      const updated = await res.json();
      const current = getLocalRooms().map((r) => (r.id === id ? updated : r));
      saveLocalRooms(current);
      return updated;
    }

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update room on server (Status ${res.status})`);
  } catch (err: any) {
    console.error('Failed to update room:', err);
    throw err;
  }
}

export async function deleteRoom(id: string): Promise<{ success: boolean; id: string }> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/rooms/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (res.ok) {
      const current = getLocalRooms().filter((r) => r.id !== id);
      saveLocalRooms(current);
      return { success: true, id };
    }

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to delete room (Status ${res.status})`);
  } catch (err: any) {
    console.error('Failed to delete room:', err);
    throw err;
  }
}

export async function verifyRoom(roomNumber: string, passcode: string): Promise<{
  success: boolean;
  room: ExamRoom;
}> {
  const cleanRoom = String(roomNumber || '').trim().toLowerCase();
  const cleanPass = String(passcode || '').trim();

  try {
    const res = await fetch(`${getBaseUrl()}/api/rooms/verify?_t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({ roomNumber: cleanRoom, passcode: cleanPass })
    });

    if (res.ok) {
      return await res.json();
    }

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Invalid Room Number or Passcode');
  } catch (err: any) {
    if (err.message && !err.message.includes('fetch') && !err.message.includes('NetworkError')) {
      throw err;
    }

    // Local fallback only if offline / server disconnected
    const rooms = getLocalRooms();
    const match = rooms.find(
      (r) =>
        r.roomNumber.trim().toLowerCase() === cleanRoom &&
        (r.passcode.trim() === cleanPass || r.passcode.trim().toUpperCase() === cleanPass.toUpperCase())
    );

    if (!match) {
      throw new Error('Invalid Room Number or Passcode. Please check and try again.');
    }

    if (!match.active) {
      throw new Error('This examination room is currently closed by the administrator.');
    }

    return { success: true, room: match };
  }
}

export async function fetchAttempts(): Promise<ExamAttempt[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/attempts?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
    });
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
    const res = await fetch(`${getBaseUrl()}/api/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
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
    const res = await fetch(`${getBaseUrl()}/api/attempts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
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
    const res = await fetch(`${getBaseUrl()}/api/violations?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
    });
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
    const res = await fetch(`${getBaseUrl()}/api/violations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
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
      eventSource = new EventSource(`${getBaseUrl()}/api/events`);

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
        // Retry connection in 3 seconds to keep sync robust
        retryTimer = setTimeout(connect, 3000);
      };
    } catch {
      retryTimer = setTimeout(connect, 3000);
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

// ---------------------------------------------------------------
// GOOGLE SHEET DATA BOARD CLIENT API
// ---------------------------------------------------------------

export async function fetchSheetData(force = false): Promise<SheetData> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sheet?_t=${Date.now()}${force ? '&force=true' : ''}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
    });
    if (!res.ok) throw new Error(`Failed to fetch sheet data: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error('fetchSheetData error:', err);
    throw err;
  }
}

export async function syncSheetData(url?: string): Promise<SheetData> {
  const res = await fetch(`${getBaseUrl()}/api/sheet/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error(`Failed to sync sheet: ${res.statusText}`);
  const data = await res.json();
  return data.sheetData;
}

export async function saveSheetData(payload: { headers?: string[]; rows: string[][]; url?: string }): Promise<SheetData> {
  const res = await fetch(`${getBaseUrl()}/api/sheet/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Failed to save sheet: ${res.statusText}`);
  const data = await res.json();
  return data.sheetData;
}

export async function updateSheetCell(rowIndex: number, colIndex: number, value: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/api/sheet/cell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify({ rowIndex, colIndex, value })
  });
  if (!res.ok) throw new Error(`Failed to update cell: ${res.statusText}`);
}

export async function addSheetRow(row: string[], index?: number): Promise<string[][]> {
  const res = await fetch(`${getBaseUrl()}/api/sheet/row`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify({ row, index })
  });
  if (!res.ok) throw new Error(`Failed to add row: ${res.statusText}`);
  const data = await res.json();
  return data.rows;
}

export async function deleteSheetRow(index: number): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/api/sheet/row/${index}`, {
    method: 'DELETE',
    headers: { 'Cache-Control': 'no-cache' }
  });
  if (!res.ok) throw new Error(`Failed to delete row: ${res.statusText}`);
}
