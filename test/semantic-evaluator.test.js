import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSemanticVerdict } from '../src/semantic-evaluator.js';

/**
 * __ai_context__
 * 測試目標：semantic-evaluator.js 的 evaluateSemanticVerdict 函數
 * 驗證重點：三種 verdict 路徑、置信度計算、邊界條件
 */

test('semantic evaluator returns met for strong evidence', () => {
  const rule = { keywords: ['submission', 'template', 'workflow'] };
  const hits = [
    { url: 'https://a', matchedKeywords: ['submission', 'template'] },
    { url: 'https://b', matchedKeywords: ['workflow', 'submission'] }
  ];
  const out = evaluateSemanticVerdict(rule, hits);
  assert.equal(out.verdict, 'met');
  assert.ok(out.confidence >= 50);
  assert.equal(out.keywordCoverage, 100);
  assert.ok(out.rationale.includes('semantic coverage'));
});

test('semantic evaluator returns partially_met for partial evidence', () => {
  // WHY: 1 hit + 33% coverage = partially_met
  const rule = { keywords: ['submission', 'template', 'workflow'] };
  const hits = [
    { url: 'https://a', matchedKeywords: ['submission'] }
  ];
  const out = evaluateSemanticVerdict(rule, hits);
  assert.equal(out.verdict, 'partially_met');
  assert.ok(out.confidence > 0);
  assert.ok(out.rationale.includes('Some semantic evidence'));
});

test('semantic evaluator returns not_met for no hits', () => {
  const rule = { keywords: ['submission', 'template'] };
  const hits = [];
  const out = evaluateSemanticVerdict(rule, hits);
  assert.equal(out.verdict, 'not_met');
  assert.equal(out.keywordCoverage, 0);
  assert.ok(out.rationale.includes('No sufficient'));
});

test('semantic evaluator returns not_met when hits exist but coverage too low', () => {
  // WHY: 1 hit + 覆蓋率 < 30% = not_met
  const rule = { keywords: ['a', 'bb', 'cc', 'dd'] };
  const hits = [
    { url: 'https://a', matchedKeywords: ['a'] }
  ];
  const out = evaluateSemanticVerdict(rule, hits);
  assert.equal(out.verdict, 'not_met');
  assert.equal(out.keywordCoverage, 25);
});

test('semantic evaluator confidence never exceeds 95', () => {
  const rule = { keywords: ['a'] };
  // WHY: 大量 hits 也不應讓置信度超過 95%（keyword 方式的固有限制）
  const hits = Array.from({ length: 20 }, (_, i) => ({
    url: `https://example.com/${i}`,
    matchedKeywords: ['a']
  }));
  const out = evaluateSemanticVerdict(rule, hits);
  assert.ok(out.confidence <= 95, `confidence ${out.confidence} should not exceed 95`);
});

test('semantic evaluator handles empty keywords gracefully', () => {
  const rule = { keywords: [] };
  const hits = [{ url: 'https://a', matchedKeywords: [] }];
  const out = evaluateSemanticVerdict(rule, hits);
  assert.equal(out.verdict, 'not_met');
  assert.equal(out.keywordCoverage, 0);
});

test('semantic evaluator citedUrls are deduplicated and capped at 3', () => {
  const rule = { keywords: ['test'] };
  const hits = [
    { url: 'https://a', matchedKeywords: ['test'] },
    { url: 'https://a', matchedKeywords: ['test'] },
    { url: 'https://b', matchedKeywords: ['test'] },
    { url: 'https://c', matchedKeywords: ['test'] },
    { url: 'https://d', matchedKeywords: ['test'] }
  ];
  const out = evaluateSemanticVerdict(rule, hits);
  assert.ok(out.citedUrls.length <= 3, 'should cap at 3 URLs');
  // WHY: 去重後不重複計算同一 URL
  assert.ok(new Set(out.citedUrls).size === out.citedUrls.length, 'should be deduplicated');
});

test('semantic evaluator computes semanticCoverage beyond matched keywords using snippets', () => {
  const rule = {
    text: 'submission template workflow transparency',
    keywords: ['submission', 'template', 'workflow', 'transparency']
  };
  const hits = [
    {
      url: 'https://a',
      source: 'github-api',
      matchedKeywords: ['submission'],
      snippet: 'This PR adds submission template workflow and transparency details for reviewer demo.'
    }
  ];
  const out = evaluateSemanticVerdict(rule, hits);
  assert.ok(out.semanticCoverage >= out.keywordCoverage);
  assert.ok(out.semanticCoverage >= 70);
  assert.equal(out.verdict, 'met');
});

test('semantic evaluator rewards source diversity in confidence', () => {
  const rule = { text: 'ci workflow success', keywords: ['ci', 'workflow', 'success'] };
  const sameSourceHits = [
    { url: 'https://a', source: 'github-actions', matchedKeywords: ['ci', 'workflow'], snippet: 'ci workflow success in main' },
    { url: 'https://b', source: 'github-actions', matchedKeywords: ['success'], snippet: 'ci workflow success in release branch' }
  ];
  const mixedSourceHits = [
    { url: 'https://a', source: 'github-actions', matchedKeywords: ['ci', 'workflow'], snippet: 'ci workflow success in main' },
    { url: 'https://b', source: 'github-api', matchedKeywords: ['success'], snippet: 'release note confirms ci workflow success' }
  ];

  const outSameSource = evaluateSemanticVerdict(rule, sameSourceHits);
  const outMixedSource = evaluateSemanticVerdict(rule, mixedSourceHits);
  assert.ok(outMixedSource.confidence > outSameSource.confidence);
});

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 測試中的閾值 (30%, 60%, 95 cap) 需與 semantic-evaluator.js 的常數同步
 *    - 覆蓋率計算：去重 matchedKeywords / total keywords
 * 2. 潛在邊界情況：
 *    - 未測試 rule.keywords 為 undefined 的情況（函數內有 || [] 防護）
 *    - 未測試 matchedKeywords 包含重複值的去重行為
 * 3. 模組依賴：
 *    - semantic-evaluator.js (evaluateSemanticVerdict)
 */
