import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSemanticVerdict } from '../src/semantic-evaluator.js';

test('semantic evaluator returns met for strong evidence', () => {
  const rule = { keywords: ['submission', 'template', 'workflow'] };
  const hits = [
    { url: 'https://a', matchedKeywords: ['submission', 'template'] },
    { url: 'https://b', matchedKeywords: ['workflow', 'submission'] }
  ];
  const out = evaluateSemanticVerdict(rule, hits);
  assert.equal(out.verdict, 'met');
  assert.ok(out.confidence >= 50);
});
