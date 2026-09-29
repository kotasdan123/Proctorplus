export interface ExamRoom {
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
  createdBy: string; // e.g. proctor username or name
  createdByProctor?: string; // friendly proctor attribution
}

export type AttemptStatus = 'In Progress' | 'Completed' | 'Time Expired' | 'Terminated';

export interface ExamAttempt {
  id: string;
  examId: string;
  examTitle: string;
  roomNumber: string;
  participantId: string;
  participantName: string;
  startedAt: number;
  endedAt: number | null;
  durationSeconds?: number;
  status: AttemptStatus;
  violations: number;
  maxViolations?: number;
  flagged: boolean;
}

export interface SecurityViolation {
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

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  enabled: boolean;
}

export interface SystemConfig {
  syncMode: 'server' | 'firebase';
  firebase: FirebaseConfig;
  admin: {
    username: string;
    name: string;
  };
}

export interface ProctorAccount {
  id: string;
  username: string;
  password: string;
  name: string;
  email?: string;
  notes?: string;
  active: boolean;
  createdAt: number;
  lastLoginAt?: number;
  roomsCount?: number;
}

export interface ParticipantSession {
  role: 'room';
  roomId: string;
  roomNumber: string;
  participantId: string;
  participantName: string;
  activeAttemptId?: string;
}

export interface ProctorSession {
  role: 'proctor';
  proctorId?: string;
  username: string;
  name: string;
}

export interface SuperAdminSession {
  role: 'superadmin';
  username: string;
  name: string;
}

// Backwards-compatibility alias for previous admin session
export interface AdminSession {
  role: 'admin' | 'superadmin' | 'proctor';
  adminUsername?: string;
  username?: string;
  name: string;
  proctorId?: string;
}

export type UserSession = ParticipantSession | ProctorSession | SuperAdminSession | AdminSession | null;

export interface SheetData {
  url: string;
  lastSyncedAt: number | null;
  headers: string[];
  rows: string[][];
  hasUnsavedEdits?: boolean;
}
