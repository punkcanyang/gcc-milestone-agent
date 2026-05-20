/**
 * __ai_context__
 * 模組角色：Twitter Social Evidence Provider (Browser-based)
 * 系統位置：providers/index.js → [本模組] → browser-runner.js / types.js
 * 核心職責：
 *   1. 透過無頭瀏覽器訪問 Twitter 使用者首頁
 *   2. 抓取 followers 數量和最新推文指標
 *   3. 截圖存檔作為可視化證據
 */

import { EVIDENCE_TYPES, PROVIDER_SOURCES } from './types.js';
import { createPage, closeBrowser, takeScreenshot } from './browser-runner.js';
import { requestLlmVisionExtraction } from '../llm-semantic.js';

/**
 * @type {import('./types.js').ProviderDefinition}
 */
const twitterBrowserProvider = {
    name: PROVIDER_SOURCES.TWITTER_BROWSER,
    types: [EVIDENCE_TYPES.SOCIAL_METRIC],

    /**
     * WHY: 使用者社交媒體指標是營銷/增長類 milestone 的常見衡量標準
     */
    async collect(ctx) {
        // WHY: twitter provider 必須依賴 CLI 或配置傳入的 twitterHandle
        const handle = ctx.options?.twitterHandle;
        if (!handle) {
            console.warn(`[twitter-browser] Skip: no --twitter-handle provided`);
            return { items: [], counts: {}, links: {} };
        }

        const url = `https://x.com/${handle}`;
        let page = null;
        try {
            page = await createPage();
            
            // WHY: 增加 timeout 到 30 秒，使用 load 而非 networkidle，避免 Twitter 的 websocket/polling 導致 timeout
            await page.goto(url, { waitUntil: 'load', timeout: 30000 });
            // 額外等待一下讓 React 渲染
            await page.waitForTimeout(3000);

            // WHY: 等待頁面上出現 profile stats 區塊，Twitter 的選擇器經常變動，這裡用 xpath 模糊匹配 followers
            await page.waitForSelector('a[href$="/verified_followers"]', { timeout: 15000 }).catch(() => {
                // Ignore timeout, we will try to scrape anyway
            });

            // WHY: 抓取 followers 數量 (這部分極易因 X/Twitter 改版而失效)
            let followerCount = 'unknown';
            let extractSource = 'none';

            try {
                const followerElem = await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const followerLink = links.find(a => a.href.includes('/verified_followers') || a.href.includes('/followers'));
                    if (followerLink) return followerLink.textContent || '';
                    return '';
                });
                
                if (followerElem) {
                    const match = followerElem.replace(/,/g, '').match(/(\d+)/);
                    if (match) {
                        followerCount = match[1];
                        extractSource = 'DOM_Fallback';
                    }
                }
            } catch (e) {
                console.warn(`[twitter-browser] Failed to parse followers via DOM: ${e.message}`);
            }

            // WHY: 截圖作為不可否認的可視化證據
            const screenshot = await takeScreenshot(page, `twitter-${handle}`);

            // WHY: 嘗試使用 Vision AI 解析截圖
            const apiKey = process.env.OPENAI_API_KEY || ctx.options?.openaiApiKey;
            if (apiKey && screenshot && screenshot.path) {
                try {
                    const visionCount = await requestLlmVisionExtraction(apiKey, screenshot.path);
                    if (visionCount !== 'unknown') {
                        followerCount = visionCount;
                        extractSource = 'Vision_AI';
                    }
                } catch (e) {
                    console.warn(`[twitter-browser] Vision AI extraction failed: ${e.message}`);
                }
            }

            const items = [{
                type: EVIDENCE_TYPES.SOCIAL_METRIC,
                source: PROVIDER_SOURCES.TWITTER_BROWSER,
                title: `Twitter handle: @${handle}`,
                body: `Twitter profile followers: ${followerCount} (Source: ${extractSource}). Screenshot saved to ${screenshot.path}`,
                url: url,
                metadata: {
                    handle,
                    followerCount,
                    attachments: [screenshot]
                }
            }];

            return {
                items,
                counts: {
                    social_metrics: 1
                },
                links: {
                    twitter: [url]
                },
                metadata: {
                    handle,
                    followerCount,
                    attachments: [screenshot]
                }
            };
        } finally {
            if (page) await page.close();
            // WHY: 我們在 collect 中不呼叫 closeBrowser()，因為可能還有其他 browser task 併發執行
            // browser-runner 應該在全部流程結束時（例如 CLI 退出時）呼叫 closeBrowser
        }
    }
};

export default twitterBrowserProvider;

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 依賴 `ctx.options.twitterHandle` 作為目標
 *    - Twitter/X 在未登入狀態下仍能看到 profile 頁面的基本資訊（但極易被擋）
 *    - follower 解析邏輯非常脆弱，截圖是主要的可靠證據
 * 2. 潛在邊界情況：
 *    - 完全被擋在登入牆外，截圖會是登入畫面。
 *    - 無法獲取數字時 fallback 為 'unknown'，但至少有截圖。
 * 3. 模組依賴：
 *    - browser-runner.js
 */
