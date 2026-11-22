import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { extractText } from 'unpdf';
import type {
  ChatMessage,
  KnowledgeDocument,
  Language,
  SourceReference,
} from '../src/types.ts';
import {
  addNotification,
  getDb,
  newId,
  recordApiCall,
  scheduleSaveDb,
  type KnowledgeChunkRecord,
} from './db.ts';
import { chunkText, cosineSimilarity, lexicalScore } from './ragMath.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function extractPdfContent(buffer: Buffer): Promise<{ text: string; usedOcr: boolean }> {
  let extracted = '';
  try {
    const res = await extractText(new Uint8Array(buffer), { mergePages: true });
    extracted = (Array.isArray(res.text) ? res.text.join('\n') : String(res.text ?? '')).trim();
  } catch {
    extracted = '';
  }

  // If scanned PDF yields very little text, attempt Gemini OCR fallback
  if (extracted.replace(/\s+/g, '').length < 60) {
    const ai = getGeminiClient();
    if (ai) {
      try {
        const ocrResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: buffer.toString('base64'),
                },
              },
              {
                text: 'Extract all readable text, tables, fee numbers, dates, and policy details accurately from this PDF document. Preserve Bengali and English text faithfully without summarizing or inventing data.',
              },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
        recordApiCall(true);
        const ocrText = (ocrResp.text ?? '').trim();
        if (ocrText.length > extracted.length) {
          return { text: ocrText, usedOcr: true };
        }
      } catch (err) {
        recordApiCall(false, err instanceof Error ? err.message : 'PDF OCR failed');
      }
    }
  }

  return { text: extracted, usedOcr: false };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  const ai = getGeminiClient();
  if (!ai) return [];
  try {
    const result = await withTimeout(
      ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: text,
      }),
      4500,
      'Embedding request'
    );
    const values = result.embeddings?.[0]?.values;
    return Array.isArray(values) ? values : [];
  } catch {
    return [];
  }
}

export async function indexKnowledgeDocument(doc: KnowledgeDocument): Promise<number> {
  const db = getDb();
  // Remove existing chunks for this document
  db.knowledgeChunks = db.knowledgeChunks.filter((c) => c.docId !== doc.id);

  const chunks = chunkText(doc.content, 650, 110);
  const newChunks: KnowledgeChunkRecord[] = [];

  for (const text of chunks) {
    const embedding = await generateEmbedding(`${doc.title}\n${doc.category}\n${text}`);
    newChunks.push({
      id: newId('chk'),
      docId: doc.id,
      docTitle: doc.title,
      category: doc.category,
      sourceUrl: doc.sourceUrl,
      effectiveSemester: doc.effectiveSemester,
      verificationStatus: doc.verificationStatus,
      status: doc.status,
      text,
      embedding,
    });
  }

  db.knowledgeChunks.push(...newChunks);
  doc.chunkCount = newChunks.length;
  doc.processingStatus = 'indexed';
  doc.processingError = undefined;
  scheduleSaveDb();
  return newChunks.length;
}

let indexingInitialized = false;
export async function ensureInitialKnowledgeIndexed(): Promise<void> {
  if (indexingInitialized) return;
  indexingInitialized = true;
  const db = getDb();
  for (const doc of db.knowledgeDocuments) {
    const existingCount = db.knowledgeChunks.filter((c) => c.docId === doc.id).length;
    if (existingCount === 0 && doc.content.trim()) {
      const chunks = chunkText(doc.content, 650, 110);
      for (const text of chunks) {
        // Compute embeddings lazily on demand or if GEMINI_API_KEY is available
        db.knowledgeChunks.push({
          id: newId('chk'),
          docId: doc.id,
          docTitle: doc.title,
          category: doc.category,
          sourceUrl: doc.sourceUrl,
          effectiveSemester: doc.effectiveSemester,
          verificationStatus: doc.verificationStatus,
          status: doc.status,
          text,
          embedding: [],
        });
      }
      doc.chunkCount = chunks.length;
      doc.processingStatus = 'indexed';
    }
  }
  scheduleSaveDb();
}

export async function reindexAllDocuments(): Promise<{ docs: number; chunks: number }> {
  const db = getDb();
  let totalChunks = 0;
  for (const doc of db.knowledgeDocuments) {
    totalChunks += await indexKnowledgeDocument(doc);
  }
  return { docs: db.knowledgeDocuments.length, chunks: totalChunks };
}

interface RetrievedContextResult {
  contextText: string;
  sources: SourceReference[];
  topScore: number;
}

