import { EVIDENCE_TYPES, PROVIDER_SOURCES } from './types.js';

const TELEGRAM_BASE = 'https://t.me';

export function normalizeTelegramGroup(input) {
  if (!input) return null;
  let username = input.trim();
  if (username.includes('t.me/')) {
    username = username.split('t.me/').pop();
  }
  username = username.replace(/^@/, '');
  username = username.split(/[?#/]/)[0];
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) return null;
  return username;
}

export function parseMemberCount(html) {
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

    // Phase 2: Playwright fallback
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
