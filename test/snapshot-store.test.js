import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { saveSnapshot, loadPreviousSnapshot } from '../src/snapshot-store.js';

const TEST_REPO = 'test-org/test-repo';
const SNAPSHOT_DIR = path.resolve(process.cwd(), '.gcc-milestone/snapshots');

test('saveSnapshot creates file and returns path', async () => {
  const filePath = await saveSnapshot(TEST_REPO, {
    score: 75, status: 'met',
    communityHealth: { github: { stars: 100 } },
    counts: { commits: 10 }
  });
  assert.ok(filePath.endsWith('.json'));
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(raw.score, 75);
  assert.equal(raw.communityHealth.github.stars, 100);
  assert.equal(raw.repo, TEST_REPO);
  assert.ok(raw.timestamp);

  await fs.rm(SNAPSHOT_DIR, { recursive: true, force: true });
});

test('loadPreviousSnapshot returns null if no file', async () => {
  const result = await loadPreviousSnapshot('nonexistent/repo');
  assert.equal(result, null);
});

test('loadPreviousSnapshot loads saved data', async () => {
  await saveSnapshot(TEST_REPO, { score: 60, status: 'partially_met', communityHealth: {}, counts: {} });
  const loaded = await loadPreviousSnapshot(TEST_REPO);
  assert.equal(loaded.score, 60);
  assert.equal(loaded.status, 'partially_met');

  await fs.rm(SNAPSHOT_DIR, { recursive: true, force: true });
});
