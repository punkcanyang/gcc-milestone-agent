import test from 'node:test';
import assert from 'node:assert/strict';
import { _internal } from '../src/milestone-check.js';

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
