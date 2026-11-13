import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import * as XLSX from 'xlsx';

const app = express();
const PORT = 3000;

app.use(express.json());

// Prevent stale browser caching during updates
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Data storage file path
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'proctor_db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface RoomRecord {
  id: string;
  roomNumber: string;
  passcode: string;
  title: string;
  description: string;
  formUrl: string;
  antiCheat: boolean;
  maxViolations: number;
  timerEnabled: boolean;
  durationMinutes: number;
  startAt?: string;
  endAt?: string;
  availabilityEnabled?: boolean;
  visitsCount?: number;
  active: boolean;
  calculatorEnabled?: boolean;
  createdAt: number;
  createdBy: string;
  createdByProctor?: string;
}

interface AttemptRecord {
  id: string;
  examId: string;
  examTitle: string;
  roomNumber: string;
  participantId: string;
  participantName: string;
  startedAt: number;
  endedAt: number | null;
  durationSeconds?: number;
  status: 'In Progress' | 'Completed' | 'Time Expired' | 'Terminated' | 'Exited';
  violations: number;
  maxViolations?: number;
  flagged: boolean;
}

interface ViolationRecord {
  id: string;
  attemptId: string;
  examId: string;
  examTitle: string;
  roomNumber: string;
  participantId: string;
  number: number;
  reason: string;
  timestamp: number;
}

interface ProctorRecord {
  id: string;
  username: string;
  password: string;
  name: string;
  email?: string;
  notes?: string;
  active: boolean;
  createdAt: number;
  lastLoginAt?: number;
}

interface SheetWorksheet {
  name: string;
  headers: string[];
  rows: string[][];
}

interface SheetRecord {
  url: string;
  provider?: 'google' | 'excel' | 'csv' | 'unknown';
  embedUrl?: string;
  officeViewerUrl?: string;
  resolvedUrl?: string;
  lastSyncedAt: number | null;
  headers: string[];
  rows: string[][];
  sheets?: SheetWorksheet[];
  activeSheetName?: string;
}

interface DBState {
  rooms: Record<string, RoomRecord>;
  attempts: Record<string, AttemptRecord>;
  violations: Record<string, ViolationRecord>;
  proctors: Record<string, ProctorRecord>;
  sheetData?: SheetRecord;
  config: {
    syncMode: 'server' | 'firebase';
    firebase: {
      apiKey: string;
      authDomain: string;
      databaseURL: string;
      projectId: string;
      storageBucket: string;
      messagingSenderId: string;
      appId: string;
      enabled: boolean;
    };
    admin: {
      username: string;
      passwordHash: string;
      name: string;
    };
  };
}

const DEFAULT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfD_PLACEHOLDER/viewform?embedded=true';

const DEFAULT_STATE: DBState = {
  rooms: {
    'sample-room-1': {
      id: 'sample-room-1',
      roomNumber: '101202',
      passcode: 'PASS99',
      title: 'General Assessment & Knowledge Check',
      description: 'Standard examination room. Multiple examinees can join simultaneously with the room number and passcode.',
      formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSf_EXAMPLE_FORM/viewform?embedded=true',
      antiCheat: true,
      maxViolations: 5,
      timerEnabled: true,
      durationMinutes: 45,
      calculatorEnabled: true,
      startAt: '',
      endAt: '',
      active: true,
      createdAt: Date.now() - 3600000,
      createdBy: 'proctor',
      createdByProctor: 'Lead Proctor Alpha'
    }
  },
  attempts: {},
  violations: {},
  proctors: {
    'proctor-1': {
      id: 'proctor-1',
      username: 'proctor',
      password: 'proctor123',
      name: 'Lead Proctor Alpha',
      email: 'proctor@proctorplus.internal',
      notes: 'Default examination supervisor',
      active: true,
      createdAt: Date.now() - 86400000 * 7,
      lastLoginAt: Date.now() - 3600000
    },
    'proctor-2': {
      id: 'proctor-2',
      username: 'proctor1',
      password: '123proctor',
      name: 'Exam Proctor Beta',
      email: 'proctor1@proctorplus.internal',
      notes: 'Secondary examination room supervisor',
      active: true,
      createdAt: Date.now() - 86400000 * 3
    }
  },
  config: {
    syncMode: 'server',
    firebase: {
      apiKey: '',
      authDomain: '',
      databaseURL: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
      enabled: false
    },
    admin: {
      username: 'admin',
      passwordHash: '123admin',
      name: 'Super Administrator'
    }
  }
};

// CORS & No-Cache middleware for instant multi-PC sync
app.use((req: Request, res: Response, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

let db: DBState = loadDatabase();

function loadDatabase(): DBState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      const proctorsMap = (parsed.proctors && Object.keys(parsed.proctors).length > 0)
        ? parsed.proctors
        : DEFAULT_STATE.proctors;

      return {
        rooms: parsed.rooms || {},
        attempts: parsed.attempts || {},
        violations: parsed.violations || {},
        proctors: proctorsMap,
        sheetData: parsed.sheetData,
        config: {
          syncMode: parsed.config?.syncMode || 'server',
          firebase: parsed.config?.firebase || DEFAULT_STATE.config.firebase,
          admin: parsed.config?.admin || DEFAULT_STATE.config.admin
        }
      };
    }
  } catch (err) {
    console.error('Error reading database file, using default state:', err);
  }
  saveDatabase(DEFAULT_STATE);
  return DEFAULT_STATE;
}

function getDatabase(): DBState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        db.rooms = parsed.rooms || db.rooms || {};
        db.attempts = parsed.attempts || db.attempts || {};
        db.violations = parsed.violations || db.violations || {};
        db.proctors = (parsed.proctors && Object.keys(parsed.proctors).length > 0)
          ? parsed.proctors
          : (db.proctors || DEFAULT_STATE.proctors);
        if (parsed.sheetData) db.sheetData = parsed.sheetData;
        if (parsed.config) {
          db.config = {
            ...db.config,
            ...parsed.config,
            admin: parsed.config.admin || db.config.admin,
            firebase: parsed.config.firebase || db.config.firebase
          };
        }
      }
    }
  } catch (err) {
    // Keep in-memory db on transient read error
  }
  return db;
}

function saveDatabase(state: DBState) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database file:', err);
  }
}

// Connected SSE clients for live multi-PC updates
const sseClients = new Set<Response>();

// Send periodic heartbeat every 15s so proxies/Cloud Run don't close SSE connections
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': heartbeat\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 15000);

function broadcastUpdate(type: string, payload?: any) {
  const data = JSON.stringify({ type, timestamp: Date.now(), payload });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ---------------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------------

// Server health and status
app.get('/api/status', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const roomsList = Object.values(currentDb.rooms);
  const attemptsList = Object.values(currentDb.attempts);
  const activeAttempts = attemptsList.filter(a => a.status === 'In Progress').length;
  const activeRooms = roomsList.filter(r => r.active).length;

  res.json({
    status: 'ok',
    connectedPCs: Math.max(1, sseClients.size),
    syncMode: currentDb.config.syncMode,
    firebaseConfigured: Boolean(currentDb.config.firebase?.apiKey && currentDb.config.firebase.enabled),
    roomsCount: roomsList.length,
    activeRooms,
    activeAttempts,
    totalAttempts: attemptsList.length,
    totalViolations: Object.keys(currentDb.violations).length
  });
});

