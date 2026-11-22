import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AdminNotification,
  AdminRole,
  AdminUser,
  AuditLog,
  ChatMessage,
  Conversation,
  Department,
  FaqItem,
  FeeStructure,
  KnowledgeDocument,
  Language,
  Program,
  Scholarship,
  StudentUser,
  UnansweredQuestion,
  UniversitySettings,
} from '../src/types.ts';
import {
  DEFAULT_SETTINGS,
  SEED_DEPARTMENTS,
  SEED_FAQS,
  SEED_FEES,
  SEED_KNOWLEDGE_DOCS,
  SEED_NOTIFICATIONS,
  SEED_PROGRAMS,
  SEED_SCHOLARSHIPS,
} from './seedData.ts';

export interface StoredStudent extends StudentUser {
  passwordHash: string;
  resetCode?: string;
  resetExpiresAt?: number;
}

export interface StoredAdmin extends AdminUser {
  passwordHash: string;
}

export interface KnowledgeChunkRecord {
  id: string;
  docId: string;
  docTitle: string;
  category: string;
  sourceUrl?: string;
  effectiveSemester: string;
  verificationStatus: 'verified' | 'pending_verification';
  status: 'active' | 'expired';
  text: string;
  embedding: number[];
}

export interface ApiMetricRecord {
  totalCalls: number;
  totalErrors: number;
  dailyCounts: Record<string, number>;
  lastError?: string;
  lastErrorAt?: string;
}

export interface DatabaseState {
  students: StoredStudent[];
  admins: StoredAdmin[];
  conversations: Conversation[];
  messages: ChatMessage[];
  departments: Department[];
  programs: Program[];
  feeStructures: FeeStructure[];
  scholarships: Scholarship[];
  faqs: FaqItem[];
  knowledgeDocuments: KnowledgeDocument[];
  knowledgeChunks: KnowledgeChunkRecord[];
  unansweredQuestions: UnansweredQuestion[];
  notifications: AdminNotification[];
  auditLogs: AuditLog[];
  settings: UniversitySettings;
  apiMetrics: ApiMetricRecord;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'diu-assistant-db.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createInitialState(): DatabaseState {
  return {
    students: [],
    admins: [],
    conversations: [],
    messages: [],
    departments: structuredClone(SEED_DEPARTMENTS),
    programs: structuredClone(SEED_PROGRAMS),
    feeStructures: structuredClone(SEED_FEES),
    scholarships: structuredClone(SEED_SCHOLARSHIPS),
    faqs: structuredClone(SEED_FAQS),
    knowledgeDocuments: structuredClone(SEED_KNOWLEDGE_DOCS),
    knowledgeChunks: [],
    unansweredQuestions: [],
    notifications: structuredClone(SEED_NOTIFICATIONS),
    auditLogs: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    apiMetrics: {
      totalCalls: 0,
      totalErrors: 0,
      dailyCounts: {},
    },
  };
}

let dbState: DatabaseState | null = null;
let writeTimer: NodeJS.Timeout | null = null;

export function getDb(): DatabaseState {
  if (dbState) return dbState;
  ensureDataDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DatabaseState>;
      const base = createInitialState();
      dbState = {
        ...base,
        ...parsed,
        settings: {
          ...base.settings,
          ...(parsed.settings ?? {}),
          widget: {
            ...base.settings.widget,
            ...(parsed.settings?.widget ?? {}),
          },
        },
        apiMetrics: {
          ...base.apiMetrics,
          ...(parsed.apiMetrics ?? {}),
          dailyCounts: {
            ...base.apiMetrics.dailyCounts,
            ...(parsed.apiMetrics?.dailyCounts ?? {}),
          },
        },
      };
      return dbState;
    } catch {
      dbState = createInitialState();
      saveDbImmediate();
      return dbState;
    }
  }

  dbState = createInitialState();
  saveDbImmediate();
  return dbState;
}

export function saveDbImmediate(): void {
  if (!dbState) return;
  ensureDataDir();
  const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(dbState, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function scheduleSaveDb(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    saveDbImmediate();
    writeTimer = null;
  }, 150);
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

export function addAuditLog(params: {
  adminId: string;
  adminEmail: string;
  role: AdminRole;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
}): void {
  const db = getDb();
  const entry: AuditLog = {
    id: newId('audit'),
    adminId: params.adminId,
    adminEmail: params.adminEmail,
    role: params.role,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details,
    createdAt: new Date().toISOString(),
  };
  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 500) {
    db.auditLogs = db.auditLogs.slice(0, 500);
  }
  scheduleSaveDb();
}

export function addNotification(params: {
  type: AdminNotification['type'];
  title: string;
  message: string;
}): void {
  const db = getDb();
  const notif: AdminNotification = {
    id: newId('notif'),
    type: params.type,
    title: params.title,
    message: params.message,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  db.notifications.unshift(notif);
  if (db.notifications.length > 100) {
    db.notifications = db.notifications.slice(0, 100);
  }
  scheduleSaveDb();
}

export function recordApiCall(ok: boolean, errMsg?: string): void {
  const db = getDb();
  const day = new Date().toISOString().slice(0, 10);
  db.apiMetrics.totalCalls += 1;
  db.apiMetrics.dailyCounts[day] = (db.apiMetrics.dailyCounts[day] ?? 0) + 1;
  if (!ok) {
    db.apiMetrics.totalErrors += 1;
    db.apiMetrics.lastError = errMsg ?? 'Unknown Gemini API error';
    db.apiMetrics.lastErrorAt = new Date().toISOString();
  }
  scheduleSaveDb();
}

export function sanitizePublicStudent(s: StoredStudent): StudentUser {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    preferredLanguage: s.preferredLanguage,
    interestedProgram: s.interestedProgram,
    createdAt: s.createdAt,
  };
}

export function sanitizePublicAdmin(a: StoredAdmin): AdminUser {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    active: a.active,
    createdAt: a.createdAt,
  };
}

export function detectLanguageServer(text: string): Language {
  const bn = text.match(/[\u0980-\u09FF]/g);
  return bn && bn.length >= 2 ? 'bn' : 'en';
}
