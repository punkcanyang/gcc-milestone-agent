import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, mergeOptions } from '../src/config-loader.js';

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
