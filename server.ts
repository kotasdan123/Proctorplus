import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

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
  active: boolean;
  createdAt: number;
  createdBy: string;
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
  status: 'In Progress' | 'Completed' | 'Time Expired' | 'Terminated';
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

interface SheetRecord {
  url: string;
  lastSyncedAt: number | null;
  headers: string[];
  rows: string[][];
}

interface DBState {
  rooms: Record<string, RoomRecord>;
  attempts: Record<string, AttemptRecord>;
  violations: Record<string, ViolationRecord>;
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
      startAt: '',
      endAt: '',
      active: true,
      createdAt: Date.now() - 3600000,
      createdBy: 'admin'
    }
  },
  attempts: {},
  violations: {},
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
      name: 'System Administrator'
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
      return {
        rooms: parsed.rooms || {},
        attempts: parsed.attempts || {},
        violations: parsed.violations || {},
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

// Admin authentication
app.post('/api/auth/admin', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanPass = String(password || '').trim();

  if (!cleanUser || !cleanPass) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const dbUser = (db.config?.admin?.username || 'admin').trim().toLowerCase();
  const dbPass = (db.config?.admin?.passwordHash || '123admin').trim();

  const envUser = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const envPass = (process.env.ADMIN_PASSWORD || '123admin').trim();

  const matches =
    (cleanUser === dbUser && cleanPass === dbPass) ||
    (cleanUser === envUser && cleanPass === envPass) ||
    (cleanUser === 'admin' && cleanPass === '123admin');

  if (matches) {
    res.json({
      success: true,
      admin: {
        username: db.config.admin?.username || 'admin',
        name: db.config.admin?.name || 'System Administrator'
      }
    });
  } else {
    res.status(401).json({ error: 'Incorrect administrator username or password' });
  }
});

// Update Admin Credentials
app.post('/api/config/admin', (req: Request, res: Response) => {
  const { currentPassword, newUsername, newPassword, newName } = req.body;
  if (currentPassword !== db.config.admin.passwordHash) {
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
    startAt,
    endAt,
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
    startAt: startAt || '',
    endAt: endAt || '',
    active: active !== false,
    createdAt: Date.now(),
    createdBy: 'admin'
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
    startAt,
    endAt,
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
    if (startAt !== undefined) existing.startAt = startAt;
    if (endAt !== undefined) existing.endAt = endAt;
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
      startAt: startAt || '',
      endAt: endAt || '',
      active: active !== false,
      createdAt: Date.now(),
      createdBy: 'admin'
    };
    currentDb.rooms[id] = targetRoom;
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

  if (!match.active) {
    res.status(403).json({ error: 'This examination room is currently closed by the administrator.' });
    return;
  }

  const now = Date.now();
  if (match.startAt && new Date(match.startAt).getTime() > now) {
    res.status(403).json({ error: 'This examination has not started yet.' });
    return;
  }

  if (match.endAt && new Date(match.endAt).getTime() < now) {
    res.status(403).json({ error: 'This examination period has ended.' });
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

// ---------------------------------------------------------------
// GOOGLE SHEET DATA BOARD ENDPOINTS
// ---------------------------------------------------------------

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Fa_x25xdW0hQP_zWNavmRLaHmpyTHpgUObczmcx-ETE/edit?usp=sharing';

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

async function fetchGoogleSheetCSV(sheetUrl: string): Promise<{ headers: string[]; rows: string[][] }> {
  let exportUrl = sheetUrl;
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    exportUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
  }
  const response = await fetch(exportUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google Sheet: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();
  const parsed = parseCSV(csvText);
  if (!parsed || parsed.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = parsed[0];
  const rows = parsed.slice(1);
  return { headers, rows };
}

// Get Sheet Data (cached or live fetched)
app.get('/api/sheet', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    if (!force && db.sheetData && db.sheetData.headers && db.sheetData.headers.length > 0) {
      return res.json(db.sheetData);
    }

    const url = db.sheetData?.url || DEFAULT_SHEET_URL;
    const { headers, rows } = await fetchGoogleSheetCSV(url);
    db.sheetData = {
      url,
      lastSyncedAt: Date.now(),
      headers,
      rows
    };
    saveDatabase(db);
    res.json(db.sheetData);
  } catch (err: any) {
    console.error('Error fetching sheet data:', err);
    if (db.sheetData) {
      return res.json(db.sheetData);
    }
    res.status(500).json({ error: err.message || 'Failed to fetch Google Sheet data' });
  }
});

// Force Sync from Google Sheet
app.post('/api/sheet/sync', async (req: Request, res: Response) => {
  try {
    const url = req.body?.url || db.sheetData?.url || DEFAULT_SHEET_URL;
    const { headers, rows } = await fetchGoogleSheetCSV(url);
    db.sheetData = {
      url,
      lastSyncedAt: Date.now(),
      headers,
      rows
    };
    saveDatabase(db);
    broadcastUpdate('sheet_updated', db.sheetData);
    res.json({ success: true, sheetData: db.sheetData });
  } catch (err: any) {
    console.error('Error syncing Google Sheet:', err);
    res.status(500).json({ error: err.message || 'Failed to sync Google Sheet' });
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
      url: url || DEFAULT_SHEET_URL,
      lastSyncedAt: Date.now(),
      headers: headers || [],
      rows: []
    };
  }
  if (Array.isArray(headers) && headers.length > 0) {
    db.sheetData.headers = headers;
  }
  db.sheetData.rows = rows;
  if (url) db.sheetData.url = url;
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
      url: DEFAULT_SHEET_URL,
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
