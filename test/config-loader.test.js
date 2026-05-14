import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, mergeOptions, resolveOptions } from '../src/config-loader.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-config-'));
}

test('loadConfig returns empty object when no config file', () => {
  const dir = tmpDir();
  const config = loadConfig(dir);
  assert.deepEqual(config, {});
  fs.rmSync(dir, { recursive: true });
});

test('loadConfig reads YAML config', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, '.gcc-milestone.yaml'), `repo: owner/name\nmilestone: test\nproviders: github-api,discord-api\n`);
  const config = loadConfig(dir);
  assert.equal(config.repo, 'owner/name');
  assert.equal(config.milestone, 'test');
  assert.equal(config.providers, 'github-api,discord-api');
  fs.rmSync(dir, { recursive: true });
});

test('loadConfig reads explicit config path', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'phase.yaml'), `repo: owner/name\nmilestones:\n  - id: M1\n    milestone: one\n`);
  const config = loadConfig(dir, 'phase.yaml');
  assert.equal(config.repo, 'owner/name');
  assert.equal(config.milestones[0].id, 'M1');
  fs.rmSync(dir, { recursive: true });
});

test('loadConfig reads explicit absolute config path', () => {
  const dir = tmpDir();
  const filePath = path.join(dir, 'phase.yaml');
  fs.writeFileSync(filePath, `repo: owner/name\nmilestone: test\n`);
  const config = loadConfig(dir, filePath);
  assert.equal(config.repo, 'owner/name');
  assert.equal(config.milestone, 'test');
  fs.rmSync(dir, { recursive: true });
});

test('loadConfig handles invalid YAML', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, '.gcc-milestone.yaml'), `{{{invalid`);
  assert.throws(() => loadConfig(dir));
  fs.rmSync(dir, { recursive: true });
});

test('mergeOptions CLI overrides config', () => {
  const config = { repo: 'config/repo', profile: 'gcc-allocation' };
  const cli = { repo: 'cli/repo', profile: undefined, out: './out.md' };
  const merged = mergeOptions(cli, config);
  assert.equal(merged.repo, 'cli/repo');
  assert.equal(merged.profile, 'gcc-allocation');
  assert.equal(merged.out, './out.md');
});

test('mergeOptions skips empty CLI values', () => {
  const config = { repo: 'config/repo' };
  const cli = { repo: '', milestone: null, since: undefined };
  const merged = mergeOptions(cli, config);
  assert.equal(merged.repo, 'config/repo');
  assert.equal(merged.milestone, undefined);
});

test('resolveOptions preserves old single milestone behavior without phase', () => {
  const config = {
    repo: 'config/repo',
    milestone: 'config milestone',
    milestones: [
      { id: 'M1', milestone: 'phase milestone' },
      { id: 'M1', milestone: 'duplicate phase should not be validated without --phase' }
    ]
  };
  const cli = { repo: 'cli/repo' };
  const resolved = resolveOptions(cli, config);
  assert.equal(resolved.repo, 'cli/repo');
  assert.equal(resolved.milestone, 'config milestone');
  assert.equal(resolved.phase, undefined);
});

test('resolveOptions selects phase when --phase is provided', () => {
  const config = {
    repo: 'owner/name',
    profile: 'gcc-allocation',
    milestones: [
      { id: 'M1', milestone: 'one' },
      { id: 'M2', milestone: 'two', profile: 'phase-profile', dependsOn: 'M1' }
    ]
  };
  const resolved = resolveOptions({ phase: 'M2' }, config);
  assert.equal(resolved.repo, 'owner/name');
  assert.equal(resolved.milestone, 'two');
  assert.equal(resolved.profile, 'phase-profile');
  assert.deepEqual(resolved.phase, { id: 'M2', title: null, dependsOn: ['M1'] });
});

test('resolveOptions defaults reportsDir in phase mode', () => {
  const resolved = resolveOptions(
    { phase: 'M1' },
    { repo: 'owner/name', milestones: [{ id: 'M1', milestone: 'one' }] }
  );
  assert.equal(resolved.reportsDir, 'reports');
});

test('resolveOptions requires milestones when --phase is provided', () => {
  assert.throws(
    () => resolveOptions({ phase: 'M1' }, { repo: 'owner/name' }),
    /milestones/
  );
});
