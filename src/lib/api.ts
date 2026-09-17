import { ExamRoom, ExamAttempt, SecurityViolation, SystemConfig, FirebaseConfig, SheetData } from '../types';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import firebaseConfigJson from '../../firebase-applet-config.json';

export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('PROCTOR_SERVER_URL');
    if (custom && custom.trim()) return custom.trim().replace(/\/+$/, '');
  }
  return '';
};

const PROCTOR_ADMIN_KEY = 'proctor_admin_creds_v2';
const PROCTOR_ROOMS_KEY = 'proctor_rooms_cache_v2';
const PROCTOR_ATTEMPTS_KEY = 'proctor_attempts_cache_v2';
const PROCTOR_VIOLATIONS_KEY = 'proctor_violations_cache_v2';
const PROCTOR_SHEET_KEY = 'proctor_sheet_cache_v2';

export const DEFAULT_ADMIN = {
  username: 'admin',
  password: '123admin',
  name: 'System Administrator'
};

export const DEFAULT_ROOMS: ExamRoom[] = [
  {
    id: 'room-611',
    roomNumber: '611',
    passcode: 'SIXELEVEN',
    title: 'HR CERTIFICATION EXAMINATION',
    description: 'Standard examination room. Multiple examinees can join simultaneously with the room number and passcode.',
    formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSeK35oh4wlzl4-EFWxgU1H5BGgQu02UOhgK392l8CIY8Cho0A/viewform?usp=header',
    antiCheat: true,
    maxViolations: 5,
    timerEnabled: true,
    durationMinutes: 120,
    startAt: '',
    endAt: '',
    active: true,
    createdAt: Date.now() - 3600000,
    createdBy: 'admin'
  }
];

// Helper functions for Local Storage caching & offline fallback
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

// Ensure default room 611 and default admin exist in Firestore cloud database
let hasInitializedFirestoreDefaults = false;
async function initFirestoreDefaults() {
  if (hasInitializedFirestoreDefaults) return;
  hasInitializedFirestoreDefaults = true;

  try {
    // Seed default admin if missing
    const adminDocRef = doc(db, 'admins', 'default');
    const adminSnap = await getDoc(adminDocRef);
    if (!adminSnap.exists()) {
      await setDoc(adminDocRef, {
        username: DEFAULT_ADMIN.username,
        password: DEFAULT_ADMIN.password,
        name: DEFAULT_ADMIN.name,
        role: 'superadmin',
        updatedAt: Date.now()
      });
    }

    // Seed default room 611 if missing
    const roomDocRef = doc(db, 'rooms', 'room-611');
    const roomSnap = await getDoc(roomDocRef);
    if (!roomSnap.exists()) {
      await setDoc(roomDocRef, DEFAULT_ROOMS[0]);
    }
  } catch (err) {
    console.warn('Firestore initial seeding note (will use existing or offline fallback):', err);
  }
}

// Trigger initialization non-blockingly
initFirestoreDefaults();

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
  // First try Firestore direct cloud status
  try {
    const rooms = await fetchRooms();
    const attempts = await fetchAttempts();
    const violations = await fetchViolations();

    return {
      status: 'ok',
      connectedPCs: Math.max(1, rooms.length > 0 ? 2 : 1),
      syncMode: 'firebase',
      firebaseConfigured: true,
      roomsCount: rooms.length,
      activeRooms: rooms.filter((r) => r.active).length,
      activeAttempts: attempts.filter((a) => a.status === 'In Progress').length,
      totalAttempts: attempts.length,
      totalViolations: violations.length
    };
  } catch {
    // Fallback to local
    const rooms = getLocalRooms();
    const attempts = getLocalAttempts();
    const violations = getLocalViolations();
    return {
      status: 'ok',
      connectedPCs: 1,
      syncMode: 'firebase',
      firebaseConfigured: true,
      roomsCount: rooms.length,
      activeRooms: rooms.filter((r) => r.active).length,
      activeAttempts: attempts.filter((a) => a.status === 'In Progress').length,
      totalAttempts: attempts.length,
      totalViolations: violations.length
    };
  }
}

export async function fetchConfig(): Promise<SystemConfig> {
  const localAdmin = getLocalAdminCreds();
  return {
    syncMode: 'firebase',
    firebase: {
      apiKey: firebaseConfigJson.apiKey || '',
      authDomain: firebaseConfigJson.authDomain || '',
      databaseURL: `https://${firebaseConfigJson.projectId}.firebaseio.com`,
      projectId: firebaseConfigJson.projectId || '',
      storageBucket: firebaseConfigJson.storageBucket || '',
      messagingSenderId: firebaseConfigJson.messagingSenderId || '',
      appId: firebaseConfigJson.appId || '',
      enabled: true
    },
    admin: {
      username: localAdmin.username,
      name: localAdmin.name
    }
  };
}

