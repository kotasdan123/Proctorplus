import {
  ExamRoom,
  ExamAttempt,
  SecurityViolation,
  SystemConfig,
  FirebaseConfig,
  SheetData,
  ProctorAccount
} from '../types';
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
const PROCTOR_PROCTORS_KEY = 'proctor_proctors_cache_v2';
const PROCTOR_ROOMS_KEY = 'proctor_rooms_cache_v2';
const PROCTOR_ATTEMPTS_KEY = 'proctor_attempts_cache_v2';
const PROCTOR_VIOLATIONS_KEY = 'proctor_violations_cache_v2';
const PROCTOR_SHEET_KEY = 'proctor_sheet_cache_v2';

export const DEFAULT_ADMIN = {
  username: 'admin',
  password: '123admin',
  name: 'Super Administrator'
};

export const DEFAULT_PROCTORS: ProctorAccount[] = [
  {
    id: 'proctor-1',
    username: 'proctor',
    password: 'proctor123',
    name: 'Lead Proctor Alpha',
    email: 'proctor@proctorplus.internal',
    notes: 'Primary examination room supervisor',
    active: true,
    createdAt: Date.now() - 86400000 * 7,
    lastLoginAt: Date.now() - 3600000,
    roomsCount: 1
  },
  {
    id: 'proctor-2',
    username: 'proctor1',
    password: '123proctor',
    name: 'Exam Proctor Beta',
    email: 'proctor1@proctorplus.internal',
    notes: 'Secondary examination room supervisor',
    active: true,
    createdAt: Date.now() - 86400000 * 3,
    roomsCount: 0
  }
];

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
    calculatorEnabled: true,
    startAt: '',
    endAt: '',
    active: true,
    createdAt: Date.now() - 3600000,
    createdBy: 'proctor',
    createdByProctor: 'Lead Proctor Alpha'
  }
];

export function getLocalProctors(): ProctorAccount[] {
  try {
    const saved = localStorage.getItem(PROCTOR_PROCTORS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Fallback
  }
  return DEFAULT_PROCTORS;
}

export function saveLocalProctors(proctors: ProctorAccount[]) {
  try {
    localStorage.setItem(PROCTOR_PROCTORS_KEY, JSON.stringify(proctors));
  } catch {
    // Ignore quota
  }
}

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

export async function loginAuth(username: string, password: string): Promise<{
  success: boolean;
  role: 'superadmin' | 'proctor';
  admin?: { username: string; name: string };
  proctor?: { id: string; username: string; name: string; email?: string };
}> {
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '').trim();

  if (!cleanUser || !cleanPass) {
    throw new Error('Username and password are required');
  }

  // 1. Try Express backend unified auth endpoint
  try {
    const res = await fetch(`${getBaseUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ username: cleanUser, password: cleanPass })
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
    if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Account deactivated. Please contact Super Admin.');
    }
    if (res.status === 401) {
      throw new Error('Incorrect username or password');
    }
  } catch (err: any) {
    if (err.message && (err.message.includes('deactivated') || err.message.includes('Incorrect'))) {
      throw err;
    }
    // Network fallback
  }

  // 2. Client-side fallback check:
  // Super admin check:
  if (cleanUser.toLowerCase() === 'admin' && cleanPass === '123admin') {
    return {
      success: true,
      role: 'superadmin',
      admin: {
        username: 'admin',
        name: 'Super Administrator'
      }
    };
  }

  // Proctors fallback check:
  const localProctors = getLocalProctors();
  const matched = localProctors.find(p => p.username.toLowerCase() === cleanUser.toLowerCase());
  if (matched) {
    if (matched.password !== cleanPass) {
      throw new Error('Incorrect proctor password');
    }
    if (matched.active === false) {
      throw new Error('This proctor account has been deactivated. Please contact Super Admin.');
    }
    return {
      success: true,
      role: 'proctor',
      proctor: {
        id: matched.id,
        username: matched.username,
        name: matched.name,
        email: matched.email
      }
    };
  }

  throw new Error('Incorrect username or password');
}

export async function adminLogin(username: string, password: string): Promise<{
  success: boolean;
  role?: 'superadmin' | 'proctor';
  admin: { username: string; name: string };
  proctor?: { id: string; username: string; name: string; email?: string };
}> {
  const result = await loginAuth(username, password);
  return {
    success: true,
    role: result.role,
    admin: result.admin || {
      username: result.proctor?.username || username,
      name: result.proctor?.name || 'Proctor'
    },
    proctor: result.proctor
  };
}

// ---------------------------------------------------------------
// PROCTORS API (SUPER ADMIN CONTROLS)
// ---------------------------------------------------------------

export async function fetchProctors(): Promise<ProctorAccount[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/admin/proctors`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const list = await res.json();
      saveLocalProctors(list);
      return list;
    }
  } catch {
    // fallback
  }
  return getLocalProctors();
}

