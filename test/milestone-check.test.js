import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runMilestoneCheck, _internal } from '../src/milestone-check.js';

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
  assert.equal(result.baseScore, 53);
  assert.equal(result.score, 53);
  assert.equal(result.status, 'partially_met');
});

test('calculateProviderBonus returns max bonus for strong multi-source evidence', () => {
  const result = _internal.calculateProviderBonus({
    'github-actions': { totalRuns: 12, successRate: 100 },
    'github-community': { stars: 50, forks: 20, contributorCount: 10 },
    'npm-registry': { published: true },
    'url-checker': { totalChecked: 6, reachableRate: 100 }
  });

  assert.equal(result.totalBonus, 20);
  assert.equal(result.breakdown.ci, 8);
  assert.equal(result.breakdown.community, 6);
  assert.equal(result.breakdown.npm, 3);
  assert.equal(result.breakdown.url, 3);
});

test('scoreEvidence adds provider bonus on top of base score', () => {
  const result = _internal.scoreEvidence({
    commits: 10,
    pulls: 5,
    issues: 5,
    releases: 1,
    rulePassRate: 50,
    providerBonus: 7
  });
  assert.equal(result.baseScore, 53);
  assert.equal(result.providerBonus, 7);
  assert.equal(result.score, 60);
});

test('scoreEvidence caps total score at 100 even with provider bonus', () => {
  const result = _internal.scoreEvidence({
    commits: 50,
    pulls: 50,
    issues: 50,
    releases: 50,
    rulePassRate: 100,
    providerBonus: 20
  });
  assert.equal(result.baseScore, 100);
  assert.equal(result.score, 100);
  assert.equal(result.status, 'met');
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

test('normalizeSemanticMode returns heuristic by default', () => {
  assert.equal(_internal.normalizeSemanticMode(undefined), 'heuristic');
});

test('normalizeSemanticMode accepts llm', () => {
  assert.equal(_internal.normalizeSemanticMode('llm'), 'llm');
});

test('normalizeSemanticMode rejects invalid value', () => {
  assert.throws(() => _internal.normalizeSemanticMode('abc'), /Invalid --semantic-mode/);
});

test('buildJsonReport includes phase metadata and dependency warnings', () => {
  const payload = _internal.buildJsonReport({
    repo: 'owner/name',
    milestone: 'phase milestone',
    phase: { id: 'M2', title: 'Community proof', dependsOn: ['M1'] },
    dependencyWarnings: ['Phase M2 depends on M1, but no prior result was found in reportsDir.'],
    sinceIso: null,
    profile: null,
    providers: ['github-api'],
    score: 50,
    status: 'partially_met',
    activityScore: 20,
    baseScore: 40,
    providerBonus: 10,
    providerBonusBreakdown: { ci: 0, community: 0, npm: 0, url: 0 },
    semanticMode: 'heuristic',
    semanticWarnings: [],
    counts: { commits: 0, pulls: 0, issues: 0, releases: 0 },
    ruleEval: { passRate: 0, passed: 0, total: 0, rules: [] },
    links: { commits: [], pulls: [], issues: [], releases: [] },
    providerErrors: [],
    providerMeta: {},
    communityHealth: {}
  });
  assert.deepEqual(payload.phase, { id: 'M2', title: 'Community proof', dependsOn: ['M1'] });
  assert.deepEqual(payload.dependencyWarnings, ['Phase M2 depends on M1, but no prior result was found in reportsDir.']);
});

test('buildReport renders phase section and dependency warnings', () => {
  const markdown = _internal.buildReport({
    repo: 'owner/name',
    milestone: 'phase milestone',
    phase: { id: 'M2', title: 'Community proof', dependsOn: ['M1'] },
    dependencyWarnings: ['Phase M2 depends on M1, but no prior result was found in reportsDir.'],
    since: null,
    profile: null,
    providers: ['github-api'],
    score: 50,
    status: 'partially_met',
    activityScore: 20,
    baseScore: 40,
    providerBonus: 10,
    providerBonusBreakdown: { ci: 0, community: 0, npm: 0, url: 0 },
    semanticMode: 'heuristic',
    semanticWarnings: [],
    counts: { commits: 0, pulls: 0, issues: 0, releases: 0 },
    links: { commits: [], pulls: [], issues: [], releases: [] },
    ruleEval: { passRate: 0, passed: 0, total: 0, rules: [] },
    providerErrors: [],
    communityHealthMarkdown: ''
  });
  assert.match(markdown, /Phase: M2/);
  assert.match(markdown, /Community proof/);
  assert.match(markdown, /Dependency Warnings/);
});

test('runMilestoneCheck writes phase metadata to explicit JSON and phase JSON outputs', async () => {
  const previousCwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-phase-run-'));
  process.chdir(dir);
  try {
    const result = await runMilestoneCheck({
      repo: 'owner/name',
      milestone: 'phase milestone',
      providers: ',',
      out: path.join(dir, 'custom.md'),
      jsonOut: path.join(dir, 'custom.json'),
      htmlOut: path.join(dir, 'custom.html'),
      phaseJsonOut: path.join(dir, 'reports', 'owner_name-M2-fixed.json'),
      phase: { id: 'M2', title: 'Community proof', dependsOn: ['M1'] },
      dependencyWarnings: ['Phase M2 depends on M1, but no prior result was found in reportsDir.']
    });

    assert.equal(result.jsonReportPath, path.join(dir, 'custom.json'));
    const explicitPayload = JSON.parse(fs.readFileSync(path.join(dir, 'custom.json'), 'utf8'));
    const phasePayload = JSON.parse(fs.readFileSync(path.join(dir, 'reports', 'owner_name-M2-fixed.json'), 'utf8'));
    assert.deepEqual(explicitPayload.phase, { id: 'M2', title: 'Community proof', dependsOn: ['M1'] });
    assert.deepEqual(phasePayload.phase, explicitPayload.phase);
    assert.deepEqual(phasePayload.dependencyWarnings, ['Phase M2 depends on M1, but no prior result was found in reportsDir.']);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
