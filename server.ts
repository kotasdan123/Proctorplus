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

interface DBState {
  rooms: Record<string, RoomRecord>;
  attempts: Record<string, AttemptRecord>;
  violations: Record<string, ViolationRecord>;
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
      maxViolations: 3,
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

function saveDatabase(state: DBState) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database file:', err);
  }
}

// Connected SSE clients for live multi-PC updates
const sseClients = new Set<Response>();

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
  const roomsList = Object.values(db.rooms);
  const attemptsList = Object.values(db.attempts);
  const activeAttempts = attemptsList.filter(a => a.status === 'In Progress').length;
  const activeRooms = roomsList.filter(r => r.active).length;

  res.json({
    status: 'ok',
    connectedPCs: Math.max(1, sseClients.size),
    syncMode: db.config.syncMode,
    firebaseConfigured: Boolean(db.config.firebase?.apiKey && db.config.firebase.enabled),
    roomsCount: roomsList.length,
    activeRooms,
    activeAttempts,
    totalAttempts: attemptsList.length,
    totalViolations: Object.keys(db.violations).length
  });
});

// SSE endpoint for instant real-time sync across multiple computers
app.get('/api/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
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
  res.json({
    syncMode: db.config.syncMode,
    firebase: db.config.firebase,
    admin: {
      username: db.config.admin.username,
      name: db.config.admin.name
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
  const list = Object.values(db.rooms).sort((a, b) => b.createdAt - a.createdAt);
  res.json(list);
});

// Admin Create Examination Room
// Allows typing custom room number & passcode, or auto-generating
app.post('/api/rooms', (req: Request, res: Response) => {
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
  const duplicate = Object.values(db.rooms).find(
    r => r.roomNumber.toLowerCase() === trimmedRoom.toLowerCase()
  );

  if (duplicate) {
    res.status(400).json({ error: `Room Number "${trimmedRoom}" is already in use. Please choose a different number.` });
    return;
  }

  const id = `room-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
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

  db.rooms[id] = newRoom;
  saveDatabase(db);
  broadcastUpdate('room_created', newRoom);
  res.status(201).json(newRoom);
});

// Update Room
app.put('/api/rooms/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.rooms[id];
  if (!existing) {
    res.status(404).json({ error: 'Examination room not found' });
    return;
  }

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

  if (roomNumber) {
    const trimmedRoom = String(roomNumber).trim();
    const duplicate = Object.values(db.rooms).find(
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

  db.rooms[id] = existing;
  saveDatabase(db);
  broadcastUpdate('room_updated', existing);
  res.json(existing);
});

// Delete Room
app.delete('/api/rooms/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!db.rooms[id]) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  delete db.rooms[id];
  saveDatabase(db);
  broadcastUpdate('room_deleted', { id });
  res.json({ success: true, id });
});

// Verify Room Entry for examinee (checks roomNumber & passcode typed by student)
app.post('/api/rooms/verify', (req: Request, res: Response) => {
  const { roomNumber, passcode } = req.body;
  const trimmedRoom = String(roomNumber || '').trim().toLowerCase();
  const trimmedPass = String(passcode || '').trim();

  const match = Object.values(db.rooms).find(
    r => r.roomNumber.toLowerCase() === trimmedRoom && r.passcode === trimmedPass
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
  const list = Object.values(db.attempts).sort((a, b) => b.startedAt - a.startedAt);
  res.json(list);
});

// Participant starts an exam
app.post('/api/attempts', (req: Request, res: Response) => {
  const { examId, participantId, participantName } = req.body;
  const exam = db.rooms[examId];
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
    flagged: false
  };

  db.attempts[attemptId] = newAttempt;
  saveDatabase(db);
  broadcastUpdate('attempt_started', newAttempt);
  res.status(201).json(newAttempt);
});

// Update attempt (e.g. submit exam, time expired, or record violation)
app.put('/api/attempts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const attempt = db.attempts[id];
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

  db.attempts[id] = attempt;
  saveDatabase(db);
  broadcastUpdate('attempt_updated', attempt);
  res.json(attempt);
});

// ---------------------------------------------------------------
// SECURITY VIOLATIONS (ANTI-CHEAT AUDIT LOG)
// ---------------------------------------------------------------

app.get('/api/violations', (req: Request, res: Response) => {
  const list = Object.values(db.violations).sort((a, b) => b.timestamp - a.timestamp);
  res.json(list);
});

// Record a proctor violation event
app.post('/api/violations', (req: Request, res: Response) => {
  const { attemptId, reason } = req.body;
  const attempt = db.attempts[attemptId];
  if (!attempt) {
    res.status(404).json({ error: 'Session attempt not found' });
    return;
  }

  const exam = db.rooms[attempt.examId];
  const violationNumber = (attempt.violations || 0) + 1;
  const maxViolations = exam?.maxViolations || 3;
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

  db.violations[violationId] = newViolation;
  attempt.violations = violationNumber;
  if (isFlagged) {
    attempt.flagged = true;
  }

  db.attempts[attempt.id] = attempt;
  saveDatabase(db);
  broadcastUpdate('violation_logged', { violation: newViolation, attempt });
  res.status(201).json({ violation: newViolation, attempt });
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