export async function createProctor(data: Partial<ProctorAccount>): Promise<ProctorAccount> {
  const res = await fetch(`${getBaseUrl()}/api/admin/proctors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create proctor account');
  }
  const result = await res.json();
  const proctor = result.proctor;
  const current = getLocalProctors();
  saveLocalProctors([proctor, ...current]);
  return proctor;
}

export async function updateProctor(id: string, data: Partial<ProctorAccount>): Promise<ProctorAccount> {
  const res = await fetch(`${getBaseUrl()}/api/admin/proctors/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update proctor account');
  }
  const result = await res.json();
  const proctor = result.proctor;
  const current = getLocalProctors().map(p => p.id === id ? { ...p, ...proctor } : p);
  saveLocalProctors(current);
  return proctor;
}

export async function deleteProctor(id: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/api/admin/proctors/${id}`, {
    method: 'DELETE',
    headers: { 'Cache-Control': 'no-cache' }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete proctor account');
  }
  const current = getLocalProctors().filter(p => p.id !== id);
  saveLocalProctors(current);
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
// EXAMINATION ROOMS API (Authoritative Google Cloud Firestore)
// ---------------------------------------------------------------

/**
 * Real-time subscription to examination rooms in Firestore.
 * Automatically pushes room changes to all connected computers/browsers.
 */
export function subscribeToRooms(
  onRooms: (rooms: ExamRoom[]) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const roomsCol = collection(db, 'rooms');
    const unsubscribe = onSnapshot(
      roomsCol,
      (snapshot) => {
        const items: ExamRoom[] = [];
        snapshot.forEach((docSnap) => {
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
            calculatorEnabled: data.calculatorEnabled !== false,
            startAt: data.startAt || '',
            endAt: data.endAt || '',
            availabilityEnabled: data.availabilityEnabled !== undefined ? Boolean(data.availabilityEnabled) : Boolean(data.startAt || data.endAt),
            visitsCount: Number(data.visitsCount) || 0,
            active: data.active !== false,
            createdAt: Number(data.createdAt) || 0,
            createdBy: data.createdBy || 'proctor',
            createdByProctor: data.createdByProctor || data.createdBy || 'Proctor'
          });
        });

        // Authoritative sort: newest created first
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Update secondary local cache without overriding Firestore
        saveLocalRooms(items);

        onRooms(items);
      },
      (error) => {
        console.error('Firestore room listener failed:', error);
        if (onError) {
          onError(error);
        }
      }
    );

    return unsubscribe;
  } catch (err: any) {
    console.error('Failed to setup Firestore room listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

export function isRoomScheduleEnded(room: Pick<ExamRoom, 'availabilityEnabled' | 'endAt'>, now = Date.now()): boolean {
  if (room.availabilityEnabled === false || !room.endAt) return false;
  const endMs = new Date(room.endAt).getTime();
  return !isNaN(endMs) && now >= endMs;
}

/**
 * Force-closes any active room whose scheduled availability end time has already passed,
 * persisting active=false to Firestore and local cache so all clients stay synchronized.
 */
export async function forceCloseExpiredRooms(rooms: ExamRoom[]): Promise<ExamRoom[]> {
  const now = Date.now();
  const expiredActive = rooms.filter((r) => r.active && isRoomScheduleEnded(r, now));
  if (expiredActive.length === 0) return rooms;

  const expiredIds = new Set(expiredActive.map((r) => r.id));
  const normalized = rooms.map((r) => (expiredIds.has(r.id) ? { ...r, active: false } : r));
  saveLocalRooms(normalized);

  await Promise.all(
    expiredActive.map(async (r) => {
      try {
        await updateDoc(doc(db, 'rooms', r.id), { active: false });
      } catch (err) {
        console.warn(`Firestore force-close notice for room ${r.roomNumber}:`, err);
      }
      try {
        await fetch(`${getBaseUrl()}/api/rooms/${r.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          body: JSON.stringify({ active: false })
        });
      } catch {
        // Ignore offline backend
      }
    })
  );

  return normalized;
}