// SSE endpoint for instant real-time sync across multiple computers
app.get('/api/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', connectedClients: sseClients.size + 1 })}\n\n`);
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// System configuration
app.get('/api/config', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  res.json({
    syncMode: currentDb.config.syncMode,
    firebase: currentDb.config.firebase,
    admin: {
      username: currentDb.config.admin.username,
      name: currentDb.config.admin.name
    }
  });
});

// Replace / Update Firebase Configuration
app.post('/api/config/firebase', (req: Request, res: Response) => {
  const { firebase, syncMode } = req.body;
  if (firebase) {
    db.config.firebase = {
      apiKey: String(firebase.apiKey || '').trim(),
      authDomain: String(firebase.authDomain || '').trim(),
      databaseURL: String(firebase.databaseURL || '').trim(),
      projectId: String(firebase.projectId || '').trim(),
      storageBucket: String(firebase.storageBucket || '').trim(),
      messagingSenderId: String(firebase.messagingSenderId || '').trim(),
      appId: String(firebase.appId || '').trim(),
      enabled: Boolean(firebase.enabled)
    };
  }

  if (syncMode === 'server' || syncMode === 'firebase') {
    db.config.syncMode = syncMode;
  }

  saveDatabase(db);
  broadcastUpdate('config_updated');
  res.json({ success: true, config: db.config });
});

// Unified authentication for Super Admin and Proctors
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanPass = String(password || '').trim();

  if (!cleanUser || !cleanPass) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const currentDb = getDatabase();

  // 1. Check Super Admin (user: admin, pass: 123admin or configured)
  const dbUser = (currentDb.config?.admin?.username || 'admin').trim().toLowerCase();
  const dbPass = (currentDb.config?.admin?.passwordHash || '123admin').trim();
  const envUser = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const envPass = (process.env.ADMIN_PASSWORD || '123admin').trim();

  const isSuperAdmin =
    (cleanUser === dbUser && cleanPass === dbPass) ||
    (cleanUser === envUser && cleanPass === envPass) ||
    (cleanUser === 'admin' && cleanPass === '123admin');

  if (isSuperAdmin) {
    res.json({
      success: true,
      role: 'superadmin',
      admin: {
        username: currentDb.config.admin?.username || 'admin',
        name: currentDb.config.admin?.name || 'Super Administrator'
      }
    });
    return;
  }

  // 2. Check Proctor accounts
  const proctorsList = Object.values(currentDb.proctors || {});
  const matchedProctor = proctorsList.find(
    p => p.username.trim().toLowerCase() === cleanUser
  );

  if (matchedProctor) {
    if (matchedProctor.password !== cleanPass) {
      res.status(401).json({ error: 'Incorrect proctor password' });
      return;
    }
    if (matchedProctor.active === false) {
      res.status(403).json({ error: 'This proctor account is deactivated. Please contact the Super Admin.' });
      return;
    }

    // Update last login timestamp
    matchedProctor.lastLoginAt = Date.now();
    currentDb.proctors[matchedProctor.id] = matchedProctor;
    saveDatabase(currentDb);

    res.json({
      success: true,
      role: 'proctor',
      proctor: {
        id: matchedProctor.id,
        username: matchedProctor.username,
        name: matchedProctor.name,
        email: matchedProctor.email
      }
    });
    return;
  }

  res.status(401).json({ error: 'Incorrect username or password' });
});

// Backwards-compatible /api/auth/admin route
app.post('/api/auth/admin', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanPass = String(password || '').trim();

  if (!cleanUser || !cleanPass) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const currentDb = getDatabase();

  // Check Super Admin
  if (
    (cleanUser === (currentDb.config.admin?.username || 'admin').toLowerCase() && cleanPass === (currentDb.config.admin?.passwordHash || '123admin')) ||
    (cleanUser === 'admin' && cleanPass === '123admin')
  ) {
    res.json({
      success: true,
      role: 'superadmin',
      admin: {
        username: currentDb.config.admin?.username || 'admin',
        name: currentDb.config.admin?.name || 'Super Administrator'
      }
    });
    return;
  }

  // Check Proctor
  const proctorsList = Object.values(currentDb.proctors || {});
  const matchedProctor = proctorsList.find(p => p.username.trim().toLowerCase() === cleanUser);
  if (matchedProctor && matchedProctor.password === cleanPass) {
    if (matchedProctor.active === false) {
      res.status(403).json({ error: 'This proctor account is deactivated.' });
      return;
    }
    matchedProctor.lastLoginAt = Date.now();
    currentDb.proctors[matchedProctor.id] = matchedProctor;
    saveDatabase(currentDb);
    res.json({
      success: true,
      role: 'proctor',
      admin: {
        username: matchedProctor.username,
        name: matchedProctor.name
      },
      proctor: matchedProctor
    });
    return;
  }

  res.status(401).json({ error: 'Incorrect credentials' });
});

// Update Super Admin Credentials
app.post('/api/config/admin', (req: Request, res: Response) => {
  const { currentPassword, newUsername, newPassword, newName } = req.body;
  if (currentPassword !== db.config.admin.passwordHash && currentPassword !== '123admin') {
    res.status(403).json({ error: 'Current password does not match' });
    return;
  }

  if (newUsername) db.config.admin.username = String(newUsername).trim();
  if (newPassword) db.config.admin.passwordHash = String(newPassword);
  if (newName) db.config.admin.name = String(newName).trim();

  saveDatabase(db);
  res.json({ success: true });
});

// ---------------------------------------------------------------
// PROCTORS MANAGEMENT (SUPER ADMIN CONTROL)
// ---------------------------------------------------------------

// Get all proctor accounts (with created rooms count)
app.get('/api/admin/proctors', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const roomsList = Object.values(currentDb.rooms || {});
  const proctors = Object.values(currentDb.proctors || {}).map(p => {
    const roomsCount = roomsList.filter(
      r => r.createdBy === p.username || r.createdByProctor === p.name || r.createdBy === p.name
    ).length;
    return {
      ...p,
      roomsCount
    };
  });
  res.json(proctors);
});

// Create new proctor account
app.post('/api/admin/proctors', (req: Request, res: Response) => {
  const { username, password, name, email, notes, active } = req.body;
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '').trim();
  const cleanName = String(name || '').trim();

  if (!cleanUser || !cleanPass) {
    res.status(400).json({ error: 'Username and password are required for the new proctor account.' });
    return;
  }

  const currentDb = getDatabase();
  const existing = Object.values(currentDb.proctors || {}).find(
    p => p.username.toLowerCase() === cleanUser.toLowerCase()
  );
  if (existing || cleanUser.toLowerCase() === 'admin') {
    res.status(400).json({ error: `Username "${cleanUser}" is already taken.` });
    return;
  }

  const id = `proctor-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const newProctor: ProctorRecord = {
    id,
    username: cleanUser,
    password: cleanPass,
    name: cleanName || cleanUser,
    email: String(email || '').trim(),
    notes: String(notes || '').trim(),
    active: active !== false,
    createdAt: Date.now()
  };

  currentDb.proctors[id] = newProctor;
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('proctors_updated', newProctor);
  res.status(201).json({ success: true, proctor: newProctor });
});

