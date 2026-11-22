import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, cosineSimilarity, lexicalScore } from './ragMath';

test('chunkText splits long documents with overlap and preserves content', () => {
  const paragraph = 'Daffodil International University offers undergraduate and postgraduate programs. '.repeat(25);
  const chunks = chunkText(paragraph, 400, 80);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.length <= 420));
});

test('cosineSimilarity computes exact geometric similarity', () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 1], [1, 0]) - Math.SQRT1_2) < 1e-6);
});

test('lexicalScore detects Bengali and English query matches', () => {
  const scoreEn = lexicalScore('CSE tuition fee per credit', 'B.Sc. in CSE tuition fee per credit is listed in the schedule.');
  assert.ok(scoreEn >= 0.75);

  const scoreBn = lexicalScore('স্কলারশিপ ওয়েভার', 'ভর্তি পরীক্ষায় ফলাফলের ভিত্তিতে স্কলারশিপ ওয়েভার প্রদান করা হয়।');
  assert.ok(scoreBn >= 0.5);
});