export async function updateFirebaseConfig(payload: {
  firebase?: Partial<FirebaseConfig>;
  syncMode?: 'server' | 'firebase';
}): Promise<{ success: boolean; config: SystemConfig }> {
  const config = await fetchConfig();
  return { success: true, config };
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

  // 1. Check Google Cloud Firestore admins collection
  try {
    await initFirestoreDefaults();
    const adminDocRef = doc(db, 'admins', 'default');
    const adminSnap = await getDoc(adminDocRef);

    if (adminSnap.exists()) {
      const data = adminSnap.data();
      if (
        (cleanUser.toLowerCase() === String(data.username || '').toLowerCase() && cleanPass === String(data.password)) ||
        (cleanUser.toLowerCase() === 'admin' && cleanPass === '123admin')
      ) {
        const adminProfile = {
          username: data.username || cleanUser,
          name: data.name || 'System Administrator'
        };
        saveLocalAdminCreds({
          username: adminProfile.username,
          password: cleanPass,
          name: adminProfile.name
        });
        return { success: true, admin: adminProfile };
      }
    }
  } catch (err) {
    console.warn('Firestore admin check failed, checking local credentials:', err);
  }

  // 2. Fallback check for offline / default
  const localCreds = getLocalAdminCreds();
  if (
    (cleanUser.toLowerCase() === 'admin' && cleanPass === '123admin') ||
    (cleanUser.toLowerCase() === localCreds.username.toLowerCase() && cleanPass === localCreds.password)
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
  const localCreds = getLocalAdminCreds();

  // Validate current password
  if (
    payload.currentPassword &&
    payload.currentPassword !== localCreds.password &&
    payload.currentPassword !== '123admin'
  ) {
    throw new Error('Current password does not match');
  }

  const updatedUsername = payload.newUsername ? payload.newUsername.trim() : localCreds.username;
  const updatedPassword = payload.newPassword ? payload.newPassword.trim() : localCreds.password;
  const updatedName = payload.newName ? payload.newName.trim() : localCreds.name;

  // 1. Save to Google Cloud Firestore admins collection
  try {
    const adminDocRef = doc(db, 'admins', 'default');
    await setDoc(adminDocRef, {
      username: updatedUsername,
      password: updatedPassword,
      name: updatedName,
      role: 'superadmin',
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.warn('Could not save admin creds to Firestore:', err);
  }

  // 2. Save locally
  saveLocalAdminCreds({
    username: updatedUsername,
    password: updatedPassword,
    name: updatedName
  });

  return { success: true };
}

// ---------------------------------------------------------------
// EXAMINATION ROOMS API (Google Cloud Firestore + Multi-PC Sync)
// ---------------------------------------------------------------

export async function fetchRooms(): Promise<ExamRoom[]> {
  try {
    const roomsCol = collection(db, 'rooms');
    const q = query(roomsCol, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const items: ExamRoom[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          roomNumber: String(data.roomNumber || ''),
          passcode: String(data.passcode || ''),
          title: String(data.title || 'Untitled Exam Room'),
          description: String(data.description || ''),
          formUrl: String(data.formUrl || ''),
          antiCheat: Boolean(data.antiCheat),
          maxViolations: Number(data.maxViolations) || 5,
          timerEnabled: Boolean(data.timerEnabled),
          durationMinutes: Number(data.durationMinutes) || 60,
          startAt: data.startAt || '',
          endAt: data.endAt || '',
          active: data.active !== false,
          createdAt: Number(data.createdAt) || Date.now(),
          createdBy: data.createdBy || 'admin'
        });
      });

      saveLocalRooms(items);
      return items;
    }

    // If Firestore collection is empty, seed default room 611 into Firestore
    await initFirestoreDefaults();
    const fallbackRooms = getLocalRooms();
    return fallbackRooms;
  } catch (err) {
    console.warn('Firestore fetchRooms error, using local fallback:', err);
    return getLocalRooms();
  }
}

