/**
 * __ai_context__
 * 模組角色：文章內容爬蟲 Provider (Article Crawler)
 * 系統位置：providers/index.js → [本模組] → browser-runner.js
 * 核心職責：
 *   1. 透過無頭瀏覽器訪問指定的文章網址 (如 Medium, Mirror, Notion)
 *   2. 抓取網頁純文字 (document.body.innerText) 供語義引擎分析
 *   3. 截圖存檔作為可視化證據
 * 設計說明：使用 Playwright 而非純 HTTP GET，以確保動態渲染網頁能正確抓取
 */

import { EVIDENCE_TYPES, PROVIDER_SOURCES } from './types.js';
import { createPage, takeScreenshot } from './browser-runner.js';

// WHY: 限制文章抓取的字數，避免撐爆 LLM 的 Context Window
const MAX_CONTENT_LENGTH = 3000;

/**
 * @type {import('./types.js').ProviderDefinition}
 */
const articleCrawlerProvider = {
    name: PROVIDER_SOURCES.ARTICLE_CRAWLER,
    types: [EVIDENCE_TYPES.CONTENT_ARTICLE],

    async collect(ctx) {
        const urls = ctx.options?.articleUrls || [];
        if (!urls.length) {
            return { items: [], counts: {}, links: {} };
        }

        const items = [];
        const links = { articles: [] };
        let successfulCrawls = 0;

        // WHY: 並行爬取多個文章，提升效率
        // 使用 Promise.allSettled 確保單個失敗不影響其他
        const results = await Promise.allSettled(
            urls.map(async (url) => {
                let page = null;
                try {
                    page = await createPage();
                    
                    // WHY: 允許較長的超時時間，以應付載入緩慢的去中心化寫作平台
                    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

                    // 移除一些干擾語義判斷的常見雜訊標籤 (script, style, nav, footer)
                    await page.evaluate(() => {
                        const selectorsToRemove = ['script', 'style', 'nav', 'footer', 'header', 'aside'];
                        selectorsToRemove.forEach(sel => {
                            document.querySelectorAll(sel).forEach(el => el.remove());
                        });
                    });

                    // 抓取純文字
                    let innerText = await page.evaluate(() => document.body.innerText || '');
                    
                    // 清理多餘的空白和換行
                    innerText = innerText.replace(/\n\s*\n/g, '\n\n').trim();
                    
                    // 截斷文字
                    if (innerText.length > MAX_CONTENT_LENGTH) {
                        innerText = innerText.substring(0, MAX_CONTENT_LENGTH) + '\n... [Content Truncated]';
                    }

                    // 取得頁面標題
                    const title = await page.title() || 'Untitled Article';

                    // WHY: 截圖作為人類審查的視覺輔助
                    const safeName = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
                    const screenshot = await takeScreenshot(page, `article-${safeName}`);

                    return {
                        success: true,
                        item: {
                            type: EVIDENCE_TYPES.CONTENT_ARTICLE,
                            source: PROVIDER_SOURCES.ARTICLE_CRAWLER,
                            title: `Article Crawled: ${title}`,
                            // WHY: 將截取的純文字放進 body 中，這樣 semantic evaluation 就能對其進行關鍵字或 LLM 分析
                            body: `Source URL: ${url}\n\n${innerText}`,
                            url: url,
                            metadata: {
                                contentLength: innerText.length,
                                attachments: [screenshot]
                            }
                        },
                        url
                    };
                } catch (error) {
                    console.warn(`[article-crawler] Failed to crawl ${url}: ${error.message}`);
                    return {
                        success: false,
                        item: {
                            type: EVIDENCE_TYPES.CONTENT_ARTICLE,
                            source: PROVIDER_SOURCES.ARTICLE_CRAWLER,
                            title: `Failed to Crawl Article`,
                            body: `Could not load or parse content from ${url}. Error: ${error.message}`,
                            url: url,
                            metadata: { error: error.message }
                        },
                        url
                    };
                } finally {
                    if (page) await page.close();
                }
            })
        );

        // WHY: 收集所有結果，無論成功或失敗
        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { success, item, url } = result.value;
                items.push(item);
                if (success) {
                    links.articles.push(url);
                    successfulCrawls++;
                }
            }
        }

        return {
            items,
            counts: {
                content_articles: successfulCrawls
            },
            links,
            metadata: {
                attempted: urls.length,
                successful: successfulCrawls
            }
        };
    }
};

export default articleCrawlerProvider;

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 網頁的純文字內容 (`innerText`) 足以反映文章的語義，且去除 nav/footer 後雜訊夠低。
 *    - 3000 字上限對大多數 milestone 驗證（如教學文章、上線公告）已足夠，並能控制 LLM token 開銷。
 * 2. 潛在邊界情況：
 *    - 遇到需要登入或訂閱牆 (Paywall) 的文章（如 Patreon, Substack 付費區），只會抓到提示文字。
 *    - 網路錯誤會導致抓取失敗，此時產生 fallback EvidenceItem。
 * 3. 模組依賴：
 *    - browser-runner.js (Playwright)
 */
