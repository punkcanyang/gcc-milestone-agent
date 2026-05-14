# Community Growth Monitor — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [`) syntax for tracking.

**Goal:** Aggregate existing community providers into a unified Community Health view, add JSON snapshots for trend comparison, and create a new Telegram provider.

**Architecture:** Three new modules (community-health, snapshot-store, telegram-group provider), wired into existing milestone-check flow. No new dependencies.

**Tech Stack:** Node.js ESM, Playwright (existing), built-in `node:test`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/providers/telegram-group.js` | Create | Telegram provider — scrape t.me |
| `src/providers/types.js` | Modify | Add TELEGRAM_GROUP + EVIDENCE_TYPES.SOCIAL_METRIC already exists |
| `src/providers/index.js` | Modify | Register telegram-group provider |
| `src/community-health.js` | Create | Aggregate community metrics from providerMeta |
| `src/snapshot-store.js` | Create | Save/load JSON snapshots for trend |
| `src/cli.js` | Modify | Add `--telegram-group` option |
| `src/milestone-check.js` | Modify | Call community-health + snapshot-store, pass to report builders |
| `src/html-report.js` | Modify | Add Community Health card section |
| `test/community-health.test.js` | Create | Tests for aggregation logic |
| `test/snapshot-store.test.js` | Create | Tests for save/load/trend |
| `test/telegram-group.test.js` | Create | Tests for URL parsing + fallback |

---

## Chunk 1: Telegram Provider

### Task 1: Add constants to types.js

**Files:** `src/providers/types.js`

- [ ] **Step 1: Add TELEGRAM_GROUP to PROVIDER_SOURCES**

```js
// Add inside PROVIDER_SOURCES object, after DISCORD_API:
TELEGRAM_GROUP: 'telegram-group',
```

- [ ] **Step 2: Commit**

```bash
git add src/providers/types.js
git commit -chore: add TELEGRAM_GROUP to PROVIDER_SOURCES'
```

### Task 2: Create telegram-group.js provider

**Files:**
- Create: `src/providers/telegram-group.js`

- [ ] **Step 1: Write the provider**

The provider should:
1. Accept `ctx.options.telegramGroup` (username or full URL)
2. Normalize input: extract username from `t.me/username`, `https://t.me/username`, or bare `username`
3. HTTP GET `https://t.me/{username}` and parse HTML for member count
4. Fallback to Playwright if HTTP fails or returns no data
5. Return `{ items, counts, links, metadata }` following the ProviderDefinition contract