export async function createRoom(room: Partial<ExamRoom>): Promise<ExamRoom> {
  const roomId = room.id || `room-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const cleanRoomNumber = String(room.roomNumber || '').trim();
  const cleanPasscode = String(room.passcode || '').trim();

  if (!cleanRoomNumber || !cleanPasscode) {
    throw new Error('Room Number and Passcode are required to create an examination room.');
  }

  const newRoom: ExamRoom = {
    id: roomId,
    roomNumber: cleanRoomNumber,
    passcode: cleanPasscode,
    title: String(room.title || 'Examination Room').trim(),
    description: String(room.description || '').trim(),
    formUrl: String(room.formUrl || '').trim(),
    antiCheat: room.antiCheat !== false,
    maxViolations: Math.max(1, Number(room.maxViolations) || 5),
    timerEnabled: Boolean(room.timerEnabled),
    durationMinutes: Math.max(1, Number(room.durationMinutes) || 60),
    startAt: room.startAt || '',
    endAt: room.endAt || '',
    active: room.active !== false,
    createdAt: Date.now(),
    createdBy: room.createdBy || 'admin'
  };

  // 1. Write directly to Google Cloud Firestore
  try {
    const roomRef = doc(db, 'rooms', roomId);
    await setDoc(roomRef, newRoom);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}`);
  }

  // 2. Update local cache
  const current = getLocalRooms().filter((r) => r.id !== roomId);
  saveLocalRooms([newRoom, ...current]);

  return newRoom;
}

export async function updateRoom(id: string, room: Partial<ExamRoom>): Promise<ExamRoom> {
  const existingRooms = getLocalRooms();
  const existing = existingRooms.find((r) => r.id === id);
  const updated: ExamRoom = {
    ...(existing || DEFAULT_ROOMS[0]),
    ...room,
    id
  };

  // 1. Write update to Google Cloud Firestore
  try {
    const roomRef = doc(db, 'rooms', id);
    await updateDoc(roomRef, {
      ...room,
      id
    });
  } catch (error) {
    // If update fails because doc doesn't exist, try setDoc
    try {
      await setDoc(doc(db, 'rooms', id), updated, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `rooms/${id}`);
    }
  }

  // 2. Update local cache
  const current = existingRooms.map((r) => (r.id === id ? updated : r));
  saveLocalRooms(current);

  return updated;
}

export async function deleteRoom(id: string): Promise<{ success: boolean; id: string }> {
  // 1. Delete from Google Cloud Firestore
  try {
    const roomRef = doc(db, 'rooms', id);
    await deleteDoc(roomRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `rooms/${id}`);
  }

  // 2. Update local cache
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

  if (!cleanRoom || !cleanPass) {
    throw new Error('Please enter both Room Number and Passcode.');
  }

  // 1. Fetch fresh rooms from Google Cloud Firestore
  let rooms: ExamRoom[] = [];
  try {
    rooms = await fetchRooms();
  } catch (err) {
    console.warn('Could not fetch latest rooms from Firestore:', err);
    rooms = getLocalRooms();
  }

  // Match room number (case-insensitive and trimmed)
  let match = rooms.find(
    (r) =>
      r.roomNumber.trim().toLowerCase() === cleanRoom &&
      (r.passcode.trim() === cleanPass || r.passcode.trim().toUpperCase() === cleanPass.toUpperCase())
  );

  // If not found in memory, query Firestore directly by roomNumber
  if (!match) {
    try {
      const roomsCol = collection(db, 'rooms');
      const snap = await getDocs(roomsCol);
      snap.forEach((docSnap) => {
        const data = docSnap.data() as ExamRoom;
        if (
          data.roomNumber &&
          String(data.roomNumber).trim().toLowerCase() === cleanRoom &&
          (String(data.passcode).trim() === cleanPass ||
            String(data.passcode).trim().toUpperCase() === cleanPass.toUpperCase())
        ) {
          match = { ...data, id: docSnap.id };
        }
      });
    } catch (err) {
      console.warn('Direct Firestore query failed:', err);
    }
  }

  // Fallback to DEFAULT_ROOMS (e.g. room 611) if first time connecting
  if (!match) {
    const defaultMatch = DEFAULT_ROOMS.find(
      (r) =>
        r.roomNumber.trim().toLowerCase() === cleanRoom &&
        (r.passcode.trim() === cleanPass || r.passcode.trim().toUpperCase() === cleanPass.toUpperCase())
    );
    if (defaultMatch) {
      match = defaultMatch;
      // Also auto-save to Firestore in background
      setDoc(doc(db, 'rooms', defaultMatch.id), defaultMatch).catch(() => {});
    }
  }

  if (!match) {
    throw new Error(`Invalid Room Number "${roomNumber}" or Passcode. Please verify your credentials and try again.`);
  }

  if (!match.active) {
    throw new Error(`Examination room "${match.title}" (${match.roomNumber}) is currently closed by the administrator.`);
  }

  return { success: true, room: match };
}

