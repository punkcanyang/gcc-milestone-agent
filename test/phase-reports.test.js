import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  detectDependencyWarnings,
  resolvePhaseOutputPaths,
  formatPhaseTimestamp,
  loadPhaseTimelineData,
  _internal
} from '../src/phase-reports.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-phase-reports-'));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function reportPayload(overrides = {}) {
  return {
    repo: 'owner/name',
    status: 'met',
    generatedAt: '2026-05-14T01:00:00.000Z',
    phase: { id: 'M1', title: null, dependsOn: [] },
    ...overrides
  };
}

test('detectDependencyWarnings accepts met and partially_met dependency reports', async () => {
  const reportsDir = makeTempDir();
  writeJson(path.join(reportsDir, 'm1.json'), reportPayload({ status: 'met', phase: { id: 'M1' } }));
  writeJson(path.join(reportsDir, 'm2.json'), reportPayload({ status: 'partially_met', phase: { id: 'M2' } }));

  const warnings = await detectDependencyWarnings({
    reportsDir,
    repo: 'owner/name',
    phase: { id: 'M3', dependsOn: ['M1', 'M2'] }
  });

  assert.deepEqual(warnings, []);
});

test('detectDependencyWarnings warns for missing dependency reports', async () => {
  const reportsDir = makeTempDir();

  const warnings = await detectDependencyWarnings({
    reportsDir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });

  assert.deepEqual(warnings, ['Phase M2 depends on M1, but no prior result was found in reportsDir.']);
});

test('detectDependencyWarnings warns for not_met dependency reports', async () => {
  const reportsDir = makeTempDir();
  writeJson(path.join(reportsDir, 'm1.json'), reportPayload({ status: 'not_met' }));

  const warnings = await detectDependencyWarnings({
    reportsDir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });

  assert.deepEqual(warnings, ['Phase M2 depends on M1, but latest result is not met: not_met.']);
});

test('detectDependencyWarnings uses newest valid generatedAt', async () => {
  const reportsDir = makeTempDir();
  writeJson(path.join(reportsDir, 'old-not-met.json'), reportPayload({
    status: 'not_met',
    generatedAt: '2026-05-14T01:00:00.000Z'
  }));
  writeJson(path.join(reportsDir, 'new-met.json'), reportPayload({
    status: 'met',
    generatedAt: '2026-05-14T02:00:00.000Z'
  }));

  const warnings = await detectDependencyWarnings({
    reportsDir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });

  assert.deepEqual(warnings, []);
});

test('detectDependencyWarnings ignores reports from other repos', async () => {
  const reportsDir = makeTempDir();
  writeJson(path.join(reportsDir, 'other-repo.json'), reportPayload({ repo: 'other/repo' }));

  const warnings = await detectDependencyWarnings({
    reportsDir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });

  assert.deepEqual(warnings, ['Phase M2 depends on M1, but no prior result was found in reportsDir.']);
});

test('detectDependencyWarnings ignores old non-phase JSON without generatedAt noise', async () => {
  const reportsDir = makeTempDir();
  writeJson(path.join(reportsDir, 'old-report.json'), {
    repo: 'owner/name',
    status: 'not_met'
  });

  const warnings = await detectDependencyWarnings({
    reportsDir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });

  assert.deepEqual(warnings, ['Phase M2 depends on M1, but no prior result was found in reportsDir.']);
});

test('detectDependencyWarnings warns and falls back to file mtime for matching reports with missing generatedAt', async () => {
  const reportsDir = makeTempDir();
  const missingGeneratedAtPath = path.join(reportsDir, 'missing-generated-at.json');
  writeJson(missingGeneratedAtPath, {
    repo: 'owner/name',
    status: 'met',
    phase: { id: 'M1' }
  });

  const mtime = new Date('2026-05-14T03:00:00.000Z');
  fs.utimesSync(missingGeneratedAtPath, mtime, mtime);

  const warnings = await detectDependencyWarnings({
    reportsDir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /missing-generated-at\.json has missing or invalid generatedAt; using file mtime\./);
});

test('detectDependencyWarnings warns and skips invalid JSON', async () => {
  const reportsDir = makeTempDir();
  const invalidPath = path.join(reportsDir, 'invalid.json');
  fs.writeFileSync(invalidPath, '{not-json');

  const warnings = await detectDependencyWarnings({
    reportsDir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });

  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Skipping invalid JSON report: .*invalid\.json/);
  assert.equal(warnings[1], 'Phase M2 depends on M1, but no prior result was found in reportsDir.');
});