```js
import { EVIDENCE_TYPES, PROVIDER_SOURCES, fetchWithRetry } from './types.js';

const TELEGRAM_BASE = 'https://t.me';

function normalizeTelegramGroup(input) {
  if (!input) return null;
  let username = input.trim();
  // Strip full URL
  if (username.includes('t.me/')) {
    username = username.split('t.me/').pop();
  }
  // Strip @ prefix
  username = username.replace(/^@/, '');
  // Strip query params / trailing slashes
  username = username.split(/[?#/]/)[0];
  // Validate: alphanumeric + underscore, 5-32 chars
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) return null;
  return username;
}

function parseMemberCount(html) {
  // t.me page has text like "2,105 members" or "2 105 members"
  const match = html.match(/([\d,.\s]+)\s*members/i);
  if (!match) return null;
  const cleaned = match[1].replace(/[,\s.]/g, '');
  const num = parseInt(cleaned, 10);
  return Number.isFinite(num) ? num : null;
}

const telegramGroupProvider = {
  name: PROVIDER_SOURCES.TELEGRAM_GROUP,
  types: [EVIDENCE_TYPES.SOCIAL_METRIC],

  async collect(ctx) {
    const raw = ctx.options?.telegramGroup;
    if (!raw) {
      return { items: [], counts: {}, links: {} };
    }

    const username = normalizeTelegramGroup(raw);
    if (!username) {
      console.warn(`[telegram-group] Invalid Telegram group input: ${raw}`);
      return { items: [], counts: {}, links: {} };
    }

    const url = `${TELEGRAM_BASE}/${username}`;
    let memberCount = null;

    // Phase 1: HTTP fetch (fast)
    try {
      const res = await fetchWithRetry(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' }
      });
      // fetchWithRetry expects JSON but t.me returns HTML — use raw fetch instead
    } catch {
      // fall through
    }

    // Direct fetch for HTML
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (res.ok) {
        const html = await res.text();
        memberCount = parseMemberCount(html);
      }
    } catch (e) {
      console.warn(`[telegram-group] HTTP fetch failed for ${url}: ${e.message}`);
    }

    // Phase 2: Playwright fallback (if HTTP didn't work)
    if (memberCount === null) {
      try {
        const { createPage } = await import('./browser-runner.js');
        const page = await createPage();
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
          await page.waitForTimeout(2000);
          const text = await page.evaluate(() => document.body.innerText || '');
          memberCount = parseMemberCount(text);
        } finally {
          await page.close();
        }
      } catch (e) {
        console.warn(`[telegram-group] Playwright fallback failed: ${e.message}`);
      }
    }

    if (memberCount === null) {
      console.warn(`[telegram-group] Could not extract member count for ${username}`);
      return { items: [], counts: {}, links: {} };
    }

    return {
      items: [{
        type: EVIDENCE_TYPES.SOCIAL_METRIC,
        source: PROVIDER_SOURCES.TELEGRAM_GROUP,
        title: `Telegram: @${username} (${memberCount} members)`,
        body: `Telegram group @${username} has approximately ${memberCount} members.`,
        url,
        metadata: { username, memberCount }
      }],
      counts: { social_metrics: 1 },
      links: { telegram: [url] },
      metadata: { memberCount }
    };
  }
};

export default telegramGroupProvider;
export { normalizeTelegramGroup, parseMemberCount };
```

- [ ] **Step 2: Register in providers/index.js**

Add import and push to BUILTIN_PROVIDERS:
```js
import telegramGroupProvider from './telegram-group.js';
// ... in BUILTIN_PROVIDERS array:
telegramGroupProvider,
```

- [ ] **Step 3: Add CLI option in cli.js**

After `--discord-invite` line, add:
```js
.option('--telegram-group <username_or_url>', 'Telegram group username or URL to check community metrics')
```

And pass it in the options object inside the `.action`:
```js
telegramGroup,
```

- [ ] **Step 4: Pass through in milestone-check.js**

In `runMilestoneCheck` destructuring, add `telegramGroup`. In the `collectFromProviders` call context, add `telegramGroup` to `options`.

- [ ] **Step 5: Write tests**

Create `test/telegram-group.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTelegramGroup, parseMemberCount } from '../src/providers/telegram-group.js';

test('normalizeTelegramGroup handles bare username', () => {
  assert.equal(normalizeTelegramGroup('mygroup'), 'mygroup');
});

test('normalizeTelegramGroup handles t.me URL', () => {
  assert.equal(normalizeTelegramGroup('t.me/mygroup'), 'mygroup');
});

test('normalizeTelegramGroup handles full URL', () => {
  assert.equal(normalizeTelegramGroup('https://t.me/mygroup'), 'mygroup');
});

test('normalizeTelegramGroup handles @ prefix', () => {
  assert.equal(normalizeTelegramGroup('@mygroup'), 'mygroup');
});

test('normalizeTelegramGroup rejects invalid input', () => {
  assert.equal(normalizeTelegramGroup('ab'), null);  // too short
  assert.equal(normalizeTelegramGroup(''), null);
  assert.equal(normalizeTelegramGroup(null), null);
});

test('parseMemberCount extracts count', () => {
  assert.equal(parseMemberCount('2,105 members'), 2105);
  assert.equal(parseMemberCount('12 345 members'), 12345);
  assert.equal(parseMemberCount('500 subscribers'), null);  // wrong label
  assert.equal(parseMemberCount('no numbers here'), null);
});
```

- [ ] **Step 6: Run tests**

```bash
node --test test/telegram-group.test.js
```

- [ ] **Step 7: Commit**

