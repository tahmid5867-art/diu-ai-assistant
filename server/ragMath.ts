export function chunkText(text: string, maxChars = 650, overlap = 110): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if ((current + '\n\n' + trimmed).trim().length <= maxChars) {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    } else {
      if (current) {
        chunks.push(current);
        const tail = current.slice(Math.max(0, current.length - overlap));
        current = `${tail}\n${trimmed}`.trim();
      } else {
        current = trimmed;
      }

      while (current.length > maxChars) {
        let cutIdx = current.lastIndexOf(' ', maxChars);
        if (cutIdx < maxChars * 0.5) cutIdx = maxChars;
        chunks.push(current.slice(0, cutIdx).trim());
        const nextStart = Math.max(0, cutIdx - overlap);
        current = current.slice(nextStart).trim();
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

const STOP_WORDS = new Set([
  'the',
  'is',
  'are',
  'a',
  'an',
  'of',
  'for',
  'in',
  'to',
  'and',
  'or',
  'what',
  'how',
  'do',
  'i',
  'can',
  'at',
  'diu',
  'daffodil',
  'university',
  'কি',
  'কী',
  'কত',
  'কবে',
  'এবং',
  'এর',
  'জন্য',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

export function lexicalScore(query: string, documentText: string): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const docLower = documentText.toLowerCase();
  let matched = 0;
  for (const token of qTokens) {
    if (docLower.includes(token)) {
      matched += 1;
    }
  }
  return matched / qTokens.length;
}