test('detectDependencyWarnings uses lexical path order when timestamps tie', async () => {
  const reportsDir = makeTempDir();
  writeJson(path.join(reportsDir, 'a-met.json'), reportPayload({
    status: 'met',
    generatedAt: '2026-05-14T01:00:00.000Z'
  }));
  writeJson(path.join(reportsDir, 'b-not-met.json'), reportPayload({
    status: 'not_met',
    generatedAt: '2026-05-14T01:00:00.000Z'
  }));

  const warnings = await detectDependencyWarnings({
    reportsDir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });

  assert.deepEqual(warnings, []);
});

test('detectDependencyWarnings returns dependency warnings when reportsDir is unreadable', async () => {
  const reportsDir = path.join(makeTempDir(), 'missing');

  const warnings = await detectDependencyWarnings({
    reportsDir,
    repo: 'owner/name',
    phase: { id: 'M3', dependsOn: ['M1', 'M2'] }
  });

  assert.deepEqual(warnings, [
    `Phase M3 depends on M1, but reportsDir does not exist or cannot be read: ${reportsDir}`,
    `Phase M3 depends on M2, but reportsDir does not exist or cannot be read: ${reportsDir}`
  ]);
});

test('detectDependencyWarnings returns no warnings without dependencies when reportsDir is unreadable', async () => {
  const warnings = await detectDependencyWarnings({
    reportsDir: path.join(makeTempDir(), 'missing'),
    repo: 'owner/name',
    phase: { id: 'M1', dependsOn: [] }
  });

  assert.deepEqual(warnings, []);
});

test('resolvePhaseOutputPaths creates reportsDir defaults and keeps explicit paths', () => {
  const cwd = makeTempDir();
  const resolved = resolvePhaseOutputPaths({
    cwd,
    reportsDir: 'phase-reports',
    repo: 'owner/name',
    phaseId: 'M 1',
    timestamp: '20260514_010203',
    out: 'custom/report.md',
    jsonOut: '/tmp/custom-report.json',
    htmlOut: 'custom/report.html'
  });

  const defaultJson = path.join(cwd, 'phase-reports', 'owner_name-M_1-20260514_010203.json');
  assert.deepEqual(resolved, {
    reportsDir: path.join(cwd, 'phase-reports'),
    out: path.join(cwd, 'custom/report.md'),
    jsonOut: '/tmp/custom-report.json',
    htmlOut: path.join(cwd, 'custom/report.html'),
    phaseJsonOut: defaultJson
  });
});

test('resolvePhaseOutputPaths defaults output paths into reportsDir', () => {
  const cwd = makeTempDir();
  const resolved = resolvePhaseOutputPaths({
    cwd,
    repo: 'owner/name',
    phaseId: 'M1',
    timestamp: '20260514_010203'
  });

  const base = path.join(cwd, 'reports', 'owner_name-M1-20260514_010203');
  assert.equal(resolved.reportsDir, path.join(cwd, 'reports'));
  assert.equal(resolved.out, `${base}.md`);
  assert.equal(resolved.jsonOut, `${base}.json`);
  assert.equal(resolved.htmlOut, `${base}.html`);
  assert.equal(resolved.phaseJsonOut, `${base}.json`);
});

test('phase report internals expose slug, timestamp, generatedAt, and candidate ordering helpers', () => {
  assert.equal(_internal.safeReportSlug(' owner/name '), 'owner_name');
  assert.equal(_internal.safeReportSlug('***'), 'unknown');
  assert.equal(_internal.parseGeneratedAt('2026-05-14T01:00:00.000Z'), Date.parse('2026-05-14T01:00:00.000Z'));
  assert.equal(_internal.parseGeneratedAt('not-a-date'), null);
  assert.equal(formatPhaseTimestamp(new Date('2026-05-14T01:02:03.000Z')), '20260514_010203');

  const candidates = [
    { file: 'b.json', time: 100 },
    { file: 'a.json', time: 100 },
    { file: 'c.json', time: 200 }
  ].sort(_internal.compareCandidates);
  assert.deepEqual(candidates.map((candidate) => candidate.file), ['c.json', 'a.json', 'b.json']);
});