// Update proctor account (username, password, name, email, active status)
app.put('/api/admin/proctors/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { username, password, name, email, notes, active } = req.body;
  const currentDb = getDatabase();
  const proctor = currentDb.proctors[id];

  if (!proctor) {
    res.status(404).json({ error: 'Proctor account not found.' });
    return;
  }

  if (username !== undefined) {
    const cleanUser = String(username).trim();
    if (!cleanUser) {
      res.status(400).json({ error: 'Username cannot be empty.' });
      return;
    }
    const duplicate = Object.values(currentDb.proctors).find(
      p => p.id !== id && p.username.toLowerCase() === cleanUser.toLowerCase()
    );
    if (duplicate || cleanUser.toLowerCase() === 'admin') {
      res.status(400).json({ error: `Username "${cleanUser}" is already taken.` });
      return;
    }
    proctor.username = cleanUser;
  }

  if (password !== undefined) {
    const cleanPass = String(password).trim();
    if (!cleanPass) {
      res.status(400).json({ error: 'Password cannot be empty.' });
      return;
    }
    proctor.password = cleanPass;
  }

  if (name !== undefined) proctor.name = String(name).trim() || proctor.username;
  if (email !== undefined) proctor.email = String(email).trim();
  if (notes !== undefined) proctor.notes = String(notes).trim();
  if (active !== undefined) proctor.active = Boolean(active);

  currentDb.proctors[id] = proctor;
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('proctors_updated', proctor);
  res.json({ success: true, proctor });
});

// Delete proctor account
app.delete('/api/admin/proctors/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const currentDb = getDatabase();
  if (!currentDb.proctors[id]) {
    res.status(404).json({ error: 'Proctor account not found.' });
    return;
  }
  const deleted = currentDb.proctors[id];
  delete currentDb.proctors[id];
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('proctors_updated', { deletedId: id });
  res.json({ success: true, deleted });
});

// ---------------------------------------------------------------
// EXAMINATION ROOMS
// ---------------------------------------------------------------

app.get('/api/rooms', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const list = Object.values(currentDb.rooms).sort((a, b) => b.createdAt - a.createdAt);
  res.json(list);
});

app.get('/api/rooms/:id', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const room = currentDb.rooms[req.params.id];
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  res.json(room);
});