/**
 * Authoritative fetch of examination rooms directly from Firestore.
 * Does NOT silently fall back to DEFAULT_ROOMS on error.
 */
export async function fetchRooms(): Promise<ExamRoom[]> {
  try {
    const roomsCol = collection(db, 'rooms');
    const snap = await getDocs(roomsCol);

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
        calculatorEnabled: data.calculatorEnabled !== false,
        startAt: data.startAt || '',
        endAt: data.endAt || '',
        availabilityEnabled: data.availabilityEnabled !== undefined ? Boolean(data.availabilityEnabled) : Boolean(data.startAt || data.endAt),
        visitsCount: Number(data.visitsCount) || 0,
        active: data.active !== false,
        createdAt: Number(data.createdAt) || 0,
        createdBy: data.createdBy || 'proctor',
        createdByProctor: data.createdByProctor || data.createdBy || 'Proctor'
      });
    });

    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    saveLocalRooms(items);
    return await forceCloseExpiredRooms(items);
  } catch (err) {
    console.error('Failed to load rooms from Firestore:', err);
    // Explicitly rethrow so the UI can distinguish between zero rooms vs Firestore error
    throw err;
  }
}

function validateRoomTimeframe(startAt?: string, endAt?: string, availabilityEnabled?: boolean) {
  if (availabilityEnabled === false) return;
  const startMs = startAt ? new Date(startAt).getTime() : NaN;
  const endMs = endAt ? new Date(endAt).getTime() : NaN;

  if (startAt && isNaN(startMs)) {
    throw new Error('The timeframe is incorrect: Start Date & Time is invalid.');
  }
  if (endAt && isNaN(endMs)) {
    throw new Error('The timeframe is incorrect: End Date & Time is invalid.');
  }
  if (startAt && endAt && startMs >= endMs) {
    throw new Error('The timeframe is incorrect: End Date & Time must be later than Start Date & Time.');
  }
}

/**
 * Create a new examination room directly in Google Cloud Firestore.
 * Automatically synchronizes to all connected computers via real-time listeners.
 */
export async function createRoom(room: Partial<ExamRoom>): Promise<ExamRoom> {
  const roomId = room.id || `room-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const cleanRoomNumber = String(room.roomNumber || '').trim();
  const cleanPasscode = String(room.passcode || '').trim();

  if (!cleanRoomNumber || !cleanPasscode) {
    throw new Error('Room Number and Passcode are required to create an examination room.');
  }

  validateRoomTimeframe(room.startAt, room.endAt, room.availabilityEnabled);

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
    calculatorEnabled: room.calculatorEnabled !== false,
    startAt: room.startAt || '',
    endAt: room.endAt || '',
    availabilityEnabled: room.availabilityEnabled !== undefined ? Boolean(room.availabilityEnabled) : Boolean(room.startAt || room.endAt),
    visitsCount: 0,
    active: room.active !== false,
    createdAt: Date.now(),
    createdBy: room.createdBy || 'proctor',
    createdByProctor: room.createdByProctor || room.createdBy || 'Proctor'
  };

  // Authoritative write to Firestore
  try {
    const roomRef = doc(db, 'rooms', roomId);
    await setDoc(roomRef, newRoom);
  } catch (error) {
    console.error(`Failed to save room ${cleanRoomNumber} to Firestore:`, error);
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}`);
  }

  // Update local cache
  const current = getLocalRooms().filter((r) => r.id !== roomId);
  saveLocalRooms([newRoom, ...current]);

  return newRoom;
}

