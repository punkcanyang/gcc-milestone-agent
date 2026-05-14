/**
 * __ai_context__
 * 模組角色：Browser Runner 基礎設施 — 包裝 Playwright 提供瀏覽器自動化能力
 * 系統位置：providers/index.js → 各 browser provider (如 twitter-browser.js) → [本模組]
 * 核心職責：
 *   1. 管理 Playwright browser 的生命週期 (launch, close)
 *   2. 提供反偵測配置 (User-Agent, Viewport) 的 Page
 *   3. 提供截圖功能，並將圖片保存到本地路徑，回傳可供 HTML 報告引用的相對路徑
 */

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

// WHY: 預設截圖儲存目錄
const SCREENSHOT_DIR = path.join(process.cwd(), 'reports', 'screenshots');

let browserInstance = null;

/**
 * WHY: 初始化 Playwright 瀏覽器實例（單例模式）
 * @returns {Promise<import('playwright').Browser>}
 */
export async function getBrowser() {
    if (!browserInstance) {
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled' // 反偵測
            ]
        });
    }
    return browserInstance;
}

/**
 * WHY: 關閉瀏覽器實例，應在所有收集任務結束後呼叫
 */
export async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}

// WHY: 註冊進程退出時的清理邏輯，防止瀏覽器實例洩漏
// 使用 process.once 確保只執行一次
process.once('exit', () => {
    if (browserInstance) {
        browserInstance.close().catch(() => {
            // 退出時忽略關閉錯誤
        });
    }
});

process.once('SIGINT', async () => {
    await closeBrowser();
    process.exit(0);
});

process.once('SIGTERM', async () => {
    await closeBrowser();
    process.exit(0);
});

/**
 * WHY: 建立具備基本反偵測設定的頁面
 * @returns {Promise<import('playwright').Page>}
 */
export async function createPage() {
    const browser = await getBrowser();
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        locale: 'en-US',
        timezoneId: 'UTC'
    });

    // WHY: 注入腳本隱藏 webdriver 標記，進一步反偵測
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    });

    const page = await context.newPage();
    return page;
}

/**
 * WHY: 確保截圖目錄存在
 */
async function ensureScreenshotDir() {
    try {
        await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

/**
 * WHY: 針對給定頁面進行截圖，並回傳可用於報告的 attachment 物件
 * @param {import('playwright').Page} page
 * @param {string} prefix - 檔案名前綴 (e.g. 'twitter')
 * @returns {Promise<{ type: string, path: string, url: string }>}
 */
export async function takeScreenshot(page, prefix = 'screenshot') {
    await ensureScreenshotDir();
    
    // WHY: 使用 UUID 避免檔名衝突
    const uuid = crypto.randomUUID().slice(0, 8);
    const filename = `${prefix}-${uuid}.png`;
    const absolutePath = path.join(SCREENSHOT_DIR, filename);
    
    // WHY: fullPage 截圖能保留更多證據上下文
    await page.screenshot({ path: absolutePath, fullPage: false });
    
    // WHY: 回傳相對路徑，讓 HTML 報告能夠正確引用（假設報告產出在 reports/ 目錄）
    // 如果報告產出在根目錄，相對路徑應該是 reports/screenshots/xxx.png
    return {
        type: 'image',
        path: absolutePath,
        url: `./reports/screenshots/${filename}`
    };
}

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - HTML 報告會被生成在與 `reports` 同級的目錄（例如根目錄的 `./report.html`）
 *    - 運行環境已經安裝了 playwright 的 chromium binary
 * 2. 潛在邊界情況：
 *    - 某些高度反爬的網站（如 Cloudflare 盾）可能仍會攔截，需要更高級的 stealth 插件
 *    - 若並發數量大，單例 browser 可能會消耗過多記憶體，需要 context 池化
 * 3. 模組依賴：
 *    - playwright
 */