```bash
git add src/providers/telegram-group.js src/providers/index.js src/providers/types.js src/cli.js src/milestone-check.js test/telegram-group.test.js
git commit -m "feat: add Telegram group provider with HTTP + Playwright fallback"
```

---

## Chunk 2: Community Health Aggregation + Snapshot Store

### Task 3: Create community-health.js

**Files:**
- Create: `src/community-health.js`

- [ ] **Step 1: Write the module**

```js
/**
 * Aggregate community metrics from provider metadata into a single view.
 */
export function buildCommunityHealth(providerMeta = {}) {
  const health = {};

  const gh = providerMeta['github-community'];
  if (gh) {
    health.github = {
      stars: gh.stars || 0,
      forks: gh.forks || 0,
      contributors: gh.contributorCount || 0,
      watchers: gh.watchers || 0
    };
  }

  const discord = providerMeta['discord-api'];
  if (discord) {
    health.discord = {
      memberCount: discord.memberCount || 0,
      onlineCount: discord.onlineCount || 0
    };
  }

  const twitter = providerMeta['twitter-browser'];
  if (twitter) {
    health.twitter = {
      handle: twitter.handle || '',
      followerCount: twitter.followerCount || 'unknown'
    };
  }

  const telegram = providerMeta['telegram-group'];
  if (telegram) {
    health.telegram = {
      memberCount: telegram.memberCount || 0
    };
  }

  const discussions = providerMeta['github-discussions'];
  if (discussions) {
    health.discussions = {
      totalCount: discussions.totalCount || 0,
      answeredRate: discussions.answerRate || 0,
      participantCount: discussions.topParticipants?.length || 0
    };
  }

  return health;
}

/**
 * Compare current health with previous snapshot. Returns key deltas.
 */
export function computeTrend(current, previous) {
  if (!previous) return null;

  const deltas = {};

  if (current.github && previous.github) {
    deltas.stars = (current.github.stars || 0) - (previous.github.stars || 0);
    deltas.forks = (current.github.forks || 0) - (previous.github.forks || 0);
    deltas.contributors = (current.github.contributors || 0) - (previous.github.contributors || 0);
  }

  if (current.discord && previous.discord) {
    if (typeof current.discord.memberCount === 'number' && typeof previous.discord.memberCount === 'number') {
      deltas.discordMembers = current.discord.memberCount - previous.discord.memberCount;
    }
  }

  if (current.twitter && previous.twitter) {
    const curFol = Number(current.twitter.followerCount) || 0;
    const prevFol = Number(previous.twitter.followerCount) || 0;
    if (curFol && prevFol) deltas.twitterFollowers = curFol - prevFol;
  }

  if (current.telegram && previous.telegram) {
    if (typeof current.telegram.memberCount === 'number' && typeof previous.telegram.memberCount === 'number') {
      deltas.telegramMembers = current.telegram.memberCount - previous.telegram.memberCount;
    }
  }

  return Object.keys(deltas).length > 0 ? deltas : null;
}

/**
 * Format community health as markdown section.
 */
export function formatCommunityHealthMarkdown(health, trend) {
  const lines = [];

  if (health.github) {
    lines.push(`- **GitHub**: ${health.github.stars} ⭐ · ${health.github.forks} forks · ${health.github.contributors} contributors`);
  }
  if (health.discord) {
    lines.push(`- **Discord**: ${health.discord.memberCount} members (${health.discord.onlineCount} online)`);
  }
  if (health.twitter) {
    lines.push(`- **Twitter**: @${health.twitter.handle} · ${health.twitter.followerCount} followers`);
  }
  if (health.telegram) {
    lines.push(`- **Telegram**: ${health.telegram.memberCount} members`);
  }
  if (health.discussions) {
    lines.push(`- **Discussions**: ${health.discussions.totalCount} threads, ${health.discussions.answeredRate}% answered`);
  }

  if (!lines.length) return '';

  let output = `\n## Community Health\n${lines.join('\n')}\n`;

  if (trend) {
    const trendLines = [];
    if (trend.stars) trendLines.push(`⭐ ${trend.stars > 0 ? '+' : ''}${trend.stars}`);
    if (trend.forks) trendLines.push(`🍴 ${trend.forks > 0 ? '+' : ''}${trend.forks}`);
    if (trend.discordMembers) trendLines.push(`👥 Discord ${trend.discordMembers > 0 ? '+' : ''}${trend.discordMembers}`);
    if (trend.twitterFollowers) trendLines.push(`🐦 Twitter ${trend.twitterFollowers > 0 ? '+' : ''}${trend.twitterFollowers}`);
    if (trend.telegramMembers) trendLines.push(`✈️ Telegram ${trend.telegramMembers > 0 ? '+' : ''}${trend.telegramMembers}`);
    if (trendLines.length) {
      output += `\n### Trend (vs previous)\n${trendLines.join(' · ')}\n`;
    }
  }

  return output;
}
```

- [ ] **Step 2: Write tests**

Create `test/community-health.test.js`:
```js
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