export async function retrieveGroundedContext(query: string): Promise<RetrievedContextResult> {
  await ensureInitialKnowledgeIndexed();
  const db = getDb();

  // Lazily hydrate missing chunk embeddings if Gemini key is configured
  const ai = getGeminiClient();
  let queryEmbedding: number[] = [];
  if (ai) {
    queryEmbedding = await generateEmbedding(query);
    if (queryEmbedding.length > 0) {
      // Backfill up to 4 unembedded active chunks in parallel so chat latency stays low
      const unembedded = db.knowledgeChunks
        .filter((c) => c.status === 'active' && c.embedding.length === 0)
        .slice(0, 4);
      if (unembedded.length > 0) {
        await Promise.all(
          unembedded.map(async (chunk) => {
            chunk.embedding = await generateEmbedding(`${chunk.docTitle}\n${chunk.text}`);
          })
        );
        scheduleSaveDb();
      }
    }
  }

  const activeDocsById = new Map(
    db.knowledgeDocuments.filter((d) => d.status === 'active').map((d) => [d.id, d])
  );

  // Score Knowledge Chunks
  const scoredChunks = db.knowledgeChunks
    .filter((c) => activeDocsById.has(c.docId))
    .map((chunk) => {
      const lex = lexicalScore(query, `${chunk.docTitle} ${chunk.category} ${chunk.text}`);
      const vec =
        queryEmbedding.length > 0 && chunk.embedding.length === queryEmbedding.length
          ? Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding))
          : 0;
      const combined = queryEmbedding.length > 0 && chunk.embedding.length > 0
        ? vec * 0.7 + lex * 0.3
        : lex;
      return { chunk, score: combined };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Score structured Departments & Programs
  const programSnippets = db.programs
    .map((p) => {
      const dept = db.departments.find((d) => d.id === p.departmentId);
      const fee = db.feeStructures.find((f) => f.programId === p.id && f.isCurrent);
      const text = [
        `Program: ${p.name} (${p.degreeType}, ${p.level})`,
        dept ? `Department: ${dept.name} (${dept.code}) - ${dept.faculty}` : '',
        `Duration: ${p.durationYears} years / ${p.totalSemesters} semesters | Credits: ${p.totalCredits}`,
        `Eligibility: Min SSC GPA ${p.minSscGpa ?? 'Pending'}, Min HSC GPA ${p.minHscGpa ?? 'Pending'}, Combined ${p.minCombinedGpa ?? 'N/A'}, Bachelor CGPA ${p.minBachelorCgpa ?? 'N/A'}, Groups: ${p.allowedGroups.join(', ')}. ${p.specialRequirements}`,
        `Curriculum: ${p.curriculumSummary}. Core courses: ${p.coreCourses.join(', ')}.`,
        dept ? `Careers: ${dept.careerOpportunities.join(', ')}. Internship: ${dept.internshipInfo}` : '',
        fee
          ? `Fee Structure (${fee.effectiveSemester}, status=${fee.verificationStatus}): Admission Fee ${fee.admissionFee !== null ? fee.admissionFee + ' BDT' : 'Information not available'}, Per-Credit ${fee.perCreditFee !== null ? fee.perCreditFee + ' BDT' : 'Information not available'}, Semester Fee ${fee.semesterFee !== null ? fee.semesterFee + ' BDT' : 'Information not available'}, Lab/Other ${fee.labAndOtherFee !== null ? fee.labAndOtherFee + ' BDT' : 'Information not available'}.`
          : 'Fee Structure: Information not available.',
        `Verification Status: ${p.verificationStatus} | Effective Semester: ${p.effectiveSemester}`,
      ]
        .filter(Boolean)
        .join('\n');
      const score = lexicalScore(query, text);
      return {
        id: p.id,
        title: p.name,
        category: 'Departments & Fees',
        sourceUrl: dept?.sourceUrl,
        effectiveSemester: p.effectiveSemester,
        verificationStatus: p.verificationStatus,
        text,
        score,
      };
    })
    .filter((item) => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Score active Scholarships
  const scholarshipSnippets = db.scholarships
    .filter((s) => s.isActive)
    .map((s) => {
      const text = `Scholarship: ${s.name} (${s.category}) | Waiver: ${s.waiverLabel} | Conditions: ${s.conditions} | Renewal: ${s.renewalRequirements} | Deadline: ${s.deadline} | Verification: ${s.verificationStatus}`;
      return {
        id: s.id,
        title: s.name,
        category: 'Scholarships',
        sourceUrl: s.sourceUrl,
        effectiveSemester: 'Current Policy',
        verificationStatus: s.verificationStatus,
        text,
        score: lexicalScore(query, text),
      };
    })
    .filter((item) => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Score published FAQs
  const faqSnippets = db.faqs
    .filter((f) => f.isPublished)
    .map((f) => {
      const text = `FAQ (${f.category}): Q(EN): ${f.questionEn} | Q(BN): ${f.questionBn}\nA(EN): ${f.answerEn}\nA(BN): ${f.answerBn}`;
      return {
        id: f.id,
        title: f.questionEn,
        category: 'FAQs',
        sourceUrl: f.sourceUrl,
        effectiveSemester: 'Current FAQ',
        verificationStatus: f.verificationStatus,
        text,
        score: lexicalScore(query, text),
      };
    })
    .filter((item) => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const sections: string[] = [];
  const sourceMap = new Map<string, SourceReference>();

  for (const item of scoredChunks) {
    if (item.score < 0.04 && scoredChunks[0]?.score > 0.1) continue;
    sections.push(
      `[Knowledge Doc: "${item.chunk.docTitle}" | Category: ${item.chunk.category} | Semester: ${item.chunk.effectiveSemester} | Status: ${item.chunk.verificationStatus}${item.chunk.sourceUrl ? ` | URL: ${item.chunk.sourceUrl}` : ''}]\n${item.chunk.text}`
    );
    sourceMap.set(item.chunk.docId, {
      docId: item.chunk.docId,
      title: item.chunk.docTitle,
      category: item.chunk.category,
      sourceUrl: item.chunk.sourceUrl,
      effectiveSemester: item.chunk.effectiveSemester,
      verificationStatus: item.chunk.verificationStatus,
      score: Number(item.score.toFixed(3)),
    });
  }

  for (const prog of programSnippets) {
    sections.push(`[Verified Program Record]\n${prog.text}`);
    sourceMap.set(prog.id, {
      docId: prog.id,
      title: prog.title,
      category: prog.category,
      sourceUrl: prog.sourceUrl,
      effectiveSemester: prog.effectiveSemester,
      verificationStatus: prog.verificationStatus,
      score: Number(prog.score.toFixed(3)),
    });
  }

  for (const sch of scholarshipSnippets) {
    sections.push(`[Scholarship Policy Record]\n${sch.text}`);
    sourceMap.set(sch.id, {
      docId: sch.id,
      title: sch.title,
      category: sch.category,
      sourceUrl: sch.sourceUrl,
      effectiveSemester: sch.effectiveSemester,
      verificationStatus: sch.verificationStatus,
      score: Number(sch.score.toFixed(3)),
    });
  }

  for (const faq of faqSnippets) {
    sections.push(`[Published FAQ]\n${faq.text}`);
    sourceMap.set(faq.id, {
      docId: faq.id,
      title: faq.title,
      category: faq.category,
      sourceUrl: faq.sourceUrl,
      effectiveSemester: faq.effectiveSemester,
      verificationStatus: faq.verificationStatus,
      score: Number(faq.score.toFixed(3)),
    });
  }

  const maxChunkScore = scoredChunks[0]?.score ?? 0;
  const maxStructuredScore = Math.max(
    programSnippets[0]?.score ?? 0,
    scholarshipSnippets[0]?.score ?? 0,
    faqSnippets[0]?.score ?? 0
  );
  const topScore = Math.max(maxChunkScore, maxStructuredScore);

  return {
    contextText: sections.join('\n\n---\n\n'),
    sources: Array.from(sourceMap.values()).slice(0, 5),
    topScore,
  };
}

export const FALLBACK_BN =
  'দুঃখিত, এই বিষয়ে আমার কাছে নির্দিষ্ট তথ্য নেই। অনুগ্রহ করে অ্যাডমিশন অফিসে যোগাযোগ করুন: +8809617901212 / admission@daffodilvarsity.edu.bd';
export const FALLBACK_EN =
  'Sorry, I do not have specific verified information on this topic. Please contact the DIU Admission Office at +8809617901212 or admission@daffodilvarsity.edu.bd.';

export async function generateGroundedChatResponse(params: {
  query: string;
  language: Language;
  history: ChatMessage[];
  conversationId: string;
}): Promise<{
  answer: string;
  sources: SourceReference[];
  isFallback: boolean;
}> {
  const db = getDb();
  const settings = db.settings;
  const { contextText, sources, topScore } = await retrieveGroundedContext(params.query);

  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Please add a valid GEMINI_API_KEY in Settings > Secrets.'
    );
  }

  const systemInstruction = `You are "DIU Admission Assistant", the official AI Admission Assistant for Daffodil International University (DIU), Bangladesh.

OFFICIAL VERIFIED CONTACTS:
- University: ${settings.universityName}
- Admission Phone: ${settings.admissionPhone}
- Admission Email: ${settings.admissionEmail}
- Address: ${settings.address}
- Website: ${settings.websiteUrl}
- Official Application Portal: ${settings.officialPortalUrl}

STRICT RULES:
1. Answer strictly using the PROVIDED VERIFIED KNOWLEDGE CONTEXT below. Never invent tuition fees, deadlines, GPA requirements, scholarship percentages, or admission rules.
2. Language: Respond in ${params.language === 'bn' ? 'Bengali (বাংলা)' : 'English'}, matching the student's language naturally and clearly.
3. Concise First, Structured Details Next: Start with a clear direct answer, then use clean bullet points or a concise breakdown when helpful.
4. Distinguish Confirmed vs Pending/Estimated: Whenever a context record has "pending_verification" or notes that fees/deadlines are estimates, explicitly mention that it is an estimate / pending final semester verification.
5. Never assume all departments share identical eligibility requirements. Specify program-specific requirements.
6. Never claim an application has been submitted or approved—if asked about application status, direct them to ${settings.officialPortalUrl} or ${settings.admissionPhone}.
7. Include source title and official source URL when available in context.
8. MANDATORY FALLBACK: If the provided context does NOT contain sufficient verified information to answer the question accurately (or if the user asks about unrelated non-DIU topics / unknown exact deadlines / missing fee details), DO NOT GUESS. Respond ONLY with the exact mandatory fallback message:
${params.language === 'bn' ? `"${FALLBACK_BN}"` : `"${FALLBACK_EN}"`}
And append on a new line at the very end: [[UNANSWERED]]`;

  const recentHistory = params.history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `RETRIEVED DIU KNOWLEDGE CONTEXT (Top relevance score: ${topScore.toFixed(2)}):
${contextText || 'No matching verified documents found.'}

RECENT CONVERSATION HISTORY:
${recentHistory || 'None'}

STUDENT QUESTION:
${params.query}`;

  const modelAttempts: Array<{
    model: string;
    thinkingLevel?: ThinkingLevel;
    timeoutMs: number;
    delayMs: number;
  }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeoutMs: 12000, delayMs: 400 },
    { model: 'gemini-3.1-flash-lite', timeoutMs: 15000, delayMs: 400 },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeoutMs: 15000, delayMs: 0 },
  ];

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < modelAttempts.length; attempt++) {
    const cfg = modelAttempts[attempt];
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: cfg.model,
          contents: prompt,
          config: {
            systemInstruction,
            ...(cfg.thinkingLevel ? { thinkingConfig: { thinkingLevel: cfg.thinkingLevel } } : {}),
          },
        }),
        cfg.timeoutMs,
        `Gemini (${cfg.model})`
      );
      recordApiCall(true);

      let text = (response.text ?? '').trim();
      const flaggedUnanswered = text.includes('[[UNANSWERED]]');
      text = text.replace(/\[\[UNANSWERED\]\]/g, '').trim();

      const isFallback =
        flaggedUnanswered ||
        text.includes(FALLBACK_BN) ||
        text.includes(FALLBACK_EN) ||
        !text;

      if (!text) {
        text = params.language === 'bn' ? FALLBACK_BN : FALLBACK_EN;
      }

      if (isFallback || topScore < 0.08) {
        const existing = db.unansweredQuestions.find(
          (q) => q.question.toLowerCase() === params.query.toLowerCase() && q.status === 'open'
        );
        if (!existing) {
          db.unansweredQuestions.unshift({
            id: newId('uq'),
            question: params.query,
            conversationId: params.conversationId,
            contextSnippet: recentHistory.slice(0, 400),
            language: params.language,
            status: 'open',
            createdAt: new Date().toISOString(),
          });
          addNotification({
            type: 'unanswered',
            title: 'New Unanswered Student Question',
            message: params.query.slice(0, 140),
          });
          scheduleSaveDb();
        }
      }

      return {
        answer: text,
        sources: isFallback ? [] : sources,
        isFallback,
      };
    } catch (err) {
      lastErr = err;
      const raw = err instanceof Error ? err.message : String(err);
      const isTransient =
        raw.includes('503') ||
        raw.includes('429') ||
        raw.includes('UNAVAILABLE') ||
        raw.includes('timed out');
      if (isTransient && attempt < modelAttempts.length - 1) {
        if (cfg.delayMs > 0) {
          await new Promise((r) => setTimeout(r, cfg.delayMs));
        }
        continue;
      }
      break;
    }
  }

  const rawMsg = lastErr instanceof Error ? lastErr.message : 'Gemini API call failed';
  recordApiCall(false, rawMsg);
  addNotification({
    type: 'api_error',
    title: 'Gemini API Request Error',
    message: rawMsg.slice(0, 160),
  });

  if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE')) {
    throw new Error(
      'The AI service is temporarily experiencing high demand. Please retry in a few seconds, or contact DIU Admission Office (+8809617901212).'
    );
  }
  if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    throw new Error(
      'AI request quota temporarily reached. Please wait a moment and try again.'
    );
  }
  throw new Error('Unable to generate AI response right now. Please try again shortly.');
}
