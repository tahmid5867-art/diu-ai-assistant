import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AdminRole } from '../src/types.ts';
import { getDb, newId, saveDbImmediate } from './db.ts';

let cachedFallbackKey: string | null = null;

function getSigningSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) return envSecret;
  if (cachedFallbackKey) return cachedFallbackKey;

  const secretPath = path.resolve(process.cwd(), '.data', '.session-secret');
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf-8').trim();
      if (existing.length >= 32) {
        cachedFallbackKey = existing;
        return cachedFallbackKey;
      }
    }
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, generated, { encoding: 'utf-8', mode: 0o600 });
    cachedFallbackKey = generated;
    return cachedFallbackKey;
  } catch {
    cachedFallbackKey = crypto.randomBytes(32).toString('hex');
    return cachedFallbackKey;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export interface SessionPayload {
  sub: string;
  kind: 'student' | 'guest' | 'admin';
  email?: string;
  role?: AdminRole;
  exp: number;
}

export function signToken(payload: Omit<SessionPayload, 'exp'>, ttlSeconds = 60 * 60 * 24 * 7): string {
  const full: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(full), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as SessionPayload;
    if (typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

export interface AuthenticatedRequest extends Request {
  session?: SessionPayload;
}

export function attachOptionalSession(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (token) {
    const verified = verifyToken(token);
    if (verified) {
      req.session = verified;
    }
  }
  next();
}

export function requireStudentOrGuest(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication or guest session token required.' });
    return;
  }
  const verified = verifyToken(token);
  if (!verified || (verified.kind !== 'student' && verified.kind !== 'guest')) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }
  req.session = verified;
  next();
}

export function requireStudent(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Student login required.' });
    return;
  }
  const verified = verifyToken(token);
  if (!verified || verified.kind !== 'student') {
    res.status(401).json({ error: 'Student account required.' });
    return;
  }
  req.session = verified;
  next();
}

export function requireAdmin(allowedRoles?: AdminRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Admin authentication required.' });
      return;
    }
    const verified = verifyToken(token);
    if (!verified || verified.kind !== 'admin' || !verified.role) {
      res.status(401).json({ error: 'Invalid or expired admin session.' });
      return;
    }
    const db = getDb();
    // Env passcode super admin or stored active admin
    if (verified.sub !== 'env-super-admin') {
      const adminRecord = db.admins.find((a) => a.id === verified.sub && a.active);
      if (!adminRecord) {
        res.status(403).json({ error: 'Admin account is disabled or no longer exists.' });
        return;
      }
      verified.role = adminRecord.role;
    }

    if (allowedRoles && !allowedRoles.includes(verified.role)) {
      res.status(403).json({ error: `Role ${verified.role} does not have permission for this action.` });
      return;
    }

    req.session = verified;
    next();
  };
}

export function isAdminBootstrapRequired(): boolean {
  const envPass = process.env.ADMIN_PASSCODE?.trim();
  if (envPass) return false;
  const db = getDb();
  return !db.admins.some((a) => a.role === 'SUPER_ADMIN' && a.active);
}

export function claimInitialSuperAdmin(params: {
  name: string;
  email: string;
  password: string;
}) {
  const db = getDb();
  if (!isAdminBootstrapRequired()) {
    throw new Error('Super Admin bootstrap is already completed or configured via ADMIN_PASSCODE.');
  }
  const cleanEmail = params.email.trim().toLowerCase();
  const admin = {
    id: newId('adm'),
    name: params.name.trim(),
    email: cleanEmail,
    role: 'SUPER_ADMIN' as const,
    active: true,
    passwordHash: hashPassword(params.password),
    createdAt: new Date().toISOString(),
  };
  db.admins.push(admin);
  saveDbImmediate();
  return admin;
}