test('formatCommunityHealthMarkdown includes GitHub line', () => {
  const md = formatCommunityHealthMarkdown({ github: { stars: 50, forks: 10, contributors: 3 } });
  assert.ok(md.includes('50 ⭐'));
  assert.ok(md.includes('## Community Health'));
});

test('formatCommunityHealthMarkdown returns empty for no data', () => {
  assert.equal(formatCommunityHealthMarkdown({}), '');
});
```

- [ ] **Step 3: Run tests**

```bash
node --test test/community-health.test.js
```

- [ ] **Step 4: Commit**

```bash
git add src/community-health.js test/community-health.test.js
git commit -m "feat: add community health aggregation module"
```

### Task 4: Create snapshot-store.js

**Files:**
- Create: `src/snapshot-store.js`

- [ ] **Step 1: Write the module**

```js
import fs from 'node:fs/promises';
import path from 'node:path';

const SNAPSHOT_DIR = '.gcc-milestone/snapshots';

function snapshotPath(repo) {
  const safe = repo.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(SNAPSHOT_DIR, `${safe}.json`);
}

/**
 * Save a snapshot of current run data for future trend comparison.
 */
export async function saveSnapshot(repo, { score, status, communityHealth, counts }) {
  const dir = path.resolve(process.cwd(), SNAPSHOT_DIR);
  await fs.mkdir(dir, { recursive: true });

  const data = {
    timestamp: new Date().toISOString(),
    repo,
    score,
    status,
    counts,
    communityHealth
  };

  const filePath = path.resolve(process.cwd(), snapshotPath(repo));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
}

/**
 * Load the most recent snapshot for trend comparison.
 */
