import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePhaseId,
  normalizeDependsOn,
  normalizeMilestones,
  selectPhase,
  validateMilestones,
  mergePhaseOptions
} from '../src/phase-config.js';

test('validatePhaseId accepts slug-like ids', () => {
  assert.equal(validatePhaseId('M1'), 'M1');
  assert.equal(validatePhaseId('phase-1'), 'phase-1');
  assert.equal(validatePhaseId('delivery_alpha'), 'delivery_alpha');
});

test('validatePhaseId rejects empty or unsafe ids', () => {
  assert.throws(() => validatePhaseId(''), /Invalid phase id/);
  assert.throws(() => validatePhaseId('M 1'), /Invalid phase id/);
  assert.throws(() => validatePhaseId('../M1'), /Invalid phase id/);
});

test('normalizeDependsOn accepts string, array, and empty values', () => {
  assert.deepEqual(normalizeDependsOn('M1'), ['M1']);
  assert.deepEqual(normalizeDependsOn(['M1', 'M2']), ['M1', 'M2']);
  assert.deepEqual(normalizeDependsOn(undefined), []);
});

test('normalizeMilestones normalizes dependsOn to arrays', () => {
  const phases = normalizeMilestones([
    { id: 'M1', milestone: 'one' },
    { id: 'M2', milestone: 'two', dependsOn: 'M1' }
  ]);
  assert.deepEqual(phases[1].dependsOn, ['M1']);
});

test('validateMilestones rejects duplicate phase ids', () => {
  assert.throws(
    () => validateMilestones([
      { id: 'M1', milestone: 'one' },
      { id: 'M1', milestone: 'duplicate' }
    ]),
    /Duplicate phase id: M1/
  );
});

test('validateMilestones rejects missing dependencies', () => {
  assert.throws(
    () => validateMilestones([{ id: 'M2', milestone: 'two', dependsOn: 'M1' }]),
    /depends on unknown phase: M1/
  );
});

test('validateMilestones rejects self-dependency', () => {
  assert.throws(
    () => validateMilestones([{ id: 'M1', milestone: 'one', dependsOn: 'M1' }]),
    /depends on itself/
  );
});

test('validateMilestones rejects dependency cycles', () => {
  assert.throws(
    () => validateMilestones([
      { id: 'M1', milestone: 'one', dependsOn: 'M2' },
      { id: 'M2', milestone: 'two', dependsOn: 'M1' }
    ]),
    /cycle/i
  );
});

test('selectPhase returns the requested phase and lists available ids on miss', () => {
  const phases = validateMilestones([{ id: 'M1', milestone: 'one' }]);
  assert.equal(selectPhase(phases, 'M1').id, 'M1');
  assert.throws(() => selectPhase(phases, 'M2'), /Available phases: M1/);
});

test('mergePhaseOptions applies CLI > phase > top-level for execution keys', () => {
  const topLevel = {
    repo: 'owner/name',
    profile: 'gcc-allocation',
    providers: 'github-api',
    since: '2026-01-01',
    reportsDir: 'reports',
    out: 'top.md',
    jsonOut: 'top.json',
    htmlOut: 'top.html',
    milestones: [{ id: 'Top', milestone: 'top' }]
  };
  const phase = {
    id: 'M2',
    milestone: 'phase milestone',
    profile: 'phase-profile',
    repo: 'ignored/repo',
    providers: 'github-actions',
    since: '2026-02-01',
    reportsDir: 'ignored-reports',
    out: 'ignored.md',
    jsonOut: 'ignored.json',
    htmlOut: 'ignored.html',
    milestones: [{ id: 'Ignored', milestone: 'ignored' }]
  };
  const cli = {
    phase: 'M2',
    profile: 'cli-profile',
    milestone: 'cli milestone'
  };
  const merged = mergePhaseOptions({ topLevel, phase, cli });
  assert.equal(merged.repo, 'owner/name');
  assert.equal(merged.reportsDir, 'reports');
  assert.equal(merged.out, 'top.md');
  assert.equal(merged.jsonOut, 'top.json');
  assert.equal(merged.htmlOut, 'top.html');
  assert.deepEqual(merged.milestones, [{ id: 'Top', milestone: 'top' }]);
  assert.equal(merged.profile, 'cli-profile');
  assert.equal(merged.providers, 'github-actions');
  assert.equal(merged.since, '2026-02-01');
  assert.equal(merged.milestone, 'cli milestone');
  assert.deepEqual(merged.phase, { id: 'M2', title: null, dependsOn: [] });
});

test('mergePhaseOptions requires effective repo and milestone', () => {
  assert.throws(
    () => mergePhaseOptions({ topLevel: { repo: 'owner/name' }, phase: { id: 'M1' }, cli: {} }),
    /milestone is required/
  );
  assert.throws(
    () => mergePhaseOptions({ topLevel: {}, phase: { id: 'M1', milestone: 'one' }, cli: {} }),
    /repo is required/
  );
});