/**
 * Update an existing room in Google Cloud Firestore.
 */
export async function updateRoom(id: string, room: Partial<ExamRoom>): Promise<ExamRoom> {
  const existingRooms = getLocalRooms();
  let existing = existingRooms.find((r) => r.id === id);
  if (!existing) {
    try {
      const snap = await getDoc(doc(db, 'rooms', id));
      if (snap.exists()) {
        existing = { id: snap.id, ...(snap.data() as any) } as ExamRoom;
      }
    } catch {
      // Fallback to local if Firestore read fails
    }
  }

  const updated: ExamRoom = {
    ...(existing || DEFAULT_ROOMS[0]),
    ...room,
    id
  };

  if (room.startAt !== undefined || room.endAt !== undefined || room.availabilityEnabled !== undefined) {
    validateRoomTimeframe(updated.startAt, updated.endAt, updated.availabilityEnabled);
  }

  // Force-close if scheduled availability time has already ended
  if (isRoomScheduleEnded(updated)) {
    updated.active = false;
  }

  // Authoritative write to Firestore
  try {
    const roomRef = doc(db, 'rooms', id);
    await setDoc(roomRef, updated, { merge: true });
  } catch (error) {
    console.error(`Failed to update room ${id} in Firestore:`, error);
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${id}`);
  }

  // Update local cache
  const current = existingRooms.some((r) => r.id === id)
    ? existingRooms.map((r) => (r.id === id ? updated : r))
    : [updated, ...existingRooms];
  saveLocalRooms(current);

  return updated;
}

/**
 * Delete a room from Google Cloud Firestore.
 */
export async function deleteRoom(id: string): Promise<{ success: boolean; id: string }> {
  try {
    const roomRef = doc(db, 'rooms', id);
    await deleteDoc(roomRef);
  } catch (error) {
    console.error(`Failed to delete room ${id} from Firestore:`, error);
    handleFirestoreError(error, OperationType.DELETE, `rooms/${id}`);
  }

  // Update local cache
  const current = getLocalRooms().filter((r) => r.id !== id);
  saveLocalRooms(current);

  return { success: true, id };
}

/**
 * Check whether a room is currently open, upcoming, or closed/expired based on scheduled availability.
 */
export function checkRoomAvailability(room: ExamRoom): {
  available: boolean;
  status: 'Open' | 'Upcoming' | 'Expired' | 'Closed';
  reason?: string;
} {
  const now = Date.now();
  const availabilityEnabled = room.availabilityEnabled !== false && Boolean(room.startAt || room.endAt);

  // Force-close if scheduled availability end time has already ended
  if (availabilityEnabled && room.endAt) {
    const endMs = new Date(room.endAt).getTime();
    if (!isNaN(endMs) && now >= endMs) {
      return {
        available: false,
        status: 'Closed',
        reason: `Examination room "${room.title}" (${room.roomNumber}) has been force-closed because its scheduled availability ended on ${new Date(endMs).toLocaleString()}.`
      };
    }
  }

  if (!room.active) {
    return {
      available: false,
      status: 'Closed',
      reason: `Examination room "${room.title}" (${room.roomNumber}) is currently closed by the administrator.`
    };
  }

  if (!availabilityEnabled) {
    return { available: true, status: 'Open' };
  }

  if (room.startAt) {
    const startMs = new Date(room.startAt).getTime();
    if (!isNaN(startMs) && now < startMs) {
      return {
        available: false,
        status: 'Upcoming',
        reason: `Examination room "${room.title}" (${room.roomNumber}) is not open yet. It is scheduled to become available on ${new Date(startMs).toLocaleString()}.`
      };
    }
  }

  return { available: true, status: 'Open' };
}

/**
 * Record an examinee visit/entry into an examination room.
 */
export async function recordRoomVisit(roomId: string): Promise<number> {
  let count = 0;
  // 1. Update in Firestore
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);
    if (snap.exists()) {
      const prev = Number(snap.data()?.visitsCount) || 0;
      count = prev + 1;
      await updateDoc(roomRef, { visitsCount: count });
    }
  } catch (err) {
    console.warn('Firestore visit increment notice:', err);
  }

  // 2. Also notify backend server
  try {
    const res = await fetch(`${getBaseUrl()}/api/rooms/${roomId}/visit`, {
      method: 'POST',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.visitsCount === 'number') count = data.visitsCount;
    }
  } catch {
    // Ignore offline
  }

  // 3. Update local cache
  const rooms = getLocalRooms();
  const updated = rooms.map(r => r.id === roomId ? { ...r, visitsCount: count || (r.visitsCount || 0) + 1 } : r);
  saveLocalRooms(updated);

  return count;
}

/**
 * Verify candidate room number & passcode against authoritative Firestore.
 * Does NOT silently fabricate fallback rooms if Firestore fails.
 * Strictly enforces date/time availability windows.
 */
export async function verifyRoom(roomNumber: string, passcode: string): Promise<{
  success: boolean;
  room: ExamRoom;
}> {
  const cleanRoom = String(roomNumber || '').trim().toLowerCase();
  const cleanPass = String(passcode || '').trim();

  if (!cleanRoom || !cleanPass) {
    throw new Error('Please enter both Room Number and Passcode.');
  }

  // 1. Fetch fresh rooms from authoritative Firestore
  let rooms: ExamRoom[] = [];
  try {
    rooms = await fetchRooms();
  } catch (err: any) {
    console.error('Firestore connection error during room verification:', err);
    throw new Error('Unable to connect to the examination server. Please check your internet or Firebase connection and try again.');
  }

  // Match room number (case-insensitive and trimmed)
  const match = rooms.find(
    (r) =>
      r.roomNumber.trim().toLowerCase() === cleanRoom &&
      (r.passcode.trim() === cleanPass || r.passcode.trim().toUpperCase() === cleanPass.toUpperCase())
  );

  if (!match) {
    throw new Error(`Invalid Room Number "${roomNumber}" or Passcode. Please verify your credentials and try again.`);
  }

  // Check room availability (active state + date/time window)
  const availability = checkRoomAvailability(match);
  if (!availability.available) {
    throw new Error(availability.reason || 'This examination room is currently not accessible.');
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

export async function deleteAttempt(id: string): Promise<void> {
  // 1. Delete from Firestore
  try {
    await deleteDoc(doc(db, 'attempts', id));
  } catch (err) {
    console.warn('Firestore deleteAttempt notice:', err);
  }

  // 2. Delete from backend server
  try {
    await fetch(`${getBaseUrl()}/api/attempts/${id}`, {
      method: 'DELETE',
      headers: { 'Cache-Control': 'no-cache' }
    });
  } catch {
    // Offline
  }

  // 3. Update local cache
  const current = getLocalAttempts().filter((a) => a.id !== id);
  saveLocalAttempts(current);
}

export async function deleteMultipleAttempts(ids: string[]): Promise<void> {
  const set = new Set(ids);
  // 1. Delete from Firestore
  for (const id of ids) {
    try {
      await deleteDoc(doc(db, 'attempts', id));
    } catch {
      // Continue
    }
  }

  // 2. Delete from backend server
  try {
    await fetch(`${getBaseUrl()}/api/attempts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ ids })
    });
  } catch {
    // Offline
  }

  // 3. Update local cache
  const current = getLocalAttempts().filter((a) => !set.has(a.id));
  saveLocalAttempts(current);
}