test('loadPhaseTimelineData loads historical phase results in order, deduping and applying current run', async () => {
  const reportsDir = makeTempDir();
  // M1 has historical report
  writeJson(path.join(reportsDir, 'm1.json'), reportPayload({
    phase: { id: 'M1', title: 'Phase One' },
    score: 80,
    status: 'met',
    generatedAt: '2026-05-14T01:00:00.000Z',
    rulePassRate: 70,
    evidenceCounts: { commits: 10, pulls: 2, issues: 1, releases: 0 },
    communityHealth: {
      github: { stars: 10, forks: 2, contributors: 1 }
    }
  }));
  // M2 has older historical report, but current run will overwrite it
  writeJson(path.join(reportsDir, 'm2-old.json'), reportPayload({
    phase: { id: 'M2', title: 'Phase Two' },
    score: 30,
    status: 'not_met',
    generatedAt: '2026-05-14T02:00:00.000Z',
    rulePassRate: 20
  }));

  const currentPhasePayload = {
    repo: 'owner/name',
    phase: 'M2',
    score: 90,
    status: 'met',
    generatedAt: '2026-05-14T03:00:00.000Z',
    rulePassRate: 85,
    evidenceCounts: { commits: 15, pulls: 3, issues: 2, releases: 1 },
    communityHealth: {
      github: { stars: 12, forks: 3, contributors: 2 }
    }
  };

  const milestonesConfig = [
    { id: 'M1', title: 'Phase One', dependsOn: [] },
    { id: 'M2', title: 'Phase Two', dependsOn: ['M1'] },
    { id: 'M3', title: 'Phase Three', dependsOn: ['M2'] }
  ];

  const timeline = await loadPhaseTimelineData({
    reportsDir,
    repo: 'owner/name',
    currentPhasePayload,
    milestonesConfig
  });

  assert.equal(timeline.length, 3);
  
  // M1: met, 80 score, from history
  assert.deepEqual(timeline[0], {
    id: 'M1',
    title: 'Phase One',
    score: 80,
    status: 'met',
    generatedAt: '2026-05-14T01:00:00.000Z',
    isCurrent: false,
    rulePassRate: 70,
    counts: { commits: 10, pulls: 2, issues: 1, releases: 0 },
    community: { stars: 10, forks: 2, contributors: 1 },
    deltas: null
  });

  // M2: met, 90 score, updated by current run
  assert.deepEqual(timeline[1], {
    id: 'M2',
    title: 'Phase Two',
    score: 90,
    status: 'met',
    generatedAt: '2026-05-14T03:00:00.000Z',
    isCurrent: true,
    rulePassRate: 85,
    counts: { commits: 15, pulls: 3, issues: 2, releases: 1 },
    community: { stars: 12, forks: 3, contributors: 2 },
    deltas: {
      score: 10,
      rulePassRate: 15,
      counts: { commits: 5, pulls: 1, issues: 1, releases: 1 },
      community: { stars: 2, forks: 1, contributors: 1 }
    }
  });

  // M3: pending, null score, config placeholder
  assert.deepEqual(timeline[2], {
    id: 'M3',
    title: 'Phase Three',
    score: null,
    status: 'pending',
    generatedAt: null,
    isCurrent: false,
    rulePassRate: null,
    counts: null,
    community: null,
    deltas: null
  });
});

test('loadPhaseTimelineData orders by generatedAt time if no config is provided', async () => {
  const reportsDir = makeTempDir();
  writeJson(path.join(reportsDir, 'm2.json'), reportPayload({
    phase: { id: 'M2', title: 'P2' },
    score: 50,
    status: 'partially_met',
    generatedAt: '2026-05-14T02:00:00.000Z'
  }));
  writeJson(path.join(reportsDir, 'm1.json'), reportPayload({
    phase: { id: 'M1', title: 'P1' },
    score: 80,
    status: 'met',
    generatedAt: '2026-05-14T01:00:00.000Z'
  }));

  const timeline = await loadPhaseTimelineData({
    reportsDir,
    repo: 'owner/name'
  });

  assert.equal(timeline.length, 2);
  // Ordered by generatedAt ascending (M1 then M2)
  assert.equal(timeline[0].id, 'M1');
  assert.equal(timeline[1].id, 'M2');
});
