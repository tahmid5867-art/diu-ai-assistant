import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  attachOptionalSession,
  claimInitialSuperAdmin,
  hashPassword,
  isAdminBootstrapRequired,
  requireAdmin,
  requireStudent,
  requireStudentOrGuest,
  signToken,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  addAuditLog,
  addNotification,
  detectLanguageServer,
  getDb,
  newId,
  sanitizePublicAdmin,
  sanitizePublicStudent,
  saveDbImmediate,
  scheduleSaveDb,
} from './server/db.ts';
import {
  ensureInitialKnowledgeIndexed,
  extractPdfContent,
  generateGroundedChatResponse,
  indexKnowledgeDocument,
  reindexAllDocuments,
} from './server/rag.ts';
import type {
  AdminRole,
  ChatMessage,
  Conversation,
  Department,
  FaqItem,
  FeeStructure,
  KnowledgeCategory,
  KnowledgeDocument,
  Language,
  Program,
  Scholarship,
} from './src/types.ts';

const PORT = Number(process.env.PORT ?? 3000);

function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function cleanStr(val: unknown, maxLen = 500): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

function cleanOptionalNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'));
    }
  },
});

async function startServer() {
  await ensureInitialKnowledgeIndexed();
  const app = express();

  app.use(express.json({ limit: '4mb' }));

  // =========================================================================
  // PUBLIC CONFIG & UNIVERSITY DATA (READ-ONLY FOR STUDENT TOOLS)
  // =========================================================================
  app.get('/api/public/data', (_req, res) => {
    const db = getDb();
    res.json({
      settings: db.settings,
      departments: db.departments,
      programs: db.programs,
      feeStructures: db.feeStructures,
      scholarships: db.scholarships.filter((s) => s.isActive),
      faqs: db.faqs.filter((f) => f.isPublished),
    });
  });

  // =========================================================================
  // STUDENT & GUEST AUTHENTICATION
  // =========================================================================
  app.post('/api/auth/guest', (_req, res) => {
    const guestId = newId('gst');
    const token = signToken({ sub: guestId, kind: 'guest' }, 60 * 60 * 24);
    res.json({
      token,
      user: {
        id: guestId,
        type: 'guest' as const,
        name: 'Guest Student',
      },
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const name = cleanStr(req.body?.name, 100);
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const phone = cleanStr(req.body?.phone, 40);
    const preferredLanguage: Language = req.body?.preferredLanguage === 'bn' ? 'bn' : 'en';

    if (name.length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
      return;
    }

    const db = getDb();
    if (db.students.some((s) => s.email === email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const student = {
      id: newId('stu'),
      name,
      email,
      phone: phone || undefined,
      preferredLanguage,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.students.push(student);
    saveDbImmediate();

    const token = signToken({ sub: student.id, kind: 'student', email: student.email });
    res.status(201).json({
      token,
      student: sanitizePublicStudent(student),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const db = getDb();
    const student = db.students.find((s) => s.email === email);
    if (!student || !verifyPassword(password, student.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    const token = signToken({ sub: student.id, kind: 'student', email: student.email });
    res.json({
      token,
      student: sanitizePublicStudent(student),
    });
  });

  app.get('/api/auth/me', requireStudent, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const student = db.students.find((s) => s.id === req.session?.sub);
    if (!student) {
      res.status(404).json({ error: 'Student account not found.' });
      return;
    }
    res.json({ student: sanitizePublicStudent(student) });
  });

  app.patch('/api/auth/profile', requireStudent, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const student = db.students.find((s) => s.id === req.session?.sub);
    if (!student) {
      res.status(404).json({ error: 'Student account not found.' });
      return;
    }
    if (typeof req.body?.name === 'string' && req.body.name.trim().length >= 2) {
      student.name = cleanStr(req.body.name, 100);
    }
    if (typeof req.body?.phone === 'string') {
      student.phone = cleanStr(req.body.phone, 40) || undefined;
    }
    if (req.body?.preferredLanguage === 'bn' || req.body?.preferredLanguage === 'en') {
      student.preferredLanguage = req.body.preferredLanguage;
    }
    if (typeof req.body?.interestedProgram === 'string') {
      student.interestedProgram = cleanStr(req.body.interestedProgram, 160) || undefined;
    }
    if (typeof req.body?.newPassword === 'string' && req.body.newPassword.length > 0) {
      const currentPw = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      if (!verifyPassword(currentPw, student.passwordHash)) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
      }
      if (req.body.newPassword.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters.' });
        return;
      }
      student.passwordHash = hashPassword(req.body.newPassword);
    }
    saveDbImmediate();
    res.json({ student: sanitizePublicStudent(student) });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    res.json({
      emailConfigured: false,
      message:
        'Password reset emails require an outbound SMTP/email service configuration. Signed-in students can update their password in Student Profile, or contact admission@daffodilvarsity.edu.bd for account assistance.',
    });
  });

  // =========================================================================
  // CONVERSATIONS & RAG CHAT
  // =========================================================================
  app.get('/api/conversations', requireStudentOrGuest, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const q = cleanStr(req.query.q, 120).toLowerCase();
    let list = db.conversations
      .filter((c) => c.ownerId === req.session!.sub)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    if (q) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.lastMessagePreview.toLowerCase().includes(q)
      );
    }
    res.json({ conversations: list });
  });

  app.post('/api/conversations', requireStudentOrGuest, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const language: Language = req.body?.language === 'bn' ? 'bn' : 'en';
    const student =
      req.session!.kind === 'student'
        ? db.students.find((s) => s.id === req.session!.sub)
        : undefined;

    const conv: Conversation = {
      id: newId('conv'),
      ownerId: req.session!.sub,
      ownerType: req.session!.kind === 'student' ? 'student' : 'guest',
      ownerLabel: student ? `${student.name} (${student.email})` : `Guest (${req.session!.sub})`,
      title: language === 'bn' ? 'নতুন ভর্তি আলোচনা' : 'New Admission Chat',
      language,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      lastMessagePreview: '',
    };
    db.conversations.unshift(conv);
    saveDbImmediate();
    res.status(201).json({ conversation: conv });
  });

  app.get('/api/conversations/:id/messages', requireStudentOrGuest, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const conv = db.conversations.find((c) => c.id === req.params.id);
    if (!conv || conv.ownerId !== req.session!.sub) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const messages = db.messages
      .filter((m) => m.conversationId === conv.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    res.json({ conversation: conv, messages });
  });

  app.delete('/api/conversations/:id', requireStudentOrGuest, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const conv = db.conversations.find((c) => c.id === req.params.id);
    if (!conv || conv.ownerId !== req.session!.sub) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    db.conversations = db.conversations.filter((c) => c.id !== conv.id);
    db.messages = db.messages.filter((m) => m.conversationId !== conv.id);
    saveDbImmediate();
    res.json({ ok: true });
  });

  app.delete('/api/conversations', requireStudentOrGuest, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ownedIds = new Set(
      db.conversations.filter((c) => c.ownerId === req.session!.sub).map((c) => c.id)
    );
    db.conversations = db.conversations.filter((c) => c.ownerId !== req.session!.sub);
    db.messages = db.messages.filter((m) => !ownedIds.has(m.conversationId));
    saveDbImmediate();
    res.json({ ok: true });
  });

  app.post('/api/chat/message', requireStudentOrGuest, async (req: AuthenticatedRequest, res) => {
    const messageText = cleanStr(req.body?.message, 2000);
    const requestedConvId = cleanStr(req.body?.conversationId, 100);
    const preferredLang: Language | undefined =
      req.body?.language === 'bn' ? 'bn' : req.body?.language === 'en' ? 'en' : undefined;

    if (!messageText) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const db = getDb();
    let conv = requestedConvId
      ? db.conversations.find((c) => c.id === requestedConvId)
      : undefined;

    if (conv && conv.ownerId !== req.session!.sub) {
      res.status(403).json({ error: 'Access denied to this conversation.' });
      return;
    }

    const detectedLang = detectLanguageServer(messageText);
    const activeLang: Language =
      /[\u0980-\u09FF]/.test(messageText) ? 'bn' : preferredLang ?? detectedLang;

    const isNewConv = !conv;
    if (!conv) {
      const student =
        req.session!.kind === 'student'
          ? db.students.find((s) => s.id === req.session!.sub)
          : undefined;
      conv = {
        id: newId('conv'),
        ownerId: req.session!.sub,
        ownerType: req.session!.kind === 'student' ? 'student' : 'guest',
        ownerLabel: student ? `${student.name} (${student.email})` : `Guest (${req.session!.sub})`,
        title: messageText.slice(0, 52),
        language: activeLang,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
        lastMessagePreview: '',
      };
    }

    const userMsg: ChatMessage = {
      id: newId('msg'),
      conversationId: conv.id,
      role: 'user',
      content: messageText,
      language: activeLang,
      createdAt: new Date().toISOString(),
    };

    const history = isNewConv
      ? []
      : db.messages
          .filter((m) => m.conversationId === conv!.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    try {
      const result = await generateGroundedChatResponse({
        query: messageText,
        language: activeLang,
        history,
        conversationId: conv.id,
      });

      const assistantMsg: ChatMessage = {
        id: newId('msg'),
        conversationId: conv.id,
        role: 'assistant',
        content: result.answer,
        language: activeLang,
        createdAt: new Date().toISOString(),
        sources: result.sources,
        isFallback: result.isFallback,
      };

      if (isNewConv) {
        db.conversations.unshift(conv);
      } else if (conv.messageCount === 0) {
        conv.title = messageText.slice(0, 52);
      }
      db.messages.push(userMsg, assistantMsg);
      conv.messageCount += 2;
      conv.language = activeLang;
      conv.updatedAt = assistantMsg.createdAt;
      conv.lastMessagePreview = result.answer.slice(0, 100);
      saveDbImmediate();

      res.json({
        conversation: conv,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unable to generate AI response.';
      res.status(502).json({
        error: errMsg,
      });
    }
  });

  app.post('/api/chat/feedback', requireStudentOrGuest, (req: AuthenticatedRequest, res) => {
    const messageId = cleanStr(req.body?.messageId, 100);
    const helpful = Boolean(req.body?.helpful);
    const ratingRaw = req.body?.rating;
    const rating =
      typeof ratingRaw === 'number' && ratingRaw >= 1 && ratingRaw <= 5 ? Math.round(ratingRaw) : undefined;
    const comment = cleanStr(req.body?.comment, 500);

    const db = getDb();
    const msg = db.messages.find((m) => m.id === messageId && m.role === 'assistant');
    if (!msg) {
      res.status(404).json({ error: 'Assistant message not found.' });
      return;
    }
    const conv = db.conversations.find((c) => c.id === msg.conversationId);
    if (!conv || conv.ownerId !== req.session!.sub) {
      res.status(403).json({ error: 'Cannot submit feedback for another user conversation.' });
      return;
    }

    msg.feedback = {
      helpful,
      rating,
      comment: comment || undefined,
      submittedAt: new Date().toISOString(),
    };

    if (!helpful || (rating !== undefined && rating <= 2)) {
      addNotification({
        type: 'feedback',
        title: 'Negative Student Feedback Received',
        message: comment ? `"${comment.slice(0, 120)}"` : 'A student marked a response as Not Helpful.',
      });
    }

    saveDbImmediate();
    res.json({ message: msg });
  });

  // =========================================================================
  // ADMIN AUTHENTICATION & FIRST-RUN BOOTSTRAP
  // =========================================================================
  app.get('/api/admin/auth/status', attachOptionalSession, (req: AuthenticatedRequest, res) => {
    const bootstrapRequired = isAdminBootstrapRequired();
    let admin = null;
    if (req.session?.kind === 'admin') {
      const db = getDb();
      if (req.session.sub === 'env-super-admin') {
        admin = {
          id: 'env-super-admin',
          name: 'System Super Admin',
          email: req.session.email ?? 'admin@daffodilvarsity.edu.bd',
          role: 'SUPER_ADMIN' as const,
          active: true,
          createdAt: new Date().toISOString(),
        };
      } else {
        const found = db.admins.find((a) => a.id === req.session!.sub && a.active);
        if (found) admin = sanitizePublicAdmin(found);
      }
    }
    res.json({ bootstrapRequired, admin });
  });

  app.post('/api/admin/bootstrap', (req, res) => {
    if (!isAdminBootstrapRequired()) {
      res.status(409).json({ error: 'Super Admin is already initialized.' });
      return;
    }
    const name = cleanStr(req.body?.name, 100);
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      res.status(400).json({
        error: 'Provide valid name, email, and a password of at least 8 characters.',
      });
      return;
    }

    const admin = claimInitialSuperAdmin({ name, email, password });
    addAuditLog({
      adminId: admin.id,
      adminEmail: admin.email,
      role: admin.role,
      action: 'BOOTSTRAP_SUPER_ADMIN',
      targetType: 'admin',
      targetId: admin.id,
      details: 'Claimed initial Super Admin account.',
    });
    const token = signToken({
      sub: admin.id,
      kind: 'admin',
      email: admin.email,
      role: admin.role,
    });
    res.status(201).json({ token, admin: sanitizePublicAdmin(admin) });
  });

  app.post('/api/admin/login', (req, res) => {
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const envPass = process.env.ADMIN_PASSCODE?.trim();
    if (envPass && password === envPass) {
      const token = signToken({
        sub: 'env-super-admin',
        kind: 'admin',
        email,
        role: 'SUPER_ADMIN',
      });
      res.json({
        token,
        admin: {
          id: 'env-super-admin',
          name: 'System Super Admin',
          email,
          role: 'SUPER_ADMIN' as const,
          active: true,
          createdAt: new Date().toISOString(),
        },
      });
      return;
    }

    const db = getDb();
    const admin = db.admins.find((a) => a.email === email && a.active);
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      res.status(401).json({ error: 'Invalid admin credentials.' });
      return;
    }

    const token = signToken({
      sub: admin.id,
      kind: 'admin',
      email: admin.email,
      role: admin.role,
    });
    res.json({ token, admin: sanitizePublicAdmin(admin) });
  });

  // =========================================================================
  // ADMIN OVERVIEW & ANALYTICS
  // =========================================================================
  app.get('/api/admin/overview', requireAdmin(), (_req, res) => {
    const db = getDb();
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const todayConversations = db.conversations.filter((c) =>
      c.createdAt.startsWith(todayPrefix)
    ).length;

    const assistantMsgs = db.messages.filter((m) => m.role === 'assistant');
    const ratedMsgs = assistantMsgs.filter((m) => m.feedback !== undefined);
    const helpfulCount = ratedMsgs.filter((m) => m.feedback?.helpful).length;
    const satisfactionPct =
      ratedMsgs.length > 0 ? Math.round((helpfulCount / ratedMsgs.length) * 100) : null;

    // Aggregate popular questions
    const questionFreq = new Map<string, number>();
    for (const m of db.messages) {
      if (m.role === 'user') {
        const key = m.content.trim().slice(0, 80);
        questionFreq.set(key, (questionFreq.get(key) ?? 0) + 1);
      }
    }
    const popularQuestions = Array.from(questionFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([question, count]) => ({ question, count }));

    // Aggregate popular departments mentioned in messages
    const deptCounts = db.departments.map((d) => {
      const codeLower = d.code.toLowerCase();
      const nameLower = d.name.toLowerCase();
      const count = db.messages.filter(
        (m) =>
          m.role === 'user' &&
          (m.content.toLowerCase().includes(codeLower) ||
            m.content.toLowerCase().includes(nameLower))
      ).length;
      return { code: d.code, name: d.name, count };
    });

    // Daily conversation counts (last 7 days)
    const dailySeries: { date: string; total: number; en: number; bn: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const dayConvs = db.conversations.filter((c) => c.createdAt.startsWith(dt));
      dailySeries.push({
        date: dt,
        total: dayConvs.length,
        en: dayConvs.filter((c) => c.language === 'en').length,
        bn: dayConvs.filter((c) => c.language === 'bn').length,
      });
    }

    const bnMsgs = db.messages.filter((m) => m.role === 'user' && m.language === 'bn').length;
    const enMsgs = db.messages.filter((m) => m.role === 'user' && m.language === 'en').length;

    res.json({
      stats: {
        totalConversations: db.conversations.length,
        todayConversations,
        registeredStudents: db.students.length,
        openUnansweredQuestions: db.unansweredQuestions.filter((u) => u.status === 'open').length,
        knowledgeDocuments: db.knowledgeDocuments.length,
        indexedChunks: db.knowledgeChunks.length,
        satisfactionPct,
        ratedCount: ratedMsgs.length,
        unansweredRatePct:
          db.messages.filter((m) => m.role === 'user').length > 0
            ? Math.round(
                (db.unansweredQuestions.length /
                  db.messages.filter((m) => m.role === 'user').length) *
                  100
              )
            : 0,
        languageSplit: { en: enMsgs, bn: bnMsgs },
        apiMetrics: db.apiMetrics,
        geminiConfigured: Boolean(
          process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
        ),
      },
      popularQuestions,
      popularDepartments: deptCounts.sort((a, b) => b.count - a.count),
      dailySeries,
      recentConversations: db.conversations.slice(0, 8),
      recentKnowledgeUpdates: [...db.knowledgeDocuments]
        .sort((a, b) => b.updatedDate.localeCompare(a.updatedDate))
        .slice(0, 6),
      notifications: db.notifications.slice(0, 25),
    });
  });

  app.post('/api/admin/notifications/read-all', requireAdmin(), (_req, res) => {
    const db = getDb();
    for (const n of db.notifications) n.isRead = true;
    saveDbImmediate();
    res.json({ ok: true });
  });

  // =========================================================================
  // ADMIN KNOWLEDGE BASE & PDF UPLOAD / RE-INDEX
  // =========================================================================
  app.get(
    '/api/admin/knowledge',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (_req, res) => {
      const db = getDb();
      res.json({ documents: db.knowledgeDocuments });
    }
  );

  app.post(
    '/api/admin/knowledge',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const title = cleanStr(req.body?.title, 200);
      const category = cleanStr(req.body?.category, 80) as KnowledgeCategory;
      const content = cleanStr(req.body?.content, 60000);
      const effectiveSemester = cleanStr(req.body?.effectiveSemester, 80) || 'Spring 2026';
      const sourceUrl = isValidHttpUrl(req.body?.sourceUrl) ? req.body.sourceUrl.trim() : undefined;
      const verificationStatus =
        req.body?.verificationStatus === 'verified' ? 'verified' : 'pending_verification';
      const status = req.body?.status === 'expired' ? 'expired' : 'active';

      if (!title || content.length < 10) {
        res.status(400).json({ error: 'Title and content (min 10 chars) are required.' });
        return;
      }

      const now = new Date().toISOString();
      const doc: KnowledgeDocument = {
        id: newId('kb'),
        title,
        category: category || 'Other Information',
        sourceUrl,
        uploadDate: now,
        updatedDate: now,
        effectiveSemester,
        verificationStatus,
        status,
        processingStatus: 'processing',
        sourceType: req.body?.sourceType === 'url' ? 'url' : 'manual',
        content,
        chunkCount: 0,
      };

      const db = getDb();
      db.knowledgeDocuments.unshift(doc);
      await indexKnowledgeDocument(doc);
      saveDbImmediate();

      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'CREATE_KNOWLEDGE_DOC',
        targetType: 'knowledgeDocument',
        targetId: doc.id,
        details: `Added "${doc.title}" (${doc.chunkCount} chunks)`,
      });

      res.status(201).json({ document: doc });
    }
  );

  app.post(
    '/api/admin/knowledge/upload-pdf',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    upload.array('files', 10),
    async (req: AuthenticatedRequest, res) => {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'Please attach at least one PDF file.' });
        return;
      }

      const category = (cleanStr(req.body?.category, 80) || 'Admission Circulars') as KnowledgeCategory;
      const effectiveSemester = cleanStr(req.body?.effectiveSemester, 80) || 'Spring 2026';
      const sourceUrl = isValidHttpUrl(req.body?.sourceUrl) ? req.body.sourceUrl.trim() : undefined;
      const verificationStatus =
        req.body?.verificationStatus === 'verified' ? 'verified' : 'pending_verification';

      const db = getDb();
      const createdDocs: KnowledgeDocument[] = [];

      for (const file of files) {
        const now = new Date().toISOString();
        const titleFromFile = file.originalname.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
        const customTitle = files.length === 1 ? cleanStr(req.body?.title, 200) : '';
        const doc: KnowledgeDocument = {
          id: newId('kb'),
          title: customTitle || titleFromFile || 'Uploaded DIU Document',
          category,
          sourceUrl,
          uploadDate: now,
          updatedDate: now,
          effectiveSemester,
          verificationStatus,
          status: 'active',
          processingStatus: 'processing',
          fileName: file.originalname,
          sourceType: 'pdf',
          content: '',
          chunkCount: 0,
        };

        try {
          const { text, usedOcr } = await extractPdfContent(file.buffer);
          if (!text || text.trim().length < 15) {
            doc.processingStatus = 'failed';
            doc.processingError =
              'Could not extract readable text from this PDF (may be encrypted or low-resolution scan).';
            addNotification({
              type: 'pdf_failure',
              title: `PDF Processing Failed: ${file.originalname}`,
              message: doc.processingError,
            });
          } else {
            doc.content = text;
            db.knowledgeDocuments.unshift(doc);
            await indexKnowledgeDocument(doc);
            addAuditLog({
              adminId: req.session!.sub,
              adminEmail: req.session!.email ?? 'admin',
              role: req.session!.role!,
              action: 'UPLOAD_PDF_KNOWLEDGE',
              targetType: 'knowledgeDocument',
              targetId: doc.id,
              details: `Processed ${file.originalname} (${doc.chunkCount} chunks${usedOcr ? ', Gemini OCR' : ''})`,
            });
            createdDocs.push(doc);
            continue;
          }
        } catch (err) {
          doc.processingStatus = 'failed';
          doc.processingError = err instanceof Error ? err.message : 'PDF extraction error';
          addNotification({
            type: 'pdf_failure',
            title: `PDF Processing Failed: ${file.originalname}`,
            message: doc.processingError,
          });
        }
        db.knowledgeDocuments.unshift(doc);
        createdDocs.push(doc);
      }

      saveDbImmediate();
      res.status(201).json({ documents: createdDocs });
    }
  );

  app.patch(
    '/api/admin/knowledge/:id',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const doc = db.knowledgeDocuments.find((d) => d.id === req.params.id);
      if (!doc) {
        res.status(404).json({ error: 'Knowledge document not found.' });
        return;
      }

      if (typeof req.body?.title === 'string' && req.body.title.trim()) {
        doc.title = cleanStr(req.body.title, 200);
      }
      if (typeof req.body?.category === 'string' && req.body.category.trim()) {
        doc.category = cleanStr(req.body.category, 80) as KnowledgeCategory;
      }
      if (typeof req.body?.effectiveSemester === 'string') {
        doc.effectiveSemester = cleanStr(req.body.effectiveSemester, 80) || doc.effectiveSemester;
      }
      if (req.body?.sourceUrl !== undefined) {
        doc.sourceUrl = isValidHttpUrl(req.body.sourceUrl) ? req.body.sourceUrl.trim() : undefined;
      }
      if (req.body?.verificationStatus === 'verified' || req.body?.verificationStatus === 'pending_verification') {
        doc.verificationStatus = req.body.verificationStatus;
      }
      if (req.body?.status === 'active' || req.body?.status === 'expired') {
        doc.status = req.body.status;
      }
      if (typeof req.body?.content === 'string' && req.body.content.trim().length >= 10) {
        doc.content = cleanStr(req.body.content, 60000);
      }
      doc.updatedDate = new Date().toISOString();

      await indexKnowledgeDocument(doc);
      saveDbImmediate();

      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'UPDATE_KNOWLEDGE_DOC',
        targetType: 'knowledgeDocument',
        targetId: doc.id,
        details: `Updated "${doc.title}" (status: ${doc.status}, ${doc.verificationStatus})`,
      });

      res.json({ document: doc });
    }
  );

  app.post(
    '/api/admin/knowledge/:id/reindex',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const doc = db.knowledgeDocuments.find((d) => d.id === req.params.id);
      if (!doc) {
        res.status(404).json({ error: 'Knowledge document not found.' });
        return;
      }
      await indexKnowledgeDocument(doc);
      saveDbImmediate();
      res.json({ document: doc });
    }
  );

  app.post(
    '/api/admin/knowledge/reindex-all',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const result = await reindexAllDocuments();
      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'REINDEX_ALL_KNOWLEDGE',
        targetType: 'knowledgeBase',
        targetId: 'all',
        details: `Re-indexed ${result.docs} documents (${result.chunks} chunks).`,
      });
      res.json(result);
    }
  );

  app.delete(
    '/api/admin/knowledge/:id',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const doc = db.knowledgeDocuments.find((d) => d.id === req.params.id);
      if (!doc) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      db.knowledgeDocuments = db.knowledgeDocuments.filter((d) => d.id !== doc.id);
      db.knowledgeChunks = db.knowledgeChunks.filter((c) => c.docId !== doc.id);
      saveDbImmediate();

      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'DELETE_KNOWLEDGE_DOC',
        targetType: 'knowledgeDocument',
        targetId: doc.id,
        details: `Deleted "${doc.title}"`,
      });
      res.json({ ok: true });
    }
  );

  // =========================================================================
  // ADMIN DEPARTMENTS, PROGRAMS & FEE STRUCTURES
  // =========================================================================
  app.get(
    '/api/admin/academics',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (_req, res) => {
      const db = getDb();
      res.json({
        departments: db.departments,
        programs: db.programs,
        feeStructures: db.feeStructures,
      });
    }
  );

  app.post(
    '/api/admin/departments',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const code = cleanStr(req.body?.code, 20).toUpperCase();
      const name = cleanStr(req.body?.name, 160);
      const faculty = cleanStr(req.body?.faculty, 160);
      const description = cleanStr(req.body?.description, 2000);
      if (!code || !name || !faculty) {
        res.status(400).json({ error: 'Department code, name, and faculty are required.' });
        return;
      }
      const dept: Department = {
        id: newId('dept'),
        code,
        name,
        faculty,
        description,
        careerOpportunities: Array.isArray(req.body?.careerOpportunities)
          ? req.body.careerOpportunities.map((x: unknown) => cleanStr(x, 120)).filter(Boolean)
          : [],
        internshipInfo: cleanStr(req.body?.internshipInfo, 600),
        sourceUrl: isValidHttpUrl(req.body?.sourceUrl) ? req.body.sourceUrl.trim() : undefined,
        verificationStatus:
          req.body?.verificationStatus === 'verified' ? 'verified' : 'pending_verification',
        updatedAt: new Date().toISOString(),
      };
      const db = getDb();
      db.departments.push(dept);
      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'CREATE_DEPARTMENT',
        targetType: 'department',
        targetId: dept.id,
        details: `Created ${dept.code} - ${dept.name}`,
      });
      res.status(201).json({ department: dept });
    }
  );

  app.patch(
    '/api/admin/departments/:id',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const dept = db.departments.find((d) => d.id === req.params.id);
      if (!dept) {
        res.status(404).json({ error: 'Department not found.' });
        return;
      }
      if (typeof req.body?.name === 'string' && req.body.name.trim()) dept.name = cleanStr(req.body.name, 160);
      if (typeof req.body?.code === 'string' && req.body.code.trim()) dept.code = cleanStr(req.body.code, 20).toUpperCase();
      if (typeof req.body?.faculty === 'string' && req.body.faculty.trim()) dept.faculty = cleanStr(req.body.faculty, 160);
      if (typeof req.body?.description === 'string') dept.description = cleanStr(req.body.description, 2000);
      if (typeof req.body?.internshipInfo === 'string') dept.internshipInfo = cleanStr(req.body.internshipInfo, 600);
      if (Array.isArray(req.body?.careerOpportunities)) {
        dept.careerOpportunities = req.body.careerOpportunities
          .map((x: unknown) => cleanStr(x, 120))
          .filter(Boolean);
      }
      if (req.body?.verificationStatus === 'verified' || req.body?.verificationStatus === 'pending_verification') {
        dept.verificationStatus = req.body.verificationStatus;
      }
      dept.updatedAt = new Date().toISOString();
      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'UPDATE_DEPARTMENT',
        targetType: 'department',
        targetId: dept.id,
        details: `Updated ${dept.code}`,
      });
      res.json({ department: dept });
    }
  );

  app.post(
    '/api/admin/programs',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const departmentId = cleanStr(req.body?.departmentId, 80);
      const name = cleanStr(req.body?.name, 180);
      if (!db.departments.some((d) => d.id === departmentId) || !name) {
        res.status(400).json({ error: 'Valid department and program name required.' });
        return;
      }
      const prog: Program = {
        id: newId('prog'),
        departmentId,
        name,
        degreeType: cleanStr(req.body?.degreeType, 40) || 'B.Sc.',
        level: req.body?.level === 'postgraduate' ? 'postgraduate' : 'undergraduate',
        durationYears: Number(req.body?.durationYears) || 4,
        totalSemesters: Number(req.body?.totalSemesters) || 8,
        totalCredits: Number(req.body?.totalCredits) || 140,
        curriculumSummary: cleanStr(req.body?.curriculumSummary, 1500),
        coreCourses: Array.isArray(req.body?.coreCourses)
          ? req.body.coreCourses.map((c: unknown) => cleanStr(c, 120)).filter(Boolean)
          : [],
        minSscGpa: cleanOptionalNum(req.body?.minSscGpa),
        minHscGpa: cleanOptionalNum(req.body?.minHscGpa),
        minCombinedGpa: cleanOptionalNum(req.body?.minCombinedGpa),
        minBachelorCgpa: cleanOptionalNum(req.body?.minBachelorCgpa),
        allowedGroups: Array.isArray(req.body?.allowedGroups) && req.body.allowedGroups.length > 0
          ? req.body.allowedGroups
          : ['Any'],
        specialRequirements: cleanStr(req.body?.specialRequirements, 600),
        effectiveSemester: cleanStr(req.body?.effectiveSemester, 80) || 'Spring 2026',
        verificationStatus:
          req.body?.verificationStatus === 'verified' ? 'verified' : 'pending_verification',
        updatedAt: new Date().toISOString(),
      };
      db.programs.push(prog);
      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'CREATE_PROGRAM',
        targetType: 'program',
        targetId: prog.id,
        details: `Created program "${prog.name}"`,
      });
      res.status(201).json({ program: prog });
    }
  );

  app.patch(
    '/api/admin/programs/:id',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const prog = db.programs.find((p) => p.id === req.params.id);
      if (!prog) {
        res.status(404).json({ error: 'Program not found.' });
        return;
      }
      if (typeof req.body?.name === 'string' && req.body.name.trim()) prog.name = cleanStr(req.body.name, 180);
      if (typeof req.body?.degreeType === 'string') prog.degreeType = cleanStr(req.body.degreeType, 40) || prog.degreeType;
      if (req.body?.level === 'undergraduate' || req.body?.level === 'postgraduate') prog.level = req.body.level;
      if (Number.isFinite(Number(req.body?.durationYears))) prog.durationYears = Number(req.body.durationYears);
      if (Number.isFinite(Number(req.body?.totalSemesters))) prog.totalSemesters = Number(req.body.totalSemesters);
      if (Number.isFinite(Number(req.body?.totalCredits))) prog.totalCredits = Number(req.body.totalCredits);
      if (typeof req.body?.curriculumSummary === 'string') prog.curriculumSummary = cleanStr(req.body.curriculumSummary, 1500);
      if (Array.isArray(req.body?.coreCourses)) {
        prog.coreCourses = req.body.coreCourses.map((c: unknown) => cleanStr(c, 120)).filter(Boolean);
      }
      if (req.body?.minSscGpa !== undefined) prog.minSscGpa = cleanOptionalNum(req.body.minSscGpa);
      if (req.body?.minHscGpa !== undefined) prog.minHscGpa = cleanOptionalNum(req.body.minHscGpa);
      if (req.body?.minCombinedGpa !== undefined) prog.minCombinedGpa = cleanOptionalNum(req.body.minCombinedGpa);
      if (req.body?.minBachelorCgpa !== undefined) prog.minBachelorCgpa = cleanOptionalNum(req.body.minBachelorCgpa);
      if (typeof req.body?.specialRequirements === 'string') prog.specialRequirements = cleanStr(req.body.specialRequirements, 600);
      if (typeof req.body?.effectiveSemester === 'string') prog.effectiveSemester = cleanStr(req.body.effectiveSemester, 80);
      if (req.body?.verificationStatus === 'verified' || req.body?.verificationStatus === 'pending_verification') {
        prog.verificationStatus = req.body.verificationStatus;
      }
      prog.updatedAt = new Date().toISOString();
      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'UPDATE_PROGRAM',
        targetType: 'program',
        targetId: prog.id,
        details: `Updated "${prog.name}" (${prog.totalCredits} credits)`,
      });
      res.json({ program: prog });
    }
  );

  app.post(
    '/api/admin/fees',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const programId = cleanStr(req.body?.programId, 80);
      if (!db.programs.some((p) => p.id === programId)) {
        res.status(400).json({ error: 'Valid program required.' });
        return;
      }
      const isCurrent = req.body?.isCurrent !== false;
      if (isCurrent) {
        for (const existing of db.feeStructures) {
          if (existing.programId === programId) {
            existing.isCurrent = false;
          }
        }
      }
      const fee: FeeStructure = {
        id: newId('fee'),
        programId,
        effectiveSemester: cleanStr(req.body?.effectiveSemester, 80) || 'Spring 2026',
        admissionFee: cleanOptionalNum(req.body?.admissionFee),
        perCreditFee: cleanOptionalNum(req.body?.perCreditFee),
        semesterFee: cleanOptionalNum(req.body?.semesterFee),
        labAndOtherFee: cleanOptionalNum(req.body?.labAndOtherFee),
        isCurrent,
        verificationStatus:
          req.body?.verificationStatus === 'verified' ? 'verified' : 'pending_verification',
        notes: cleanStr(req.body?.notes, 500) || undefined,
        createdAt: new Date().toISOString(),
      };
      db.feeStructures.unshift(fee);
      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'CREATE_FEE_RECORD',
        targetType: 'feeStructure',
        targetId: fee.id,
        details: `Saved fee schedule for ${programId} (${fee.effectiveSemester})`,
      });
      res.status(201).json({ feeStructure: fee });
    }
  );

  // =========================================================================
  // ADMIN SCHOLARSHIPS & FAQS
  // =========================================================================
  app.get(
    '/api/admin/scholarships',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (_req, res) => {
      res.json({ scholarships: getDb().scholarships });
    }
  );

  app.post(
    '/api/admin/scholarships',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const name = cleanStr(req.body?.name, 160);
      if (!name) {
        res.status(400).json({ error: 'Scholarship name is required.' });
        return;
      }
      const s: Scholarship = {
        id: newId('sch'),
        name,
        category: req.body?.category || 'Result-Based',
        minSscGpa: cleanOptionalNum(req.body?.minSscGpa),
        minHscGpa: cleanOptionalNum(req.body?.minHscGpa),
        minCombinedGpa: cleanOptionalNum(req.body?.minCombinedGpa),
        minSemesterGpa: cleanOptionalNum(req.body?.minSemesterGpa),
        waiverPercentage: cleanOptionalNum(req.body?.waiverPercentage),
        waiverLabel: cleanStr(req.body?.waiverLabel, 200) || 'Waiver subject to committee policy',
        conditions: cleanStr(req.body?.conditions, 800),
        renewalRequirements: cleanStr(req.body?.renewalRequirements, 600),
        applicationInstructions: cleanStr(req.body?.applicationInstructions, 600),
        deadline: cleanStr(req.body?.deadline, 120) || 'During admission period',
        isActive: req.body?.isActive !== false,
        verificationStatus:
          req.body?.verificationStatus === 'verified' ? 'verified' : 'pending_verification',
        sourceUrl: isValidHttpUrl(req.body?.sourceUrl) ? req.body.sourceUrl.trim() : undefined,
        updatedAt: new Date().toISOString(),
      };
      const db = getDb();
      db.scholarships.unshift(s);
      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'CREATE_SCHOLARSHIP',
        targetType: 'scholarship',
        targetId: s.id,
        details: `Created scholarship "${s.name}"`,
      });
      res.status(201).json({ scholarship: s });
    }
  );

  app.patch(
    '/api/admin/scholarships/:id',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const s = db.scholarships.find((item) => item.id === req.params.id);
      if (!s) {
        res.status(404).json({ error: 'Scholarship not found.' });
        return;
      }
      if (typeof req.body?.name === 'string' && req.body.name.trim()) s.name = cleanStr(req.body.name, 160);
      if (typeof req.body?.waiverLabel === 'string') s.waiverLabel = cleanStr(req.body.waiverLabel, 200);
      if (req.body?.waiverPercentage !== undefined) s.waiverPercentage = cleanOptionalNum(req.body.waiverPercentage);
      if (req.body?.minSscGpa !== undefined) s.minSscGpa = cleanOptionalNum(req.body.minSscGpa);
      if (req.body?.minHscGpa !== undefined) s.minHscGpa = cleanOptionalNum(req.body.minHscGpa);
      if (req.body?.minCombinedGpa !== undefined) s.minCombinedGpa = cleanOptionalNum(req.body.minCombinedGpa);
      if (req.body?.minSemesterGpa !== undefined) s.minSemesterGpa = cleanOptionalNum(req.body.minSemesterGpa);
      if (typeof req.body?.conditions === 'string') s.conditions = cleanStr(req.body.conditions, 800);
      if (typeof req.body?.renewalRequirements === 'string') s.renewalRequirements = cleanStr(req.body.renewalRequirements, 600);
      if (typeof req.body?.deadline === 'string') s.deadline = cleanStr(req.body.deadline, 120);
      if (typeof req.body?.isActive === 'boolean') s.isActive = req.body.isActive;
      if (req.body?.verificationStatus === 'verified' || req.body?.verificationStatus === 'pending_verification') {
        s.verificationStatus = req.body.verificationStatus;
      }
      s.updatedAt = new Date().toISOString();
      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'UPDATE_SCHOLARSHIP',
        targetType: 'scholarship',
        targetId: s.id,
        details: `Updated "${s.name}" (active: ${s.isActive})`,
      });
      res.json({ scholarship: s });
    }
  );

  app.get(
    '/api/admin/faqs',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (_req, res) => {
      res.json({ faqs: getDb().faqs });
    }
  );

  app.post(
    '/api/admin/faqs',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const questionEn = cleanStr(req.body?.questionEn, 400);
      const answerEn = cleanStr(req.body?.answerEn, 3000);
      if (!questionEn || !answerEn) {
        res.status(400).json({ error: 'English question and answer are required.' });
        return;
      }
      const faq: FaqItem = {
        id: newId('faq'),
        category: (cleanStr(req.body?.category, 80) || 'FAQs') as KnowledgeCategory,
        questionEn,
        questionBn: cleanStr(req.body?.questionBn, 400) || questionEn,
        answerEn,
        answerBn: cleanStr(req.body?.answerBn, 3000) || answerEn,
        sourceUrl: isValidHttpUrl(req.body?.sourceUrl) ? req.body.sourceUrl.trim() : undefined,
        isPublished: req.body?.isPublished !== false,
        verificationStatus:
          req.body?.verificationStatus === 'verified' ? 'verified' : 'pending_verification',
        updatedAt: new Date().toISOString(),
      };
      const db = getDb();
      db.faqs.unshift(faq);
      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'CREATE_FAQ',
        targetType: 'faq',
        targetId: faq.id,
        details: `Created FAQ "${faq.questionEn.slice(0, 60)}"`,
      });
      res.status(201).json({ faq });
    }
  );

  app.patch(
    '/api/admin/faqs/:id',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const faq = db.faqs.find((f) => f.id === req.params.id);
      if (!faq) {
        res.status(404).json({ error: 'FAQ not found.' });
        return;
      }
      if (typeof req.body?.questionEn === 'string') faq.questionEn = cleanStr(req.body.questionEn, 400);
      if (typeof req.body?.questionBn === 'string') faq.questionBn = cleanStr(req.body.questionBn, 400);
      if (typeof req.body?.answerEn === 'string') faq.answerEn = cleanStr(req.body.answerEn, 3000);
      if (typeof req.body?.answerBn === 'string') faq.answerBn = cleanStr(req.body.answerBn, 3000);
      if (typeof req.body?.isPublished === 'boolean') faq.isPublished = req.body.isPublished;
      if (req.body?.sourceUrl !== undefined) {
        faq.sourceUrl = isValidHttpUrl(req.body.sourceUrl) ? req.body.sourceUrl.trim() : undefined;
      }
      faq.updatedAt = new Date().toISOString();
      saveDbImmediate();
      res.json({ faq });
    }
  );

  app.delete(
    '/api/admin/faqs/:id',
    requireAdmin(['SUPER_ADMIN', 'CONTENT_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      db.faqs = db.faqs.filter((f) => f.id !== req.params.id);
      saveDbImmediate();
      res.json({ ok: true });
    }
  );

  // =========================================================================
  // ADMIN CHAT MONITORING, UNANSWERED QUESTIONS & ANALYTICS CSV
  // =========================================================================
  app.get(
    '/api/admin/chats',
    requireAdmin(['SUPER_ADMIN', 'SUPPORT_ADMIN']),
    (req, res) => {
      const db = getDb();
      const lang = cleanStr(req.query.language, 10);
      const q = cleanStr(req.query.q, 120).toLowerCase();
      let convs = [...db.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (lang === 'en' || lang === 'bn') {
        convs = convs.filter((c) => c.language === lang);
      }
      if (q) {
        convs = convs.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.ownerLabel.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q)
        );
      }
      const enriched = convs.slice(0, 100).map((c) => {
        const msgs = db.messages
          .filter((m) => m.conversationId === c.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return { conversation: c, messages: msgs };
      });
      res.json({ items: enriched });
    }
  );

  app.get(
    '/api/admin/unanswered',
    requireAdmin(['SUPER_ADMIN', 'SUPPORT_ADMIN']),
    (_req, res) => {
      res.json({ questions: getDb().unansweredQuestions });
    }
  );

  app.post(
    '/api/admin/unanswered/:id/resolve',
    requireAdmin(['SUPER_ADMIN', 'SUPPORT_ADMIN']),
    async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const item = db.unansweredQuestions.find((u) => u.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: 'Unanswered question record not found.' });
        return;
      }
      const answer = cleanStr(req.body?.answer, 4000);
      const sourceUrl = isValidHttpUrl(req.body?.sourceUrl) ? req.body.sourceUrl.trim() : undefined;
      const convertToFaq = Boolean(req.body?.convertToFaq);
      const addToKnowledge = Boolean(req.body?.addToKnowledge);

      if (!answer) {
        res.status(400).json({ error: 'Verified answer is required.' });
        return;
      }

      item.status = 'resolved';
      item.resolvedAnswer = answer;
      item.resolvedSourceUrl = sourceUrl;
      item.resolvedAt = new Date().toISOString();

      if (convertToFaq) {
        const faq: FaqItem = {
          id: newId('faq'),
          category: 'FAQs',
          questionEn: item.question,
          questionBn: item.question,
          answerEn: answer,
          answerBn: answer,
          sourceUrl,
          isPublished: true,
          verificationStatus: 'verified',
          updatedAt: new Date().toISOString(),
        };
        db.faqs.unshift(faq);
      }

      if (addToKnowledge) {
        const now = new Date().toISOString();
        const doc: KnowledgeDocument = {
          id: newId('kb'),
          title: `Verified Q&A: ${item.question.slice(0, 70)}`,
          category: 'FAQs',
          sourceUrl,
          uploadDate: now,
          updatedDate: now,
          effectiveSemester: 'Spring 2026',
          verificationStatus: 'verified',
          status: 'active',
          processingStatus: 'processing',
          sourceType: 'manual',
          content: `Question: ${item.question}\nVerified Answer: ${answer}`,
          chunkCount: 0,
        };
        db.knowledgeDocuments.unshift(doc);
        await indexKnowledgeDocument(doc);
      }

      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'RESOLVE_UNANSWERED',
        targetType: 'unansweredQuestion',
        targetId: item.id,
        details: `Resolved question (FAQ: ${convertToFaq}, KB: ${addToKnowledge})`,
      });
      res.json({ question: item });
    }
  );

  app.get(
    '/api/admin/analytics/export.csv',
    requireAdmin(['SUPER_ADMIN', 'SUPPORT_ADMIN']),
    (req, res) => {
      const db = getDb();
      const from = cleanStr(req.query.from, 20);
      const to = cleanStr(req.query.to, 20);
      const rows = db.conversations.filter((c) => {
        const day = c.createdAt.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      });
      const escapeCsv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const header = [
        'ConversationID',
        'Owner',
        'Type',
        'Language',
        'Messages',
        'Title',
        'CreatedAt',
      ].join(',');
      const body = rows.map((c) =>
        [
          escapeCsv(c.id),
          escapeCsv(c.ownerLabel),
          escapeCsv(c.ownerType),
          escapeCsv(c.language),
          c.messageCount,
          escapeCsv(c.title),
          escapeCsv(c.createdAt),
        ].join(',')
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="diu-assistant-analytics.csv"');
      res.send([header, ...body].join('\n'));
    }
  );

  // =========================================================================
  // ADMIN USERS, ROLES, AUDIT LOGS & SETTINGS (SUPER ADMIN)
  // =========================================================================
  app.get('/api/admin/users', requireAdmin(['SUPER_ADMIN']), (_req, res) => {
    const db = getDb();
    res.json({
      admins: db.admins.map(sanitizePublicAdmin),
      auditLogs: db.auditLogs.slice(0, 150),
    });
  });

  app.post('/api/admin/users', requireAdmin(['SUPER_ADMIN']), (req: AuthenticatedRequest, res) => {
    const name = cleanStr(req.body?.name, 100);
    const email = cleanStr(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role: AdminRole =
      req.body?.role === 'SUPER_ADMIN' ||
      req.body?.role === 'CONTENT_ADMIN' ||
      req.body?.role === 'SUPPORT_ADMIN'
        ? req.body.role
        : 'CONTENT_ADMIN';

    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      res.status(400).json({ error: 'Name, valid email, and password (8+ chars) required.' });
      return;
    }

    const db = getDb();
    if (db.admins.some((a) => a.email === email)) {
      res.status(409).json({ error: 'Admin email already exists.' });
      return;
    }

    const newAdmin = {
      id: newId('adm'),
      name,
      email,
      role,
      active: true,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.admins.push(newAdmin);
    saveDbImmediate();
    addAuditLog({
      adminId: req.session!.sub,
      adminEmail: req.session!.email ?? 'admin',
      role: req.session!.role!,
      action: 'CREATE_ADMIN_USER',
      targetType: 'admin',
      targetId: newAdmin.id,
      details: `Created ${role} account for ${newAdmin.email}`,
    });
    res.status(201).json({ admin: sanitizePublicAdmin(newAdmin) });
  });

  app.patch(
    '/api/admin/users/:id',
    requireAdmin(['SUPER_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const target = db.admins.find((a) => a.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Admin user not found.' });
        return;
      }
      if (
        req.body?.role === 'SUPER_ADMIN' ||
        req.body?.role === 'CONTENT_ADMIN' ||
        req.body?.role === 'SUPPORT_ADMIN'
      ) {
        target.role = req.body.role;
      }
      if (typeof req.body?.active === 'boolean') {
        target.active = req.body.active;
      }
      saveDbImmediate();
      addAuditLog({
        adminId: req.session!.sub,
        adminEmail: req.session!.email ?? 'admin',
        role: req.session!.role!,
        action: 'UPDATE_ADMIN_USER',
        targetType: 'admin',
        targetId: target.id,
        details: `Updated ${target.email} (role=${target.role}, active=${target.active})`,
      });
      res.json({ admin: sanitizePublicAdmin(target) });
    }
  );

  app.patch('/api/admin/settings', requireAdmin(['SUPER_ADMIN']), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const s = db.settings;
    if (typeof req.body?.admissionPhone === 'string') s.admissionPhone = cleanStr(req.body.admissionPhone, 40);
    if (typeof req.body?.admissionEmail === 'string') s.admissionEmail = cleanStr(req.body.admissionEmail, 120);
    if (typeof req.body?.address === 'string') s.address = cleanStr(req.body.address, 240);
    if (isValidHttpUrl(req.body?.websiteUrl)) s.websiteUrl = req.body.websiteUrl.trim();
    if (isValidHttpUrl(req.body?.officialPortalUrl)) s.officialPortalUrl = req.body.officialPortalUrl.trim();

    if (req.body?.widget && typeof req.body.widget === 'object') {
      const w = req.body.widget;
      if (typeof w.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(w.primaryColor)) {
        s.widget.primaryColor = w.primaryColor;
      }
      if (typeof w.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(w.accentColor)) {
        s.widget.accentColor = w.accentColor;
      }
      if (typeof w.welcomeMessageEn === 'string') s.widget.welcomeMessageEn = cleanStr(w.welcomeMessageEn, 400);
      if (typeof w.welcomeMessageBn === 'string') s.widget.welcomeMessageBn = cleanStr(w.welcomeMessageBn, 400);
      if (w.defaultLanguage === 'en' || w.defaultLanguage === 'bn') s.widget.defaultLanguage = w.defaultLanguage;
      if (w.position === 'bottom-right' || w.position === 'bottom-left') s.widget.position = w.position;
      if (Array.isArray(w.allowedDomains)) {
        s.widget.allowedDomains = w.allowedDomains
          .map((d: unknown) => cleanStr(d, 120).toLowerCase())
          .filter(Boolean);
      }
    }

    saveDbImmediate();
    addAuditLog({
      adminId: req.session!.sub,
      adminEmail: req.session!.email ?? 'admin',
      role: req.session!.role!,
      action: 'UPDATE_SETTINGS',
      targetType: 'settings',
      targetId: 'global',
      details: 'Updated DIU settings and embeddable widget configuration.',
    });
    res.json({ settings: db.settings });
  });

  // =========================================================================
  // EMBEDDABLE CHAT WIDGET SCRIPT & PUBLIC WIDGET ENDPOINT
  // =========================================================================
  app.get('/api/widget/embed.js', (req, res) => {
    const db = getDb();
    const w = db.settings.widget;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(`(function(){
  if (window.__DIU_ADMISSION_WIDGET__) return;
  window.__DIU_ADMISSION_WIDGET__ = true;
  var cfg = ${JSON.stringify({
    baseUrl,
    primaryColor: w.primaryColor,
    accentColor: w.accentColor,
    welcomeEn: w.welcomeMessageEn,
    welcomeBn: w.welcomeMessageBn,
    defaultLang: w.defaultLanguage,
    position: w.position,
  })};
  var btn = document.createElement('button');
  btn.textContent = 'DIU Admission Assistant';
  btn.style.cssText = 'position:fixed;bottom:20px;' + (cfg.position === 'bottom-left' ? 'left:20px;' : 'right:20px;') + 'z-index:99999;background:' + cfg.primaryColor + ';color:#fff;border:none;border-radius:14px;padding:12px 18px;font-family:system-ui,sans-serif;font-weight:600;cursor:pointer;box-shadow:0 10px 25px rgba(0,0,0,0.18);';
  btn.onclick = function() {
    var frame = document.getElementById('diu-assistant-iframe');
    if (frame) { frame.style.display = frame.style.display === 'none' ? 'block' : 'none'; return; }
    frame = document.createElement('iframe');
    frame.id = 'diu-assistant-iframe';
    frame.src = cfg.baseUrl + '/?embed=1&lang=' + encodeURIComponent(cfg.defaultLang);
    frame.style.cssText = 'position:fixed;bottom:76px;' + (cfg.position === 'bottom-left' ? 'left:20px;' : 'right:20px;') + 'width:390px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 100px);border:1px solid #d1d5db;border-radius:16px;z-index:99999;background:#fff;box-shadow:0 20px 45px rgba(0,0,0,0.2);';
    document.body.appendChild(frame);
  };
  document.body.appendChild(btn);
})();`);
  });

  app.post('/api/widget/chat', async (req, res) => {
    const db = getDb();
    const originHeader = req.headers.origin;
    if (originHeader) {
      try {
        const hostname = new URL(originHeader).hostname.toLowerCase();
        const selfHost = (req.get('host') ?? '').split(':')[0].toLowerCase();
        const allowed = db.settings.widget.allowedDomains;
        const isAllowed =
          hostname === selfHost ||
          hostname === 'localhost' ||
          allowed.some((d) => hostname === d || hostname.endsWith(`.${d}`));
        if (!isAllowed) {
          res.status(403).json({ error: 'Origin domain is not in the widget allowlist.' });
          return;
        }
        res.setHeader('Access-Control-Allow-Origin', originHeader);
      } catch {
        res.status(400).json({ error: 'Invalid Origin header.' });
        return;
      }
    }

    const messageText = cleanStr(req.body?.message, 1500);
    if (!messageText) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }
    const lang: Language =
      req.body?.language === 'bn'
        ? 'bn'
        : req.body?.language === 'en'
          ? 'en'
          : detectLanguageServer(messageText);

    try {
      const result = await generateGroundedChatResponse({
        query: messageText,
        language: lang,
        history: [],
        conversationId: 'widget-session',
      });
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to process widget request.',
      });
    }
  });

  // Multer / general API error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError || (err instanceof Error && err.message.includes('PDF'))) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
      return;
    }
    next(err);
  });

  // =========================================================================
  // VITE DEV MIDDLEWARE OR PRODUCTION STATIC ASSETS
  // =========================================================================
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DIU Admission Assistant server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