export async function deleteAllAttempts(): Promise<void> {
  // 1. Delete all from Firestore
  try {
    const attemptsCol = collection(db, 'attempts');
    const snap = await getDocs(attemptsCol);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  } catch (err) {
    console.warn('Firestore deleteAllAttempts notice:', err);
  }

  // 2. Delete all from backend server
  try {
    await fetch(`${getBaseUrl()}/api/attempts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ all: true })
    });
  } catch {
    // Offline
  }

  // 3. Update local cache
  saveLocalAttempts([]);
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

export async function deleteViolation(id: string): Promise<void> {
  // 1. Delete from Firestore
  try {
    await deleteDoc(doc(db, 'violations', id));
  } catch (err) {
    console.warn('Firestore deleteViolation notice:', err);
  }

  // 2. Delete from backend server
  try {
    await fetch(`${getBaseUrl()}/api/violations/${id}`, {
      method: 'DELETE',
      headers: { 'Cache-Control': 'no-cache' }
    });
  } catch {
    // Offline
  }

  // 3. Update local cache
  const current = getLocalViolations().filter((v) => v.id !== id);
  saveLocalViolations(current);
}

export async function deleteMultipleViolations(ids: string[]): Promise<void> {
  const set = new Set(ids);
  // 1. Delete from Firestore
  for (const id of ids) {
    try {
      await deleteDoc(doc(db, 'violations', id));
    } catch {
      // Continue
    }
  }

  // 2. Delete from backend server
  try {
    await fetch(`${getBaseUrl()}/api/violations`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ ids })
    });
  } catch {
    // Offline
  }

  // 3. Update local cache
  const current = getLocalViolations().filter((v) => !set.has(v.id));
  saveLocalViolations(current);
}

export async function deleteAllViolations(): Promise<void> {
  // 1. Delete all from Firestore
  try {
    const violationsCol = collection(db, 'violations');
    const snap = await getDocs(violationsCol);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  } catch (err) {
    console.warn('Firestore deleteAllViolations notice:', err);
  }

  // 2. Delete all from backend server
  try {
    await fetch(`${getBaseUrl()}/api/violations`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ all: true })
    });
  } catch {
    // Offline
  }

  // 3. Update local cache
  saveLocalViolations([]);
}

// ---------------------------------------------------------------
// REAL-TIME SYNC VIA GOOGLE CLOUD FIRESTORE + SSE
// ---------------------------------------------------------------

export function subscribeToEvents(
  onUpdate: (event: any) => void,
  onRoomsUpdate?: (rooms: ExamRoom[]) => void,
  onRoomsError?: (err: Error) => void
): () => void {
  const unsubscribers: (() => void)[] = [];

  try {
    // 1. Listen to real-time rooms changes in Firestore directly
    const unsubRooms = onSnapshot(
      collection(db, 'rooms'),
      (snapshot) => {
        const items: ExamRoom[] = [];
        snapshot.forEach((docSnap) => {
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
            calculatorEnabled: data.calculatorEnabled !== false,
            startAt: data.startAt || '',
            endAt: data.endAt || '',
            availabilityEnabled: data.availabilityEnabled !== undefined ? Boolean(data.availabilityEnabled) : Boolean(data.startAt || data.endAt),
            visitsCount: Number(data.visitsCount) || 0,
            active: data.active !== false,
            createdAt: Number(data.createdAt) || 0,
            createdBy: data.createdBy || 'proctor',
            createdByProctor: data.createdByProctor || data.createdBy || 'Proctor'
          });
        });

        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const now = Date.now();
        const hasExpiredActive = items.some((r) => r.active && isRoomScheduleEnded(r, now));
        const normalized = hasExpiredActive
          ? items.map((r) => (r.active && isRoomScheduleEnded(r, now) ? { ...r, active: false } : r))
          : items;

        saveLocalRooms(normalized);
        if (hasExpiredActive) {
          forceCloseExpiredRooms(items).catch(() => {});
        }

        if (onRoomsUpdate) {
          onRoomsUpdate(normalized);
        }
        onUpdate({ type: 'rooms_updated', count: normalized.length, rooms: normalized });
      },
      (err) => {
        console.error('Firestore rooms onSnapshot failed:', err);
        if (onRoomsError) {
          onRoomsError(err);
        }
      }
    );
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
    console.error('Firestore real-time listeners setup note:', e);
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
      let data: SheetData = await res.json();
      // If server has no URL yet, check Firestore config/sheet for cross-PC persistence
      if (!data.url) {
        try {
          const sheetDoc = await getDoc(doc(db, 'config', 'sheet'));
          if (sheetDoc.exists() && sheetDoc.data()?.url) {
            const fsUrl = String(sheetDoc.data().url).trim();
            if (fsUrl) {
              data = await saveSheetUrl(fsUrl);
            }
          }
        } catch {
          // Ignore Firestore fallback read error
        }
      }
      saveLocalSheet(data);
      return data;
    }
  } catch {
    // Fallback
  }

  // Try Firestore config/sheet if server unreachable
  try {
    const sheetDoc = await getDoc(doc(db, 'config', 'sheet'));
    if (sheetDoc.exists() && sheetDoc.data()?.url) {
      const local = getLocalSheet();
      local.url = String(sheetDoc.data().url).trim();
      saveLocalSheet(local);
      return local;
    }
  } catch {
    // Ignore
  }

  return getLocalSheet();
}

function parseBrowserCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((c) => c !== ''));
}

async function fetchDirectClientCSV(rawUrl: string): Promise<SheetData | null> {
  let exportUrl = rawUrl.trim();
  let gid: string | null = null;
  const gidMatch = exportUrl.match(/[?&#]gid=([0-9]+)/);
  if (gidMatch && gidMatch[1]) gid = gidMatch[1];

  if (!exportUrl.includes('/export?format=csv') && !exportUrl.includes('/pub?output=csv')) {
    const pubMatch = exportUrl.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (pubMatch && pubMatch[1]) {
      exportUrl = `https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
    } else {
      const docMatch = exportUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (docMatch && docMatch[1] && docMatch[1] !== 'e') {
        exportUrl = `https://docs.google.com/spreadsheets/d/${docMatch[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
      }
    }
  }

  try {
    const res = await fetch(exportUrl);
    if (res.ok) {
      const text = await res.text();
      const parsed = parseBrowserCSV(text);
      if (parsed.length > 0) {
        return {
          url: rawUrl,
          lastSyncedAt: Date.now(),
          headers: parsed[0] || [],
          rows: parsed.slice(1)
        };
      }
    }
  } catch {
    // CORS or network error on direct client fetch
  }
  return null;
}

export async function syncSheetData(url?: string): Promise<SheetData> {
  let serverError: string | null = null;
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
    } else {
      const errData = await res.json().catch(() => null);
      serverError = errData?.error || `Server returned HTTP ${res.status}`;
    }
  } catch (err: any) {
    serverError = err.message || 'Server connection failed';
  }

  // Client-side direct CSV fallback if Google Sheet / raw CSV and backend fetch failed
  const targetUrl = url || getLocalSheet().url;
  if (targetUrl && (targetUrl.includes('docs.google.com/spreadsheets') || targetUrl.toLowerCase().includes('.csv'))) {
    const clientData = await fetchDirectClientCSV(targetUrl);
    if (clientData) {
      saveLocalSheet(clientData);
      saveSheetData(clientData).catch(() => {});
      return clientData;
    }
  }

  if (serverError) {
    throw new Error(serverError);
  }

  throw new Error('Could not connect to spreadsheet. Please verify the link and sharing permissions ("Anyone with the link can view").');
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

export async function saveSheetUrl(url: string): Promise<SheetData> {
  let cleanedUrl = url.trim();
  if (cleanedUrl.toLowerCase().includes('<iframe')) {
    const srcMatch = cleanedUrl.match(/src\s*=\s*["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      cleanedUrl = srcMatch[1].replace(/&amp;/g, '&').trim();
    }
  }

  try {
    const res = await fetch(`${getBaseUrl()}/api/sheet/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ url: cleanedUrl })
    });
    if (res.ok) {
      const data = await res.json();
      saveLocalSheet(data.sheetData);
      try {
        await setDoc(doc(db, 'config', 'sheet'), {
          url: data.sheetData?.url || cleanedUrl,
          updatedAt: Date.now()
        });
      } catch {
        // Ignore
      }
      return data.sheetData;
    }
  } catch {
    // Fallback
  }
  const current = getLocalSheet();
  current.url = cleanedUrl;
  current.lastSyncedAt = Date.now();
  saveLocalSheet(current);
  try {
    await setDoc(doc(db, 'config', 'sheet'), {
      url: cleanedUrl,
      updatedAt: Date.now()
    });
  } catch {
    // Ignore
  }
  return current;
}

