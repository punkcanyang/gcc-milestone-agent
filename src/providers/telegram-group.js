/**
 * __ai_context__
 * 模組角色：Telegram Group Social Evidence Provider (HTTP fetch & Playwright fallback)
 * 系統位置：providers/index.js → [本模組] → browser-runner.js / types.js
 * 核心職責：
 *   1. 從 Telegram 公開群組網址中抓取成員數量
 *   2. 先後進行快速的 HTTP fetch，失敗時 fallback 到無頭瀏覽器載入
 *   3. 產出 SOCIAL_METRIC 證據
 */
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

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 依賴 `ctx.options.telegramGroup` 輸入。
 *    - Telegram 的 t.me 頁面上包含 "X members" 或 "X subscribers" 文字。
 * 2. 潛在邊界情況：
 *    - 群組為私有群組時，頁面不顯示人數，解析會回傳 null 并忽略。
 *    - HTTP fetch 有機率被 Cloudflare / 阻擋，因此提供了 Playwright 備用方案。
 * 3. 模組依賴：
 *    - browser-runner.js (可選，動態載入)
 *    - types.js (EVIDENCE_TYPES, PROVIDER_SOURCES)
 */