// Admin Create Examination Room
// Allows typing custom room number & passcode, or auto-generating
app.post('/api/rooms', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const {
    id: customId,
    roomNumber,
    passcode,
    title,
    description,
    formUrl,
    antiCheat,
    maxViolations,
    timerEnabled,
    durationMinutes,
    calculatorEnabled,
    startAt,
    endAt,
    availabilityEnabled,
    active
  } = req.body;

  const trimmedRoom = String(roomNumber || '').trim();
  const trimmedPass = String(passcode || '').trim();
  const trimmedTitle = String(title || '').trim();
  const trimmedFormUrl = String(formUrl || '').trim();

  if (!trimmedRoom || !trimmedPass || !trimmedTitle) {
    res.status(400).json({ error: 'Room Number, Passcode, and Title are required.' });
    return;
  }

  if (!trimmedFormUrl.startsWith('http://') && !trimmedFormUrl.startsWith('https://')) {
    res.status(400).json({ error: 'Please enter a valid URL for the examination Google Form.' });
    return;
  }

  if (availabilityEnabled !== false) {
    const sMs = startAt ? new Date(startAt).getTime() : NaN;
    const eMs = endAt ? new Date(endAt).getTime() : NaN;
    if (startAt && isNaN(sMs)) {
      res.status(400).json({ error: 'The timeframe is incorrect: Start Date & Time is invalid.' });
      return;
    }
    if (endAt && isNaN(eMs)) {
      res.status(400).json({ error: 'The timeframe is incorrect: End Date & Time is invalid.' });
      return;
    }
    if (startAt && endAt && sMs >= eMs) {
      res.status(400).json({ error: 'The timeframe is incorrect: End Date & Time must be later than Start Date & Time.' });
      return;
    }
  }

  // Check room number uniqueness
  const duplicate = Object.values(currentDb.rooms).find(
    r => r.roomNumber.toLowerCase() === trimmedRoom.toLowerCase()
  );

  if (duplicate) {
    res.status(400).json({ error: `Room Number "${trimmedRoom}" is already in use. Please choose a different number.` });
    return;
  }

  const id = customId && typeof customId === 'string' && customId.trim()
    ? customId.trim()
    : `room-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  const newRoom: RoomRecord = {
    id,
    roomNumber: trimmedRoom,
    passcode: trimmedPass,
    title: trimmedTitle,
    description: String(description || '').trim(),
    formUrl: trimmedFormUrl,
    antiCheat: antiCheat !== false,
    maxViolations: Math.max(1, Number(maxViolations) || 3),
    timerEnabled: timerEnabled !== false,
    durationMinutes: Math.max(1, Number(durationMinutes) || 60),
    calculatorEnabled: calculatorEnabled !== false,
    startAt: startAt || '',
    endAt: endAt || '',
    availabilityEnabled: availabilityEnabled !== undefined ? Boolean(availabilityEnabled) : Boolean(startAt || endAt),
    visitsCount: 0,
    active: active !== false,
    createdAt: Date.now(),
    createdBy: String(req.body.createdBy || 'proctor').trim(),
    createdByProctor: String(req.body.createdByProctor || req.body.createdBy || 'Proctor').trim()
  };

  currentDb.rooms[id] = newRoom;
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('room_created', newRoom);
  res.status(201).json(newRoom);
});

// Update or Upsert Room
app.put('/api/rooms/:id', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { id } = req.params;
  const existing = currentDb.rooms[id];

  const {
    roomNumber,
    passcode,
    title,
    description,
    formUrl,
    antiCheat,
    maxViolations,
    timerEnabled,
    durationMinutes,
    calculatorEnabled,
    startAt,
    endAt,
    availabilityEnabled,
    visitsCount,
    active
  } = req.body;

  let targetRoom: RoomRecord;

  if (existing) {
    if (roomNumber !== undefined) {
      const trimmedRoom = String(roomNumber).trim();
      const duplicate = Object.values(currentDb.rooms).find(
        r => r.id !== id && r.roomNumber.toLowerCase() === trimmedRoom.toLowerCase()
      );
      if (duplicate) {
        res.status(400).json({ error: `Room Number "${trimmedRoom}" is already used by another room.` });
        return;
      }
      existing.roomNumber = trimmedRoom;
    }

    if (passcode !== undefined) existing.passcode = String(passcode).trim();
    if (title !== undefined) existing.title = String(title).trim();
    if (description !== undefined) existing.description = String(description).trim();
    if (formUrl !== undefined) existing.formUrl = String(formUrl).trim();
    if (antiCheat !== undefined) existing.antiCheat = Boolean(antiCheat);
    if (maxViolations !== undefined) existing.maxViolations = Math.max(1, Number(maxViolations) || 3);
    if (timerEnabled !== undefined) existing.timerEnabled = Boolean(timerEnabled);
    if (durationMinutes !== undefined) existing.durationMinutes = Math.max(1, Number(durationMinutes) || 60);
    if (calculatorEnabled !== undefined) existing.calculatorEnabled = Boolean(calculatorEnabled);
    if (startAt !== undefined) existing.startAt = startAt;
    if (endAt !== undefined) existing.endAt = endAt;
    if (availabilityEnabled !== undefined) existing.availabilityEnabled = Boolean(availabilityEnabled);
    if (visitsCount !== undefined) existing.visitsCount = Number(visitsCount);
    if (active !== undefined) existing.active = Boolean(active);

    targetRoom = existing;
  } else {
    // Upsert room so client edits always persist across PCs even if creation was pending
    const trimmedRoom = String(roomNumber || id.slice(-6)).trim();
    const trimmedPass = String(passcode || 'PASS01').trim();
    const trimmedTitle = String(title || 'Examination Room').trim();
    const trimmedFormUrl = String(formUrl || DEFAULT_FORM_URL).trim();

    targetRoom = {
      id,
      roomNumber: trimmedRoom,
      passcode: trimmedPass,
      title: trimmedTitle,
      description: String(description || '').trim(),
      formUrl: trimmedFormUrl,
      antiCheat: antiCheat !== false,
      maxViolations: Math.max(1, Number(maxViolations) || 3),
      timerEnabled: timerEnabled !== false,
      durationMinutes: Math.max(1, Number(durationMinutes) || 60),
      calculatorEnabled: calculatorEnabled !== false,
      startAt: startAt || '',
      endAt: endAt || '',
      availabilityEnabled: availabilityEnabled !== undefined ? Boolean(availabilityEnabled) : Boolean(startAt || endAt),
      visitsCount: Number(visitsCount) || 0,
      active: active !== false,
      createdAt: Date.now(),
      createdBy: 'admin'
    };
    currentDb.rooms[id] = targetRoom;
  }

  const effAvail = availabilityEnabled !== undefined ? Boolean(availabilityEnabled) : targetRoom.availabilityEnabled;
  if (effAvail !== false && (startAt !== undefined || endAt !== undefined || availabilityEnabled !== undefined)) {
    const effStart = targetRoom.startAt || '';
    const effEnd = targetRoom.endAt || '';
    const sMs = effStart ? new Date(effStart).getTime() : NaN;
    const eMs = effEnd ? new Date(effEnd).getTime() : NaN;
    if (effStart && isNaN(sMs)) {
      res.status(400).json({ error: 'The timeframe is incorrect: Start Date & Time is invalid.' });
      return;
    }
    if (effEnd && isNaN(eMs)) {
      res.status(400).json({ error: 'The timeframe is incorrect: End Date & Time is invalid.' });
      return;
    }
    if (effStart && effEnd && sMs >= eMs) {
      res.status(400).json({ error: 'The timeframe is incorrect: End Date & Time must be later than Start Date & Time.' });
      return;
    }
  }

  currentDb.rooms[id] = targetRoom;
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('room_updated', targetRoom);
  res.json(targetRoom);
});

// Delete Room
app.delete('/api/rooms/:id', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { id } = req.params;
  if (!currentDb.rooms[id]) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  delete currentDb.rooms[id];
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('room_deleted', { id });
  res.json({ success: true, id });
});

// Record a room visit (increments visitsCount)
app.post('/api/rooms/:id/visit', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { id } = req.params;
  const room = currentDb.rooms[id];
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  room.visitsCount = (room.visitsCount || 0) + 1;
  currentDb.rooms[id] = room;
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('room_updated', room);
  res.json({ success: true, visitsCount: room.visitsCount });
});

// Verify Room Entry for examinee (checks roomNumber & passcode typed by student)
app.post('/api/rooms/verify', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { roomNumber, passcode } = req.body;
  const trimmedRoom = String(roomNumber || '').trim().toLowerCase();
  const trimmedPass = String(passcode || '').trim();

  const match = Object.values(currentDb.rooms).find(
    r =>
      r.roomNumber.trim().toLowerCase() === trimmedRoom &&
      (r.passcode.trim() === trimmedPass || r.passcode.trim().toUpperCase() === trimmedPass.toUpperCase())
  );

  if (!match) {
    res.status(404).json({ error: 'Invalid Room Number or Passcode. Please check and try again.' });
    return;
  }

  const now = Date.now();
  const availabilityEnabled = match.availabilityEnabled !== false;
  if (availabilityEnabled) {
    if (match.endAt && new Date(match.endAt).getTime() <= now) {
      if (match.active) {
        match.active = false;
        currentDb.rooms[match.id] = match;
        db = currentDb;
        saveDatabase(currentDb);
        broadcastUpdate('room_updated', match);
      }
      res.status(403).json({
        error: `This examination room has been force-closed. The availability window ended on ${new Date(match.endAt).toLocaleString()}.`
      });
      return;
    }

    if (match.startAt && new Date(match.startAt).getTime() > now) {
      res.status(403).json({
        error: `This examination room is not open yet. It is scheduled to open on ${new Date(match.startAt).toLocaleString()}.`
      });
      return;
    }
  }

  if (!match.active) {
    res.status(403).json({ error: 'This examination room is currently closed by the administrator.' });
    return;
  }

  res.json({
    success: true,
    room: match
  });
});

// ---------------------------------------------------------------
// EXAM ATTEMPTS (SESSIONS)
// ---------------------------------------------------------------

app.get('/api/attempts', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const list = Object.values(currentDb.attempts).sort((a, b) => b.startedAt - a.startedAt);
  res.json(list);
});

// Participant starts an exam
app.post('/api/attempts', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { examId, participantId, participantName } = req.body;
  const exam = currentDb.rooms[examId];
  if (!exam) {
    res.status(404).json({ error: 'Examination room not found' });
    return;
  }

  const attemptId = `attempt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  const newAttempt: AttemptRecord = {
    id: attemptId,
    examId: exam.id,
    examTitle: exam.title,
    roomNumber: exam.roomNumber,
    participantId: String(participantId || `EXM-${Date.now().toString(36).toUpperCase()}`),
    participantName: String(participantName || '').trim(),
    startedAt: Date.now(),
    endedAt: null,
    status: 'In Progress',
    violations: 0,
    maxViolations: Math.max(1, Number(exam.maxViolations) || 5),
    flagged: false
  };

  currentDb.attempts[attemptId] = newAttempt;
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('attempt_started', newAttempt);
  res.status(201).json(newAttempt);
});

// Update attempt (e.g. submit exam, time expired, or record violation)
app.put('/api/attempts/:id', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { id } = req.params;
  const attempt = currentDb.attempts[id];
  if (!attempt) {
    res.status(404).json({ error: 'Attempt not found' });
    return;
  }

  const { status, endedAt, violations, flagged, durationSeconds } = req.body;
  if (status) attempt.status = status;
  if (endedAt) {
    attempt.endedAt = endedAt;
    attempt.durationSeconds = Math.max(0, Math.round((endedAt - attempt.startedAt) / 1000));
  }
  if (durationSeconds !== undefined) attempt.durationSeconds = durationSeconds;
  if (violations !== undefined) attempt.violations = violations;
  if (flagged !== undefined) attempt.flagged = Boolean(flagged);

  currentDb.attempts[id] = attempt;
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('attempt_updated', attempt);
  res.json(attempt);
});

// Delete Single Attempt
app.delete('/api/attempts/:id', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { id } = req.params;
  if (!currentDb.attempts[id]) {
    res.status(404).json({ error: 'Attempt not found' });
    return;
  }
  delete currentDb.attempts[id];
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('attempt_deleted', { id });
  res.json({ success: true, id });
});

