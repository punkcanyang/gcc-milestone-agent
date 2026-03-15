/**
 * __ai_context__
 * 模組角色：URL Checker Evidence Provider — 驗證 README 中的外部連結可達性
 * 系統位置：providers/index.js → [本模組] → types.js
 * 核心職責：
 *   1. 從 GitHub 取得 README 內容
 *   2. 提取其中的 HTTP/HTTPS URL
 *   3. 以 HEAD 請求檢查 URL 是否可達
 */
import { EVIDENCE_TYPES, PROVIDER_SOURCES, githubFetch } from './types.js';

const GITHUB_API = 'https://api.github.com';

// WHY: 限制最大檢查 URL 數量，避免對外部服務造成過多請求
const MAX_URLS_TO_CHECK = 10;

// WHY: URL 檢查的超時時間（毫秒）
const URL_CHECK_TIMEOUT_MS = 5000;

/**
 * WHY: 從 markdown 文本中提取 HTTP/HTTPS URL
 * 排除 GitHub API URL 和已知的非有效 demo URL（如 shields.io badge）
 */
function extractUrls(text) {
    const urlPattern = /https?:\/\/[^\s)<>"']+/gi;
    const matches = text.match(urlPattern) || [];

    // WHY: 排除不需要檢查的 URL 模式
    const excludePatterns = [
        /api\.github\.com/,           // GitHub API 端點
        /img\.shields\.io/,           // badge 圖片
        /badge\./,                    // badge 服務
        /github\.com\/.*\/actions/,   // GitHub Actions 頁面
        /github\.com\/.*\/blob\//     // GitHub 文件連結（API 可能 403）
    ];

    return [...new Set(matches)]
        .filter((url) => !excludePatterns.some((p) => p.test(url)))
        .slice(0, MAX_URLS_TO_CHECK);
}

/**
 * WHY: 以 HEAD 請求檢查 URL 是否可達，使用 AbortController 實現超時
 * HEAD 比 GET 更輕量，不下載 body
 */
async function checkUrl(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'gcc-milestone-agent' }
        });
        clearTimeout(timeout);
        return { url, reachable: res.ok, httpStatus: res.status };
    } catch (error) {
        clearTimeout(timeout);
        return { url, reachable: false, httpStatus: 0, error: error.message };
    }
}

/**
 * @type {import('./types.js').ProviderDefinition}
 */
const urlCheckerProvider = {
    name: PROVIDER_SOURCES.URL_CHECKER,
    types: [EVIDENCE_TYPES.URL_CHECK],

    /**
     * WHY: 驗證項目是否有可達的外部連結（如官網、demo URL），
     * 反映項目的線上存在和可驗證性
     */
    async collect({ owner, name, token }) {
        const source = PROVIDER_SOURCES.URL_CHECKER;

        // Step 1: 取得 README 內容
        let readmeText = '';
        try {
            const readmeData = await githubFetch(
                `${GITHUB_API}/repos/${owner}/${name}/readme`,
                token
            );
            if (readmeData && readmeData.content) {
                readmeText = Buffer.from(readmeData.content, 'base64').toString('utf8');
            }
        } catch {
            // WHY: 沒有 README 的 repo，回傳空結果
            return {
                items: [],
                counts: { url_checks: 0 },
                links: {},
                metadata: { reason: 'No README found' }
            };
        }

        // Step 2: 提取 URL
        const urls = extractUrls(readmeText);
        if (urls.length === 0) {
            return {
                items: [],
                counts: { url_checks: 0 },
                links: {},
                metadata: { reason: 'No external URLs found in README' }
            };
        }

        // Step 3: 並行檢查 URL 可達性
        const results = await Promise.all(urls.map(checkUrl));

        const reachableCount = results.filter((r) => r.reachable).length;
        const reachableRate = Math.round((reachableCount / results.length) * 100);

        const items = results.map((r) => ({
            type: EVIDENCE_TYPES.URL_CHECK,
            source,
            title: `URL ${r.reachable ? '✅' : '❌'}: ${r.url}`,
            body: `link url ${r.reachable ? 'reachable' : 'unreachable'} (HTTP ${r.httpStatus})`,
            url: r.url,
            metadata: {
                reachable: r.reachable,
                httpStatus: r.httpStatus
            }
        }));

        return {
            items,
            counts: {
                url_checks: results.length,
                urls_reachable: reachableCount
            },
            links: {
                reachable_urls: results.filter((r) => r.reachable).slice(0, 5).map((r) => r.url)
            },
            metadata: {
                totalChecked: results.length,
                reachableCount,
                reachableRate
            }
        };
    }
};

export default urlCheckerProvider;
export { extractUrls as _extractUrls };

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 僅檢查 README 中的 URL（不含 docs/ 或其他文件）
 *    - HEAD 請求夠用（某些 CDN 不支援 HEAD 可能誤報）
 *    - 超時 5 秒足以區分正常和不可達的 URL
 * 2. 潛在邊界情況：
 *    - 某些網站 block HEAD 請求但支援 GET（會被誤判為不可達）
 *    - URL 末尾的 markdown 符號（如 `)` 或 `]`）可能被包含
 *    - README 可能是非英文的（URL 提取模式不受影響）
 * 3. 模組依賴：
 *    - types.js（githubFetch, EVIDENCE_TYPES, PROVIDER_SOURCES）
 */
