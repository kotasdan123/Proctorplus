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
  createdBy: string;
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

export interface ParticipantSession {
  role: 'room';
  roomId: string;
  roomNumber: string;
  participantId: string;
  participantName: string;
  activeAttemptId?: string;
}

export interface AdminSession {
  role: 'admin';
  adminUsername: string;
  name: string;
}

export type UserSession = ParticipantSession | AdminSession | null;
