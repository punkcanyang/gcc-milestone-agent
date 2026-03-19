/**
 * __ai_context__
 * 模組角色：Provider 系統的類型定義與共用工具函數
 * 系統位置：所有 provider 和 milestone-check.js 共同依賴的基礎模組
 * 核心職責：
 *   1. 定義 EvidenceItem、CollectContext、ProviderResult 的 JSDoc 類型
 *   2. 提供共用的 HTTP fetch 工具（含重試邏輯）
 *   3. 定義所有合法的 evidence type 和 source 列舉
 */

// --- 合法的 evidence type 列舉 ---
// WHY: 集中管理避免各 provider 各自定義導致不一致
export const EVIDENCE_TYPES = {
    COMMIT: 'commit',
    PULL: 'pull',
    ISSUE: 'issue',
    RELEASE: 'release',
    CI_RUN: 'ci_run',
    COMMUNITY_METRIC: 'community_metric',
    PACKAGE: 'package',
    URL_CHECK: 'url_check'
};

// --- 合法的 provider source 列舉 ---
export const PROVIDER_SOURCES = {
    GITHUB_API: 'github-api',
    GITHUB_ACTIONS: 'github-actions',
    GITHUB_COMMUNITY: 'github-community',
    NPM_REGISTRY: 'npm-registry',
    URL_CHECKER: 'url-checker'
};

/**
 * @typedef {Object} EvidenceItem
 * @property {string} type - 證據類型（見 EVIDENCE_TYPES）
 * @property {string} source - 提供此證據的 provider 名稱（見 PROVIDER_SOURCES）
 * @property {string} title - 證據標題
 * @property {string} body - 證據內容
 * @property {string} url - 證據連結
 * @property {Object} [metadata] - provider 特有的附加資訊
 */

/**
 * @typedef {Object} CollectContext
 * @property {string} owner - GitHub repo owner
 * @property {string} name - GitHub repo name
 * @property {string|null} sinceIso - ISO 日期過濾（可選）
 * @property {string|null} token - GitHub/API token（可選）
 * @property {Object} [options] - provider 特有選項
 */

/**
 * @typedef {Object} ProviderResult
 * @property {EvidenceItem[]} items - 收集到的證據項目
 * @property {Record<string, number>} counts - 各類型的數量統計
 * @property {Record<string, string[]>} links - 各類型的樣本連結（最多 5 個）
 * @property {Object} [metadata] - provider 特有的附加資訊
 */

/**
 * @typedef {Object} ProviderDefinition
 * @property {string} name - Provider 唯一識別名稱
 * @property {string[]} types - 此 provider 支援的 evidence type 清單
 * @property {function(CollectContext): Promise<ProviderResult>} collect - 收集函數
 */

// --- 共用 HTTP 工具 ---

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * WHY: 帶重試的 HTTP JSON fetch，供所有需要呼叫外部 API 的 provider 共用
 * 支援 429 rate limit 和 5xx server error 的自動重試
 *
 * @param {string} url - 請求 URL
 * @param {Object} [options] - fetch 選項
 * @param {Record<string, string>} [options.headers] - 額外 headers
 * @param {number} [options.retries] - 最大重試次數（預設 2）
 * @returns {Promise<any>} - 解析後的 JSON
 */
export async function fetchWithRetry(url, { headers = {}, retries = 2 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const res = await fetch(url, { headers });
            if (res.ok) return res.json();

            const body = await res.text();
            const retriable = res.status >= 500 || res.status === 429;
            if (!retriable || attempt === retries) {
                throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
            }
            const retryAfter = Number(res.headers.get('retry-after') || '0');
            // WHY: 括號明確表達意圖 — 優先使用 retry-after，否則使用遞增退避
            await sleep((retryAfter || (1 + attempt)) * 1000);
        } catch (error) {
            if (attempt === retries) throw error;
            await sleep((attempt + 1) * 1000);
        }
    }

    throw new Error('Unexpected fetchWithRetry flow');
}

/**
 * WHY: GitHub API 專用的 fetch 包裝，自動添加認證和 User-Agent headers
 * 多個 GitHub provider 共用此函數
 *
 * @param {string} url - GitHub API URL
 * @param {string|null} token - GitHub PAT（可選）
 * @param {number} [retries] - 最大重試次數
 * @returns {Promise<any>}
 */
export async function githubFetch(url, token, retries = 2) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'gcc-milestone-agent'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetchWithRetry(url, { headers, retries });
}

/**
 * WHY: 需要讀取 GitHub API response headers（例如 Link 分頁頭）
 * 這個函數返回 JSON 與 headers，供分頁 provider 使用
 *
 * @param {string} url - GitHub API URL
 * @param {string|null} token - GitHub PAT（可選）
 * @param {number} [retries] - 最大重試次數
 * @returns {Promise<{ data: any, headers: Headers }>}
 */
export async function githubFetchWithHeaders(url, token, retries = 2) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'gcc-milestone-agent'
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const res = await fetch(url, { headers });
            if (res.ok) {
                const data = await res.json();
                return { data, headers: res.headers };
            }

            const body = await res.text();
            const retriable = res.status >= 500 || res.status === 429;
            if (!retriable || attempt === retries) {
                throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
            }
            const retryAfter = Number(res.headers.get('retry-after') || '0');
            await sleep((retryAfter || (1 + attempt)) * 1000);
        } catch (error) {
            if (attempt === retries) throw error;
            await sleep((attempt + 1) * 1000);
        }
    }

    throw new Error('Unexpected githubFetchWithHeaders flow');
}

/**
 * WHY: 時間窗口過濾器，多個 provider 需要過濾 since 日期之後的資料
 *
 * @param {string|null} sinceIso - ISO 日期字串
 * @returns {function(string|null): boolean}
 */
export function makeTimeFilter(sinceIso) {
    const sinceTs = sinceIso ? new Date(sinceIso).getTime() : null;
    return (dateText) => {
        if (!sinceTs) return true;
        if (!dateText) return false;
        return new Date(dateText).getTime() >= sinceTs;
    };
}

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 所有 provider 必須返回符合 ProviderResult 結構的結果
 *    - EvidenceItem.source 必須使用 PROVIDER_SOURCES 中的值
 *    - fetchWithRetry 假設所有 API 回傳 JSON 格式
 * 2. 潛在邊界情況：
 *    - fetchWithRetry 不處理 non-JSON responses（如 HTML error pages）
 *    - githubFetch 在 token 為空字串時不會添加 Authorization header
 *    - makeTimeFilter 使用 Date 解析，可能受時區影響
 * 3. 模組依賴：
 *    - 無外部依賴，是所有 provider 的基礎模組
 */