// Delete Multiple or All Attempts
app.delete('/api/attempts', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { ids, all } = req.body || {};

  if (all === true) {
    const count = Object.keys(currentDb.attempts).length;
    currentDb.attempts = {};
    db = currentDb;
    saveDatabase(currentDb);
    broadcastUpdate('attempts_cleared', { count });
    res.json({ success: true, message: 'All examinee attempts cleared', deletedCount: count });
    return;
  }

  if (Array.isArray(ids) && ids.length > 0) {
    let deletedCount = 0;
    for (const id of ids) {
      if (currentDb.attempts[id]) {
        delete currentDb.attempts[id];
        deletedCount++;
      }
    }
    db = currentDb;
    saveDatabase(currentDb);
    broadcastUpdate('attempts_bulk_deleted', { ids });
    res.json({ success: true, deletedCount });
    return;
  }

  res.status(400).json({ error: 'Please specify "ids" array or "all: true" in request body.' });
});

// ---------------------------------------------------------------
// SECURITY VIOLATIONS (ANTI-CHEAT AUDIT LOG)
// ---------------------------------------------------------------

app.get('/api/violations', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const list = Object.values(currentDb.violations).sort((a, b) => b.timestamp - a.timestamp);
  res.json(list);
});

// Record a proctor violation event & eject examinee if limit reached
app.post('/api/violations', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { attemptId, reason } = req.body;
  const attempt = currentDb.attempts[attemptId];
  if (!attempt) {
    res.status(404).json({ error: 'Session attempt not found' });
    return;
  }

  const exam = currentDb.rooms[attempt.examId];
  const violationNumber = (attempt.violations || 0) + 1;
  const maxViolations = attempt.maxViolations || exam?.maxViolations || 5;
  const isFlagged = violationNumber >= maxViolations;

  const violationId = `vio-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const newViolation: ViolationRecord = {
    id: violationId,
    attemptId: attempt.id,
    examId: attempt.examId,
    examTitle: attempt.examTitle,
    roomNumber: attempt.roomNumber,
    participantId: attempt.participantId,
    number: violationNumber,
    reason: String(reason || 'Security event detected'),
    timestamp: Date.now()
  };

  currentDb.violations[violationId] = newViolation;
  attempt.violations = violationNumber;
  if (isFlagged) {
    attempt.flagged = true;
    attempt.status = 'Terminated';
    if (!attempt.endedAt) {
      attempt.endedAt = Date.now();
      attempt.durationSeconds = Math.max(0, Math.round((attempt.endedAt - attempt.startedAt) / 1000));
    }
  }

  currentDb.attempts[attempt.id] = attempt;
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('violation_logged', { violation: newViolation, attempt, ejected: isFlagged });
  res.status(201).json({ violation: newViolation, attempt, ejected: isFlagged });
});

// Delete Single Violation
app.delete('/api/violations/:id', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { id } = req.params;
  if (!currentDb.violations[id]) {
    res.status(404).json({ error: 'Violation event not found' });
    return;
  }
  delete currentDb.violations[id];
  db = currentDb;
  saveDatabase(currentDb);
  broadcastUpdate('violation_deleted', { id });
  res.json({ success: true, id });
});

// Delete Multiple or All Violations
app.delete('/api/violations', (req: Request, res: Response) => {
  const currentDb = getDatabase();
  const { ids, all } = req.body || {};

  if (all === true) {
    const count = Object.keys(currentDb.violations).length;
    currentDb.violations = {};
    db = currentDb;
    saveDatabase(currentDb);
    broadcastUpdate('violations_cleared', { count });
    res.json({ success: true, message: 'All security violations cleared', deletedCount: count });
    return;
  }

  if (Array.isArray(ids) && ids.length > 0) {
    let deletedCount = 0;
    for (const id of ids) {
      if (currentDb.violations[id]) {
        delete currentDb.violations[id];
        deletedCount++;
      }
    }
    db = currentDb;
    saveDatabase(currentDb);
    broadcastUpdate('violations_bulk_deleted', { ids });
    res.json({ success: true, deletedCount });
    return;
  }

  res.status(400).json({ error: 'Please specify "ids" array or "all: true" in request body.' });
});

// ---------------------------------------------------------------
// GOOGLE SHEET DATA BOARD ENDPOINTS
// ---------------------------------------------------------------
// GOOGLE SHEET DATA BOARD BACKEND API
// ---------------------------------------------------------------

function parseCSV(text: string): string[][] {
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

function normalizeSpreadsheetInput(rawInput: string): string {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return '';
  // Support users pasting full <iframe src="..."></iframe> snippet from Excel Online or Google Sheets
  if (trimmed.toLowerCase().includes('<iframe')) {
    const srcMatch = trimmed.match(/src\s*=\s*["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      return srcMatch[1].replace(/&amp;/g, '&').trim();
    }
  }
  return trimmed;
}

function detectSpreadsheetProvider(url: string): 'google' | 'excel' | 'csv' | 'unknown' {
  const lower = url.toLowerCase();
  if (lower.includes('docs.google.com/spreadsheets')) return 'google';
  if (
    lower.includes('1drv.ms') ||
    lower.includes('onedrive.live.com') ||
    lower.includes('sharepoint.com') ||
    lower.includes('sharepoint-df.com') ||
    lower.includes('view.officeapps.live.com') ||
    /\.(xlsx|xls|xlsm|xlsb|ods)(\?|$|#)/i.test(lower)
  ) {
    return 'excel';
  }
  if (/\.csv(\?|$|#)/i.test(lower) || lower.includes('output=csv') || lower.includes('format=csv')) {
    return 'csv';
  }
  return 'unknown';
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function resolveSpreadsheetMetadata(rawInput: string): Promise<{
  cleanUrl: string;
  provider: 'google' | 'excel' | 'csv' | 'unknown';
  resolvedUrl: string;
  embedUrl: string;
  officeViewerUrl: string;
  downloadCandidates: string[];
}> {
  const cleanUrl = normalizeSpreadsheetInput(rawInput);
  if (!cleanUrl) {
    return {
      cleanUrl: '',
      provider: 'unknown',
      resolvedUrl: '',
      embedUrl: '',
      officeViewerUrl: '',
      downloadCandidates: []
    };
  }

  const provider = detectSpreadsheetProvider(cleanUrl);

  // 1. GOOGLE SHEETS
  if (provider === 'google') {
    let gid: string | null = null;
    const gidMatch = cleanUrl.match(/[?&#]gid=([0-9]+)/);
    if (gidMatch && gidMatch[1]) gid = gidMatch[1];

    const pubMatch = cleanUrl.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (pubMatch && pubMatch[1]) {
      const csvUrl = `https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
      const embedUrl = `https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pubhtml${gid ? `?gid=${gid}&single=true` : '?widget=true&headers=false'}`;
      return {
        cleanUrl,
        provider: 'google',
        resolvedUrl: cleanUrl,
        embedUrl,
        officeViewerUrl: '',
        downloadCandidates: [csvUrl]
      };
    }

    const docMatch = cleanUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (docMatch && docMatch[1] && docMatch[1] !== 'e') {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${docMatch[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
      const embedUrl = `https://docs.google.com/spreadsheets/d/${docMatch[1]}/preview${gid ? `?gid=${gid}` : ''}`;
      return {
        cleanUrl,
        provider: 'google',
        resolvedUrl: cleanUrl,
        embedUrl,
        officeViewerUrl: '',
        downloadCandidates: [csvUrl]
      };
    }

    return {
      cleanUrl,
      provider: 'google',
      resolvedUrl: cleanUrl,
      embedUrl: cleanUrl,
      officeViewerUrl: '',
      downloadCandidates: [cleanUrl]
    };
  }

  // 2. MICROSOFT EXCEL ONLINE (1drv.ms, onedrive.live.com, *.sharepoint.com, view.officeapps.live.com, direct .xlsx)
  if (provider === 'excel') {
    let resolvedUrl = cleanUrl;
    const downloadCandidates: string[] = [];
    let embedUrl = '';
    let officeViewerUrl = '';

    // Extract src if already a view.officeapps.live.com link
    if (cleanUrl.toLowerCase().includes('view.officeapps.live.com')) {
      try {
        const u = new URL(cleanUrl);
        const innerSrc = u.searchParams.get('src');
        embedUrl = cleanUrl.replace(/\/op\/view\.aspx/i, '/op/embed.aspx');
        officeViewerUrl = embedUrl;
        if (innerSrc) {
          downloadCandidates.push(innerSrc);
        }
      } catch {
        embedUrl = cleanUrl;
      }
      return {
        cleanUrl,
        provider: 'excel',
        resolvedUrl,
        embedUrl,
        officeViewerUrl,
        downloadCandidates
      };
    }

    // Direct .xlsx/.xls URL
    if (/\.(xlsx|xls|xlsm|xlsb|ods)(\?|$|#)/i.test(cleanUrl)) {
      downloadCandidates.push(cleanUrl);
      officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(cleanUrl)}`;
      return {
        cleanUrl,
        provider: 'excel',
        resolvedUrl: cleanUrl,
        embedUrl: officeViewerUrl,
        officeViewerUrl,
        downloadCandidates
      };
    }

    // Attempt server-side redirect resolution for 1drv.ms and sharepoint /:x:/ short links
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(cleanUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml,*/*'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.url) {
        resolvedUrl = res.url;
      }
    } catch {
      // Ignore redirect resolution errors and proceed with pattern parsing
    }

    const inspectUrls = [resolvedUrl, cleanUrl];
    let resid = '';
    let cid = '';
    let authkey = '';

    for (const candidate of inspectUrls) {
      try {
        const u = new URL(candidate);
        if (!resid) resid = u.searchParams.get('resid') || '';
        if (!cid) cid = u.searchParams.get('cid') || '';
        if (!authkey) authkey = u.searchParams.get('authkey') || '';
        if (!resid && u.searchParams.get('id') && candidate.includes('onedrive.live.com')) {
          const idVal = u.searchParams.get('id') || '';
          if (idVal.includes('!')) resid = idVal;
        }
      } catch {
        // ignore URL parse error
      }
    }

    // Compute OneDrive public Shares API v1.0 token (works for Anyone with link on 1drv.ms / onedrive.live.com)
    const shareBase64 = Buffer.from(cleanUrl, 'utf8')
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const shareToken = `u!${shareBase64}`;

    // Try fetching OneDrive metadata to get direct @content.downloadUrl if personal OneDrive
    if (cleanUrl.includes('1drv.ms') || cleanUrl.includes('onedrive.live.com')) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const metaRes = await fetch(`https://api.onedrive.com/v1.0/shares/${shareToken}/driveItem`, {
          headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' },
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (metaRes.ok) {
          const metaJson: any = await metaRes.json();
          if (metaJson['@content.downloadUrl']) {
            downloadCandidates.push(metaJson['@content.downloadUrl']);
          }
          if (metaJson.id && !resid) resid = metaJson.id;
          if (metaJson.parentReference?.driveId && !cid) cid = metaJson.parentReference.driveId;
        }
      } catch {
        // Ignore shares metadata lookup errors
      }
      downloadCandidates.push(`https://api.onedrive.com/v1.0/shares/${shareToken}/root/content`);
    }

    // Classic OneDrive Personal (resid / authkey / cid)
    if (resid) {
      const qs = new URLSearchParams();
      qs.set('resid', resid);
      if (cid) qs.set('cid', cid);
      if (authkey) qs.set('authkey', authkey);

      const dlUrl = `https://onedrive.live.com/download?${qs.toString()}`;
      downloadCandidates.push(dlUrl);

      const embedQs = new URLSearchParams(qs);
      embedQs.set('em', '2');
      embedQs.set('wdAllowInteractivity', 'True');
      embedQs.set('wdDownloadButton', 'True');
      embedUrl = `https://onedrive.live.com/embed?${embedQs.toString()}`;
      officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(dlUrl)}`;
    } else if (cleanUrl.includes('onedrive.live.com/embed') || resolvedUrl.includes('onedrive.live.com/embed')) {
      embedUrl = cleanUrl.includes('/embed') ? cleanUrl : resolvedUrl;
    }

    // SharePoint / OneDrive for Business (*.sharepoint.com) or new OneDrive personal paths
    const isSharePoint =
      cleanUrl.toLowerCase().includes('sharepoint.com') ||
      resolvedUrl.toLowerCase().includes('sharepoint.com');

    if (isSharePoint || !embedUrl) {
      // Check if resolvedUrl or cleanUrl is Doc.aspx / WopiFrame.aspx
      const docCandidate = [resolvedUrl, cleanUrl].find(
        (u) => u.includes('Doc.aspx') || u.includes('WopiFrame.aspx')
      );

      if (docCandidate) {
        try {
          const u = new URL(docCandidate);
          const sourcedoc = u.searchParams.get('sourcedoc');
          u.searchParams.set('action', 'embedview');
          u.searchParams.set('wdAllowInteractivity', 'True');
          embedUrl = u.toString();

          if (sourcedoc) {
            const layoutIdx = docCandidate.indexOf('/_layouts/15/');
            if (layoutIdx !== -1) {
              const siteRoot = docCandidate.substring(0, layoutIdx);
              const spDownload = `${siteRoot}/_layouts/15/download.aspx?UniqueId=${encodeURIComponent(sourcedoc)}`;
              downloadCandidates.push(spDownload);
            }
          }
        } catch {
          embedUrl = docCandidate;
        }
      }

      // Handle SharePoint /:x:/g/ or /:x:/s/ or /:x:/r/ sharing links
      try {
        const spShareUrl = new URL(cleanUrl);
        if (!embedUrl) {
          const spEmbed = new URL(cleanUrl);
          spEmbed.searchParams.set('action', 'embedview');
          spEmbed.searchParams.set('wdAllowInteractivity', 'True');
          embedUrl = spEmbed.toString();
        }
        const spDownload = new URL(cleanUrl);
        spDownload.searchParams.set('download', '1');
        downloadCandidates.unshift(spDownload.toString());

        if (!officeViewerUrl) {
          officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
            spDownload.toString()
          )}`;
        }
      } catch {
        // ignore URL parse error
      }
    }

    // Fallback download candidates with &download=1
    try {
      const rUrl = new URL(resolvedUrl);
      rUrl.searchParams.set('download', '1');
      if (!downloadCandidates.includes(rUrl.toString())) {
        downloadCandidates.push(rUrl.toString());
      }
    } catch {
      // ignore
    }

    if (!officeViewerUrl && downloadCandidates.length > 0) {
      officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
        downloadCandidates[0]
      )}`;
    }

    return {
      cleanUrl,
      provider: 'excel',
      resolvedUrl,
      embedUrl: embedUrl || officeViewerUrl || cleanUrl,
      officeViewerUrl,
      downloadCandidates: Array.from(new Set(downloadCandidates))
    };
  }

  // 3. RAW CSV OR OTHER URL
  return {
    cleanUrl,
    provider,
    resolvedUrl: cleanUrl,
    embedUrl: cleanUrl,
    officeViewerUrl: '',
    downloadCandidates: [cleanUrl]
  };
}

function parseExcelWorkbookBuffer(buffer: Buffer): {
  headers: string[];
  rows: string[][];
  sheets: SheetWorksheet[];
  activeSheetName?: string;
} {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets: SheetWorksheet[] = [];

  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      defval: '',
      raw: false
    });

    const cleanedMatrix = rawMatrix
      .map((row) => (Array.isArray(row) ? row.map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim())) : []))
      .filter((row) => row.some((cell) => cell !== ''));

    if (cleanedMatrix.length > 0) {
      const headers = cleanedMatrix[0];
      const rows = cleanedMatrix.slice(1);
      sheets.push({ name, headers, rows });
    } else {
      sheets.push({ name, headers: [], rows: [] });
    }
  }

  const firstNonEmpty = sheets.find((s) => s.headers.length > 0) || sheets[0];
  return {
    headers: firstNonEmpty?.headers || [],
    rows: firstNonEmpty?.rows || [],
    sheets,
    activeSheetName: firstNonEmpty?.name
  };
}

async function fetchSpreadsheetData(sheetUrl: string): Promise<{
  url: string;
  provider: 'google' | 'excel' | 'csv' | 'unknown';
  resolvedUrl: string;
  embedUrl: string;
  officeViewerUrl: string;
  headers: string[];
  rows: string[][];
  sheets?: SheetWorksheet[];
  activeSheetName?: string;
}> {
  const meta = await resolveSpreadsheetMetadata(sheetUrl);
  if (!meta.cleanUrl) {
    return {
      url: '',
      provider: 'unknown',
      resolvedUrl: '',
      embedUrl: '',
      officeViewerUrl: '',
      headers: [],
      rows: []
    };
  }

  // Google Sheets & CSV text path
  if (meta.provider === 'google' || meta.provider === 'csv') {
    const targetUrl = meta.downloadCandidates[0] || meta.cleanUrl;
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/csv,text/plain,*/*'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch spreadsheet (${response.status} ${response.statusText}). Please verify the link is shared as "Anyone with the link can view".`
      );
    }

    const csvText = await response.text();
    if (csvText.trim().toLowerCase().startsWith('<!doctype html') || csvText.trim().toLowerCase().startsWith('<html')) {
      throw new Error(
        'Google returned a login or HTML page instead of spreadsheet data. Please set sharing to "Anyone with the link can view".'
      );
    }

    const parsed = parseCSV(csvText);
    const headers = parsed[0] || [];
    const rows = parsed.slice(1);
    return {
      url: meta.cleanUrl,
      provider: meta.provider,
      resolvedUrl: meta.resolvedUrl,
      embedUrl: meta.embedUrl,
      officeViewerUrl: meta.officeViewerUrl,
      headers,
      rows,
      sheets: [{ name: 'Sheet1', headers, rows }],
      activeSheetName: 'Sheet1'
    };
  }

  // Microsoft Excel Online / binary .xlsx path
  let lastErrorMsg = '';
  for (const candidateUrl of meta.downloadCandidates) {
    try {
      const response = await fetch(candidateUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,*/*'
        },
        redirect: 'follow'
      });

      if (!response.ok) {
        lastErrorMsg = `HTTP ${response.status} ${response.statusText}`;
        continue;
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const arrayBuf = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      if (buffer.length === 0) {
        lastErrorMsg = 'Empty response received from Microsoft server.';
        continue;
      }

      // Detect HTML login/error pages returned instead of the .xlsx file
      const headSnippet = buffer.subarray(0, 512).toString('utf8').trim().toLowerCase();
      if (
        contentType.includes('text/html') ||
        headSnippet.startsWith('<!doctype html') ||
        headSnippet.startsWith('<html')
      ) {
        lastErrorMsg =
          'Microsoft returned a web/sign-in page instead of the Excel workbook file. Verify sharing is set to "Anyone with the link can view" without sign-in required.';
        continue;
      }

      // Check if CSV text
      if (contentType.includes('text/csv') || candidateUrl.toLowerCase().includes('.csv')) {
        const parsedCsv = parseCSV(buffer.toString('utf8'));
        const headers = parsedCsv[0] || [];
        const rows = parsedCsv.slice(1);
        return {
          url: meta.cleanUrl,
          provider: meta.provider,
          resolvedUrl: meta.resolvedUrl,
          embedUrl: meta.embedUrl,
          officeViewerUrl: meta.officeViewerUrl,
          headers,
          rows,
          sheets: [{ name: 'Sheet1', headers, rows }],
          activeSheetName: 'Sheet1'
        };
      }

      // Parse Excel (.xlsx/.xls/.ods) binary workbook via SheetJS
      const parsedWorkbook = parseExcelWorkbookBuffer(buffer);
      return {
        url: meta.cleanUrl,
        provider: meta.provider,
        resolvedUrl: meta.resolvedUrl,
        embedUrl: meta.embedUrl,
        officeViewerUrl: meta.officeViewerUrl,
        headers: parsedWorkbook.headers,
        rows: parsedWorkbook.rows,
        sheets: parsedWorkbook.sheets,
        activeSheetName: parsedWorkbook.activeSheetName
      };
    } catch (err: any) {
      lastErrorMsg = err.message || 'Network error fetching Excel file';
    }
  }

  throw new Error(
    lastErrorMsg ||
      'Unable to download Excel workbook from this link. Ensure Microsoft Excel / OneDrive sharing is set to "Anyone with the link can view".'
  );
}

// Get Sheet Data (cached or live fetched)
app.get('/api/sheet', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    if (!force && db.sheetData && db.sheetData.headers && db.sheetData.headers.length > 0) {
      return res.json(db.sheetData);
    }

    const url = (db.sheetData?.url || '').trim();
    if (!url) {
      return res.json(db.sheetData || { url: '', lastSyncedAt: null, headers: [], rows: [] });
    }

    const fetched = await fetchSpreadsheetData(url);
    db.sheetData = {
      url: fetched.url,
      provider: fetched.provider,
      resolvedUrl: fetched.resolvedUrl,
      embedUrl: fetched.embedUrl,
      officeViewerUrl: fetched.officeViewerUrl,
      lastSyncedAt: Date.now(),
      headers: fetched.headers,
      rows: fetched.rows,
      sheets: fetched.sheets,
      activeSheetName: fetched.activeSheetName
    };
    saveDatabase(db);
    res.json(db.sheetData);
  } catch (err: any) {
    console.error('Error fetching sheet data:', err);
    if (db.sheetData) {
      return res.json(db.sheetData);
    }
    res.status(500).json({ error: err.message || 'Failed to fetch spreadsheet data' });
  }
});

// Resolve Spreadsheet Link Metadata (supports Google Sheets & Microsoft Excel Online)
app.post('/api/sheet/resolve', async (req: Request, res: Response) => {
  try {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    const meta = await resolveSpreadsheetMetadata(rawUrl);
    res.json({ success: true, ...meta });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to resolve spreadsheet link' });
  }
});

// Update Sheet URL (normalizes iframe snippets, resolves Excel/Google embed links)
app.post('/api/sheet/url', async (req: Request, res: Response) => {
  const { url } = req.body || {};
  const cleanedUrl = normalizeSpreadsheetInput(typeof url === 'string' ? url : '');

  if (!cleanedUrl) {
    db.sheetData = {
      url: '',
      provider: 'unknown',
      embedUrl: '',
      officeViewerUrl: '',
      resolvedUrl: '',
      lastSyncedAt: null,
      headers: [],
      rows: [],
      sheets: [],
      activeSheetName: undefined
    };
    saveDatabase(db);
    broadcastUpdate('sheet_updated', db.sheetData);
    return res.json({ success: true, sheetData: db.sheetData });
  }

  let meta = {
    cleanUrl: cleanedUrl,
    provider: detectSpreadsheetProvider(cleanedUrl),
    resolvedUrl: cleanedUrl,
    embedUrl: '',
    officeViewerUrl: ''
  };
  try {
    const resolved = await resolveSpreadsheetMetadata(cleanedUrl);
    meta = resolved;
  } catch {
    // Keep basic fallback
  }

  db.sheetData = {
    url: meta.cleanUrl,
    provider: meta.provider,
    resolvedUrl: meta.resolvedUrl,
    embedUrl: meta.embedUrl,
    officeViewerUrl: meta.officeViewerUrl,
    lastSyncedAt: db.sheetData?.url === meta.cleanUrl ? db.sheetData.lastSyncedAt : null,
    headers: db.sheetData?.url === meta.cleanUrl ? db.sheetData.headers : [],
    rows: db.sheetData?.url === meta.cleanUrl ? db.sheetData.rows : [],
    sheets: db.sheetData?.url === meta.cleanUrl ? db.sheetData.sheets : [],
    activeSheetName: db.sheetData?.url === meta.cleanUrl ? db.sheetData.activeSheetName : undefined
  };

  saveDatabase(db);
  broadcastUpdate('sheet_updated', db.sheetData);
  res.json({ success: true, sheetData: db.sheetData });
});

// Force Sync from Google Sheet or Microsoft Excel Online
app.post('/api/sheet/sync', async (req: Request, res: Response) => {
  try {
    const rawUrl = (req.body?.url ?? db.sheetData?.url ?? '').trim();
    const url = normalizeSpreadsheetInput(rawUrl);
    if (!url) {
      return res.status(400).json({ error: 'No spreadsheet link provided. Please paste and save your link first.' });
    }
    const fetched = await fetchSpreadsheetData(url);
    db.sheetData = {
      url: fetched.url,
      provider: fetched.provider,
      resolvedUrl: fetched.resolvedUrl,
      embedUrl: fetched.embedUrl,
      officeViewerUrl: fetched.officeViewerUrl,
      lastSyncedAt: Date.now(),
      headers: fetched.headers,
      rows: fetched.rows,
      sheets: fetched.sheets,
      activeSheetName: fetched.activeSheetName
    };
    saveDatabase(db);
    broadcastUpdate('sheet_updated', db.sheetData);
    res.json({ success: true, sheetData: db.sheetData });
  } catch (err: any) {
    console.error('Error syncing spreadsheet:', err);
    res.status(500).json({ error: err.message || 'Failed to sync spreadsheet' });
  }
});

// Save whole table modifications from Data Board
app.post('/api/sheet/save', (req: Request, res: Response) => {
  const { headers, rows, url } = req.body;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'Rows array required' });
  }
  if (!db.sheetData) {
    db.sheetData = {
      url: typeof url === 'string' ? url.trim() : '',
      lastSyncedAt: Date.now(),
      headers: headers || [],
      rows: []
    };
  }
  if (Array.isArray(headers) && headers.length > 0) {
    db.sheetData.headers = headers;
  }
  db.sheetData.rows = rows;
  if (typeof url === 'string') db.sheetData.url = url.trim();
  saveDatabase(db);
  broadcastUpdate('sheet_updated', db.sheetData);
  res.json({ success: true, sheetData: db.sheetData });
});

// Update a single cell in the data board
app.post('/api/sheet/cell', (req: Request, res: Response) => {
  const { rowIndex, colIndex, value } = req.body;
  if (typeof rowIndex !== 'number' || typeof colIndex !== 'number' || value === undefined) {
    return res.status(400).json({ error: 'rowIndex, colIndex, and value required' });
  }
  if (!db.sheetData || !db.sheetData.rows) {
    return res.status(404).json({ error: 'Sheet data not loaded yet' });
  }
  if (rowIndex < 0 || rowIndex >= db.sheetData.rows.length) {
    return res.status(400).json({ error: 'Invalid rowIndex' });
  }
  const row = [...db.sheetData.rows[rowIndex]];
  while (row.length <= colIndex) {
    row.push('');
  }
  row[colIndex] = String(value);
  db.sheetData.rows[rowIndex] = row;
  saveDatabase(db);
  broadcastUpdate('sheet_cell_updated', { rowIndex, colIndex, value });
  res.json({ success: true, row });
});

// Add a row to the data board
app.post('/api/sheet/row', (req: Request, res: Response) => {
  const { row, index } = req.body;
  if (!Array.isArray(row)) {
    return res.status(400).json({ error: 'Row array required' });
  }
  if (!db.sheetData) {
    db.sheetData = {
      url: '',
      lastSyncedAt: Date.now(),
      headers: [],
      rows: []
    };
  }
  if (typeof index === 'number' && index >= 0 && index <= db.sheetData.rows.length) {
    db.sheetData.rows.splice(index, 0, row);
  } else {
    db.sheetData.rows.unshift(row);
  }
  saveDatabase(db);
  broadcastUpdate('sheet_updated', db.sheetData);
  res.status(201).json({ success: true, rows: db.sheetData.rows });
});

// Delete a row from the data board
app.delete('/api/sheet/row/:index', (req: Request, res: Response) => {
  const index = parseInt(req.params.index, 10);
  if (isNaN(index) || !db.sheetData || !db.sheetData.rows || index < 0 || index >= db.sheetData.rows.length) {
    return res.status(400).json({ error: 'Invalid row index' });
  }
  const removed = db.sheetData.rows.splice(index, 1);
  saveDatabase(db);
  broadcastUpdate('sheet_updated', db.sheetData);
  res.json({ success: true, removedRow: removed[0], remainingRows: db.sheetData.rows.length });
});

// Reset All System Data to Default (Danger Zone)
app.post('/api/admin/reset-default', (req: Request, res: Response) => {
  try {
    // Delete all examination rooms
    db.rooms = {};
    // Delete all submissions & attempts
    db.attempts = {};
    // Delete all security violations
    db.violations = {};
    // Reset proctor accounts to factory default
    db.proctors = JSON.parse(JSON.stringify(DEFAULT_STATE.proctors));
    // Reset administrator credentials to factory default
    db.config.admin = JSON.parse(JSON.stringify(DEFAULT_STATE.config.admin));
    // Clear Google Sheet connection and data
    db.sheetData = {
      url: '',
      lastSyncedAt: null,
      headers: [],
      rows: []
    };

    saveDatabase(db);

    // Notify all connected clients in real time
    broadcastUpdate('system_reset', {
      timestamp: Date.now(),
      message: 'All proctor accounts, examination rooms, submissions, and violations have been reset to factory default.'
    });

    res.json({
      success: true,
      message: 'System factory reset successfully executed. All rooms, submissions, and violations have been wiped, and proctor accounts have been restored to default.'
    });
  } catch (err: any) {
    console.error('Error during system reset:', err);
    res.status(500).json({ error: err.message || 'Failed to reset system data' });
  }
});

// ---------------------------------------------------------------
// VITE MIDDLEWARE & SERVER STARTUP
// ---------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Proctor+ Examination Portal server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
