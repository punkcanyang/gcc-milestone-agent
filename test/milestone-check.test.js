import test from 'node:test';
import assert from 'node:assert/strict';
import { _internal } from '../src/milestone-check.js';

/**
 * __ai_context__
 * 測試目標：milestone-check.js 的內部工具函數
 * 驗證重點：parseRepo, normalizeDate, scoreEvidence, parseProviders
 */

test('parseRepo accepts owner/name', () => {
  assert.deepEqual(_internal.parseRepo('foo/bar'), { owner: 'foo', name: 'bar' });
});

test('parseRepo rejects invalid format', () => {
  assert.throws(() => _internal.parseRepo('foobar'), /Invalid --repo format/);
});

test('normalizeDate rejects invalid date', () => {
  assert.throws(() => _internal.normalizeDate('not-a-date'), /Invalid --since date/);
});

test('scoreEvidence computes weighted score', () => {
  const result = _internal.scoreEvidence({ commits: 10, pulls: 5, issues: 5, releases: 1, rulePassRate: 50 });
  assert.equal(result.activityScore, 55);
  assert.equal(result.score, 53);
  assert.equal(result.status, 'partially_met');
});

test('parseProviders returns default when no arg', () => {
  const result = _internal.parseProviders(undefined);
  assert.deepEqual(result, ['github-api']);
});

test('parseProviders parses comma-separated list', () => {
  const result = _internal.parseProviders('github-api,github-actions,npm-registry');
  assert.deepEqual(result, ['github-api', 'github-actions', 'npm-registry']);
});

test('parseProviders trims whitespace', () => {
  const result = _internal.parseProviders(' github-api , github-actions ');
  assert.deepEqual(result, ['github-api', 'github-actions']);
});

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - scoreEvidence 測試依賴固定的權重常數（WEIGHT_* 和 ACTIVITY/RULE_WEIGHT）
 *    - 修改 milestone-check.js 中的常數會影響此測試
 * 2. 潛在邊界情況：
 *    - 未測試 runMilestoneCheck（需 mock HTTP），屬整合測試範疇
 * 3. 模組依賴：
 *    - milestone-check.js (_internal)
 */