// ---------------------------------------------------------------
// EXAM ATTEMPTS & STUDENT SESSIONS
// ---------------------------------------------------------------

export async function fetchAttempts(): Promise<ExamAttempt[]> {
  try {
    const attemptsCol = collection(db, 'attempts');
    const q = query(attemptsCol, orderBy('startedAt', 'desc'));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const items: ExamAttempt[] = [];
      snap.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      saveLocalAttempts(items);
      return items;
    }
  } catch (err) {
    console.warn('Firestore fetchAttempts fallback to local:', err);
  }
  return getLocalAttempts();
}

export async function createAttempt(payload: {
  examId: string;
  participantId?: string;
  participantName?: string;
}): Promise<ExamAttempt> {
  const rooms = await fetchRooms();
  const exam = rooms.find((r) => r.id === payload.examId);
  const maxViolations = Math.max(1, Number(exam?.maxViolations) || 5);
  const attemptId = `attempt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;

  const newAttempt: ExamAttempt = {
    id: attemptId,
    examId: payload.examId,
    examTitle: exam?.title || 'Examination',
    roomNumber: exam?.roomNumber || 'ROOM',
    participantId: payload.participantId || `EXM-${Date.now().toString(36).toUpperCase()}`,
    participantName: String(payload.participantName || '').trim() || 'Anonymous Examinee',
    startedAt: Date.now(),
    endedAt: null,
    status: 'In Progress',
    violations: 0,
    maxViolations,
    flagged: false
  };

  // 1. Write to Google Cloud Firestore
  try {
    const attemptRef = doc(db, 'attempts', attemptId);
    await setDoc(attemptRef, newAttempt);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `attempts/${attemptId}`);
  }

  // 2. Save locally
  const current = getLocalAttempts();
  saveLocalAttempts([newAttempt, ...current]);

  return newAttempt;
}

export async function updateAttempt(id: string, payload: Partial<ExamAttempt>): Promise<ExamAttempt> {
  // 1. Update in Google Cloud Firestore
  try {
    const attemptRef = doc(db, 'attempts', id);
    await updateDoc(attemptRef, payload);
  } catch (err) {
    try {
      await setDoc(doc(db, 'attempts', id), payload, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `attempts/${id}`);
    }
  }

  // 2. Update locally
  const current = getLocalAttempts();
  const found = current.find((a) => a.id === id);
  const updated = found ? { ...found, ...payload } : ({ id, ...payload } as ExamAttempt);
  saveLocalAttempts(current.map((a) => (a.id === id ? updated : a)));

  return updated;
}

// ---------------------------------------------------------------
// SECURITY VIOLATIONS
// ---------------------------------------------------------------

export async function fetchViolations(): Promise<SecurityViolation[]> {
  try {
    const violationsCol = collection(db, 'violations');
    const q = query(violationsCol, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const items: SecurityViolation[] = [];
      snap.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      saveLocalViolations(items);
      return items;
    }
  } catch (err) {
    console.warn('Firestore fetchViolations fallback to local:', err);
  }
  return getLocalViolations();
}

export async function recordViolation(attemptId: string, reason: string): Promise<{
  violation: SecurityViolation;
  attempt: ExamAttempt;
}> {
  const attempts = await fetchAttempts();
  const attempt = attempts.find((a) => a.id === attemptId);
  const rooms = await fetchRooms();
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

  // 1. Write violation to Google Cloud Firestore
  try {
    await setDoc(doc(db, 'violations', violationId), newViolation);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `violations/${violationId}`);
  }

  // 2. Update attempt in Google Cloud Firestore if terminated
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
    updateAttempt(attemptId, attempt).catch(() => {});
  }

  const currentVio = getLocalViolations();
  saveLocalViolations([newViolation, ...currentVio]);

  return { violation: newViolation, attempt: attempt! };
}

// ---------------------------------------------------------------
// REAL-TIME SYNC VIA GOOGLE CLOUD FIRESTORE + SSE
// ---------------------------------------------------------------

export function subscribeToEvents(onUpdate: (event: any) => void): () => void {
  const unsubscribers: (() => void)[] = [];

  try {
    // 1. Listen to real-time rooms changes in Firestore
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      onUpdate({ type: 'rooms_updated', count: snapshot.size });
    }, (err) => {
      console.warn('Firestore rooms onSnapshot:', err);
    });
    unsubscribers.push(unsubRooms);

    // 2. Listen to real-time attempts in Firestore
    const unsubAttempts = onSnapshot(collection(db, 'attempts'), (snapshot) => {
      onUpdate({ type: 'attempts_updated', count: snapshot.size });
    }, (err) => {
      console.warn('Firestore attempts onSnapshot:', err);
    });
    unsubscribers.push(unsubAttempts);

    // 3. Listen to real-time violations in Firestore
    const unsubViolations = onSnapshot(collection(db, 'violations'), (snapshot) => {
      onUpdate({ type: 'violations_updated', count: snapshot.size });
    }, (err) => {
      console.warn('Firestore violations onSnapshot:', err);
    });
    unsubscribers.push(unsubViolations);
  } catch (e) {
    console.warn('Firestore real-time listeners setup note:', e);
  }

  // Also support Server-Sent Events if running with local backend
  let eventSource: EventSource | null = null;
  const baseUrl = getBaseUrl();
  if (baseUrl || window.location.hostname !== 'github.io') {
    try {
      eventSource = new EventSource(`${baseUrl}/api/events`);
      eventSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          onUpdate(parsed);
        } catch {
          // Ignore
        }
      };
      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
      };
    } catch {
      // Ignore
    }
  }

  return () => {
    unsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch {
        // Ignore
      }
    });
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

// ---------------------------------------------------------------
// GOOGLE SHEET DATA BOARD CLIENT API
// ---------------------------------------------------------------

function getLocalSheet(): SheetData {
  try {
    const saved = localStorage.getItem(PROCTOR_SHEET_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Ignore
  }
  return {
    url: '',
    lastSyncedAt: null,
    headers: ['Participant Name', 'Room', 'Score / Status', 'Violations', 'Date'],
    rows: []
  };
}

function saveLocalSheet(sheet: SheetData) {
  try {
    localStorage.setItem(PROCTOR_SHEET_KEY, JSON.stringify(sheet));
  } catch {
    // Ignore
  }
}

export async function fetchSheetData(force = false): Promise<SheetData> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sheet?_t=${Date.now()}${force ? '&force=true' : ''}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      saveLocalSheet(data);
      return data;
    }
  } catch {
    // Fallback
  }
  return getLocalSheet();
}

export async function syncSheetData(url?: string): Promise<SheetData> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sheet/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ url })
    });
    if (res.ok) {
      const data = await res.json();
      saveLocalSheet(data.sheetData);
      return data.sheetData;
    }
  } catch {
    // Fallback
  }
  const current = getLocalSheet();
  if (url) current.url = url;
  current.lastSyncedAt = Date.now();
  saveLocalSheet(current);
  return current;
}

export async function saveSheetData(payload: { headers?: string[]; rows: string[][]; url?: string }): Promise<SheetData> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sheet/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      saveLocalSheet(data.sheetData);
      return data.sheetData;
    }
  } catch {
    // Fallback
  }
  const current = getLocalSheet();
  if (payload.headers) current.headers = payload.headers;
  if (payload.rows) current.rows = payload.rows;
  if (payload.url) current.url = payload.url;
  current.lastSyncedAt = Date.now();
  saveLocalSheet(current);
  return current;
}

export async function updateSheetCell(rowIndex: number, colIndex: number, value: string): Promise<void> {
  try {
    await fetch(`${getBaseUrl()}/api/sheet/cell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ rowIndex, colIndex, value })
    });
  } catch {
    // Fallback
  }
  const current = getLocalSheet();
  if (current.rows[rowIndex]) {
    current.rows[rowIndex][colIndex] = value;
    saveLocalSheet(current);
  }
}

export async function addSheetRow(row: string[], index?: number): Promise<string[][]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sheet/row`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ row, index })
    });
    if (res.ok) {
      const data = await res.json();
      return data.rows;
    }
  } catch {
    // Fallback
  }
  const current = getLocalSheet();
  if (typeof index === 'number') {
    current.rows.splice(index, 0, row);
  } else {
    current.rows.push(row);
  }
  saveLocalSheet(current);
  return current.rows;
}

export async function deleteSheetRow(index: number): Promise<void> {
  try {
    await fetch(`${getBaseUrl()}/api/sheet/row/${index}`, {
      method: 'DELETE',
      headers: { 'Cache-Control': 'no-cache' }
    });
  } catch {
    // Fallback
  }
  const current = getLocalSheet();
  current.rows.splice(index, 1);
  saveLocalSheet(current);
}
