import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommunityHealth, computeTrend, formatCommunityHealthMarkdown } from '../src/community-health.js';

test('buildCommunityHealth extracts all providers', () => {
  const meta = {
    'github-community': { stars: 100, forks: 20, contributorCount: 5, watchers: 30 },
    'discord-api': { memberCount: 500, onlineCount: 50 },
    'twitter-browser': { handle: 'test', followerCount: '1000' },
    'telegram-group': { memberCount: 200 },
    'github-discussions': { totalCount: 10, answerRate: 80, topParticipants: ['a', 'b'] }
  };
  const health = buildCommunityHealth(meta);
  assert.equal(health.github.stars, 100);
  assert.equal(health.discord.memberCount, 500);
  assert.equal(health.twitter.handle, 'test');
  assert.equal(health.telegram.memberCount, 200);
  assert.equal(health.discussions.totalCount, 10);
});

test('buildCommunityHealth handles empty meta', () => {
  const health = buildCommunityHealth({});
  assert.deepEqual(health, {});
});

test('buildCommunityHealth handles missing fields with defaults', () => {
  const meta = { 'github-community': {} };
  const health = buildCommunityHealth(meta);
  assert.equal(health.github.stars, 0);
  assert.equal(health.github.forks, 0);
});

test('computeTrend returns deltas', () => {
  const current = { github: { stars: 115, forks: 22, contributors: 6 } };
  const prev = { github: { stars: 100, forks: 20, contributors: 5 } };
  const trend = computeTrend(current, prev);
  assert.equal(trend.stars, 15);
  assert.equal(trend.forks, 2);
  assert.equal(trend.contributors, 1);
});

test('computeTrend returns null if no previous', () => {
  assert.equal(computeTrend({}, null), null);
});

test('computeTrend returns null if no changes', () => {
  const current = { github: { stars: 100 } };
  const prev = { github: { stars: 100 } };
  assert.equal(computeTrend(current, prev), null);
});

test('formatCommunityHealthMarkdown includes GitHub line', () => {
  const md = formatCommunityHealthMarkdown({ github: { stars: 50, forks: 10, contributors: 3 } });
  assert.ok(md.includes('50 ⭐'));
  assert.ok(md.includes('## Community Health'));
});

test('formatCommunityHealthMarkdown includes trend', () => {
  const md = formatCommunityHealthMarkdown(
    { github: { stars: 100, forks: 20, contributors: 5 } },
    { stars: 10, forks: 2 }
  );
  assert.ok(md.includes('### Trend'));
  assert.ok(md.includes('+10'));
});

test('formatCommunityHealthMarkdown returns empty for no data', () => {
  assert.equal(formatCommunityHealthMarkdown({}), '');
});