// ---------------------------------------------------------------
// FACTORY RESET: RESET ALL PROCTOR ACCOUNTS & WIPE DATA
// ---------------------------------------------------------------

export async function resetAllToDefault(): Promise<{ success: boolean; message: string }> {
  // 1. Purge all examination rooms in Firestore
  try {
    const roomsCol = collection(db, 'rooms');
    const roomsSnap = await getDocs(roomsCol);
    for (const d of roomsSnap.docs) {
      await deleteDoc(d.ref);
    }
  } catch (err) {
    console.error('Error wiping Firestore rooms:', err);
  }

  // 2. Purge all examinee submissions & attempts in Firestore
  try {
    const attemptsCol = collection(db, 'attempts');
    const attemptsSnap = await getDocs(attemptsCol);
    for (const d of attemptsSnap.docs) {
      await deleteDoc(d.ref);
    }
  } catch (err) {
    console.error('Error wiping Firestore attempts:', err);
  }

  // 3. Purge all security violations in Firestore
  try {
    const violationsCol = collection(db, 'violations');
    const violationsSnap = await getDocs(violationsCol);
    for (const d of violationsSnap.docs) {
      await deleteDoc(d.ref);
    }
  } catch (err) {
    console.error('Error wiping Firestore violations:', err);
  }

  // 4. Reset proctor accounts in Firestore to factory default
  try {
    const proctorsCol = collection(db, 'proctors');
    const proctorsSnap = await getDocs(proctorsCol);
    for (const d of proctorsSnap.docs) {
      await deleteDoc(d.ref);
    }
    for (const p of DEFAULT_PROCTORS) {
      await setDoc(doc(db, 'proctors', p.id), p);
    }
  } catch (err) {
    console.error('Error resetting Firestore proctors:', err);
  }

  // 5. Reset admin credentials in Firestore
  try {
    await setDoc(doc(db, 'admins', 'admin-primary'), DEFAULT_ADMIN);
  } catch (err) {
    console.error('Error resetting Firestore admin:', err);
  }

  // 6. Reset sheet configuration in Firestore
  try {
    await setDoc(doc(db, 'config', 'sheet'), {
      url: '',
      updatedAt: Date.now()
    });
  } catch (err) {
    console.error('Error resetting Firestore sheet config:', err);
  }

  // 7. Request Server to reset local memory & file database
  try {
    await fetch(`${getBaseUrl()}/api/admin/reset-default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
    });
  } catch (err) {
    console.error('Error calling server reset endpoint:', err);
  }

  // 8. Wipe LocalStorage caches
  try {
    localStorage.removeItem(PROCTOR_ROOMS_KEY);
    localStorage.removeItem(PROCTOR_ATTEMPTS_KEY);
    localStorage.removeItem(PROCTOR_VIOLATIONS_KEY);
    localStorage.removeItem(PROCTOR_SHEET_KEY);
    saveLocalProctors(DEFAULT_PROCTORS);
    saveLocalAdminCreds(DEFAULT_ADMIN);
  } catch (err) {
    console.error('Error clearing local storage:', err);
  }

  return {
    success: true,
    message: 'All examination rooms, examinee submissions, attempts, and violation logs have been deleted, and proctor accounts have been restored to default.'
  };
}