export async function loadPreviousSnapshot(repo) {
  try {
    const filePath = path.resolve(process.cwd(), snapshotPath(repo));
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Write tests**

Create `test/snapshot-store.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { saveSnapshot, loadPreviousSnapshot } from '../src/snapshot-store.js';

const TEST_REPO = 'test-org/test-repo';
const SNAPSHOT_DIR = path.resolve('.gcc-milestone/snapshots');

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

  // cleanup
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

  // cleanup
  await fs.rm(SNAPSHOT_DIR, { recursive: true, force: true });
});
```

- [ ] **Step 3: Run tests**

```bash
node --test test/snapshot-store.test.js
```

- [ ] **Step 4: Commit**

```bash
git add src/snapshot-store.js test/snapshot-store.test.js
git commit -m "feat: add JSON snapshot store for trend comparison"
```

---

## Chunk 3: Report Integration

### Task 5: Wire community-health into milestone-check.js

**Files:** `src/milestone-check.js`

- [ ] **Step 1: Import new modules**

Add at the top:
```js
import { buildCommunityHealth, computeTrend, formatCommunityHealthMarkdown } from './community-health.js';
import { saveSnapshot, loadPreviousSnapshot } from './snapshot-store.js';
```

- [ ] **Step 2: Add telegramGroup to runMilestoneCheck params**

In the destructured params of `runMilestoneCheck`, add `telegramGroup`. Pass it into `collectFromProviders` context options:
```js
options: {
  twitterHandle,
  contractAddress,
  etherscanUrl,
  etherscanApiKey: process.env.ETHERSCAN_API_KEY,
  articleUrls: articleUrls ? articleUrls.split(',').map(u => u.trim()).filter(Boolean) : [],
  discordInvite,
  telegramGroup    // <-- add this
}
```

- [ ] **Step 3: Build community health and trend**

After `bonusInfo` calculation, before `buildReport`:
```js
const communityHealth = buildCommunityHealth(evidence.providerMeta);
const previousSnapshot = await loadPreviousSnapshot(`${owner}/${name}`);
const communityTrend = computeTrend(communityHealth, previousSnapshot?.communityHealth);
```

- [ ] **Step 4: Add communityHealthMarkdown to buildReport**

Pass `communityHealthMarkdown: formatCommunityHealthMarkdown(communityHealth, communityTrend)` to `buildReport`.

In `buildReport`, add the section after Evidence Links and before Rule Evaluation:
```js
communityHealthMarkdown || '',
```

- [ ] **Step 5: Add to JSON report payload**

Add `communityHealth` to `buildJsonReport` return object.

- [ ] **Step 6: Save snapshot**

After writing reports:
```js
await saveSnapshot(`${owner}/${name}`, { score, status, communityHealth, counts });
```

- [ ] **Step 7: Add to HTML report payload**

Add `communityHealth` to the JSON payload passed to `renderHtmlReport`.

- [ ] **Step 8: Commit**

```bash
git add src/milestone-check.js
git commit -m "feat: wire community health + snapshot into milestone check flow"
```

### Task 6: Add Community Health section to HTML report

**Files:** `src/html-report.js`

- [ ] **Step 1: Add renderCommunityHealth function**

```js
function renderCommunityHealth(payload) {
  const health = payload.communityHealth;
  if (!health || (!health.github && !health.discord && !health.twitter && !health.telegram && !health.discussions)) {
    return '';
  }

  const rows = [];
  if (health.github) {
    rows.push(`<div class="card"><div class="badge">GitHub</div><h3>${esc(health.github.stars)} ⭐ · ${esc(health.github.forks)} forks · ${esc(health.github.contributors)} contributors</h3></div>`);
  }
  if (health.discord) {
    rows.push(`<div class="card"><div class="badge">Discord</div><h3>${esc(health.discord.memberCount)} members (${esc(health.discord.onlineCount)} online)</h3></div>`);
  }
  if (health.twitter) {
    rows.push(`<div class="card"><div class="badge">Twitter</div><h3>@${esc(health.twitter.handle)} · ${esc(health.twitter.followerCount)} followers</h3></div>`);
  }
  if (health.telegram) {
    rows.push(`<div class="card"><div class="badge">Telegram</div><h3>${esc(health.telegram.memberCount)} members</h3></div>`);
  }
  if (health.discussions) {
    rows.push(`<div class="card"><div class="badge">Discussions</div><h3>${esc(health.discussions.totalCount)} threads · ${esc(health.discussions.answeredRate)}% answered</h3></div>`);
  }

  return rows.join('\n');
}
```

- [ ] **Step 2: Insert into renderHtmlReport**

Add after the Dashboard section and before Evidence Counts:
```js
${sectionTitle('Community Health')}
<div class="grid">
  ${renderCommunityHealth(payload)}
</div>
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/html-report.js
git commit -m "feat: add Community Health section to HTML report"
```

### Task 7: Full integration test + demo run

- [ ] **Step 1: Run all tests**

```bash
npm test
```

- [ ] **Step 2: Run demo to verify end-to-end**

```bash
npm run demo
```

- [ ] **Step 3: Verify report contains Community Health section**

Check `demo-report.md` for `## Community Health` section.

- [ ] **Step 4: Run demo:gcc for HTML output**

```bash
npm run demo:html
```

- [ ] **Step 5: Update AGENTS.md**

Add Telegram provider to the providers table and mention the snapshot store.

- [ ] **Step 6: Final commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with Telegram provider and snapshot store"
```
