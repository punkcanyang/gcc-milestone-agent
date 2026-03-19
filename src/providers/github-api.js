/**
 * __ai_context__
 * 模組角色：GitHub REST API Evidence Provider — 從 GitHub API 收集 commits/PRs/issues/releases
 * 系統位置：providers/index.js → [本模組] → types.js
 * 核心職責：
 *   1. 呼叫 GitHub REST API 的 4 個端點收集原始資料
 *   2. 按時間窗口過濾
 *   3. 轉換為統一的 EvidenceItem 格式
 * 設計說明：從 milestone-check.js 的 collectEvidence 重構而來，保持行為完全一致
 */
import assert from 'node:assert';
import { EVIDENCE_TYPES, PROVIDER_SOURCES, githubFetchWithHeaders, makeTimeFilter } from './types.js';

const GITHUB_API = 'https://api.github.com';

// WHY: GitHub API 單次查詢上限，未實作分頁
const PAGE_SIZE_DEFAULT = 100;
const PAGE_SIZE_RELEASES = 30;
const MAX_PAGES = 10;

/**
 * WHY: 解析 GitHub API Link header 的 next 分頁 URL
 * @param {string|null} linkHeader
 * @returns {string|null}
 */
function extractNextLink(linkHeader) {
    if (!linkHeader) return null;
    const parts = linkHeader.split(',');
    for (const part of parts) {
        const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
        if (match && match[2] === 'next') {
            return match[1];
        }
    }
    return null;
}

/**
 * WHY: 按照 Link header 迭代抓取所有分頁資料
 * @param {string} initialUrl
 * @param {(url: string) => Promise<{ data: any, linkHeader: string|null }>} fetchPage
 * @param {{ maxPages?: number, resourceName?: string }} [options]
 * @returns {Promise<any[]>}
 */
async function fetchPaginatedArray(initialUrl, fetchPage, { maxPages = MAX_PAGES, resourceName = 'resource' } = {}) {
    const collected = [];
    let nextUrl = initialUrl;
    let pageCount = 0;

    while (nextUrl && pageCount < maxPages) {
        const { data, linkHeader } = await fetchPage(nextUrl);
        assert(Array.isArray(data), `Expected array from ${resourceName} API page, got ${typeof data}`);
        collected.push(...data);
        nextUrl = extractNextLink(linkHeader);
        pageCount += 1;
    }

    return collected;
}

/**
 * GitHub API provider 定義
 * @type {import('./types.js').ProviderDefinition}
 */
const githubApiProvider = {
    name: PROVIDER_SOURCES.GITHUB_API,

    types: [
        EVIDENCE_TYPES.COMMIT,
        EVIDENCE_TYPES.PULL,
        EVIDENCE_TYPES.ISSUE,
        EVIDENCE_TYPES.RELEASE
    ],

    /**
     * WHY: 從 GitHub REST API 收集 4 種類型的活動證據
     * 保持與原 collectEvidence 完全相同的行為和過濾邏輯
     *
     * @param {import('./types.js').CollectContext} ctx
     * @returns {Promise<import('./types.js').ProviderResult>}
     */
    async collect({ owner, name, sinceIso, token }) {
        const sinceQuery = sinceIso ? `&since=${encodeURIComponent(sinceIso)}` : '';
        const base = `${GITHUB_API}/repos/${owner}/${name}`;

        const fetchPage = async (url) => {
            const page = await githubFetchWithHeaders(url, token);
            return {
                data: page.data,
                linkHeader: page.headers.get('link')
            };
        };

        const [commitsRaw, pullsRaw, issuesRaw, releasesRaw] = await Promise.all([
            fetchPaginatedArray(
                `${base}/commits?per_page=${PAGE_SIZE_DEFAULT}${sinceQuery}`,
                fetchPage,
                { maxPages: MAX_PAGES, resourceName: 'commits' }
            ),
            fetchPaginatedArray(
                `${base}/pulls?state=all&sort=updated&direction=desc&per_page=${PAGE_SIZE_DEFAULT}`,
                fetchPage,
                { maxPages: MAX_PAGES, resourceName: 'pulls' }
            ),
            fetchPaginatedArray(
                `${base}/issues?state=all&sort=updated&direction=desc&per_page=${PAGE_SIZE_DEFAULT}`,
                fetchPage,
                { maxPages: MAX_PAGES, resourceName: 'issues' }
            ),
            fetchPaginatedArray(
                `${base}/releases?per_page=${PAGE_SIZE_RELEASES}`,
                fetchPage,
                { maxPages: MAX_PAGES, resourceName: 'releases' }
            )
        ]);

        const inWindow = makeTimeFilter(sinceIso);

        const commits = commitsRaw.filter((c) => inWindow(c?.commit?.author?.date));
        const pulls = pullsRaw.filter((p) => inWindow(p?.updated_at));
        const issues = issuesRaw
            .filter((i) => !i.pull_request)
            .filter((i) => inWindow(i?.updated_at));
        const releases = releasesRaw.filter((r) => inWindow(r?.published_at || r?.created_at));

        const source = PROVIDER_SOURCES.GITHUB_API;

        const items = [
            ...commits.map((c) => ({
                type: EVIDENCE_TYPES.COMMIT,
                source,
                title: c?.commit?.message || '',
                body: '',
                url: c.html_url
            })),
            ...pulls.map((p) => ({
                type: EVIDENCE_TYPES.PULL,
                source,
                title: p.title || '',
                body: p.body || '',
                url: p.html_url
            })),
            ...issues.map((i) => ({
                type: EVIDENCE_TYPES.ISSUE,
                source,
                title: i.title || '',
                body: i.body || '',
                url: i.html_url
            })),
            ...releases.map((r) => ({
                type: EVIDENCE_TYPES.RELEASE,
                source,
                title: r.name || r.tag_name || '',
                body: r.body || '',
                url: r.html_url
            }))
        ];

        const counts = {
            commits: commits.length,
            pulls: pulls.length,
            issues: issues.length,
            releases: releases.length
        };

        const links = {
            commits: commits.slice(0, 5).map((c) => c.html_url),
            pulls: pulls.slice(0, 5).map((p) => p.html_url),
            issues: issues.slice(0, 5).map((i) => i.html_url),
            releases: releases.slice(0, 5).map((r) => r.html_url)
        };

        return {
            items,
            counts,
            links,
            metadata: {
                pageSizeDefault: PAGE_SIZE_DEFAULT,
                pageSizeReleases: PAGE_SIZE_RELEASES,
                maxPages: MAX_PAGES
            }
        };
    }
};

export default githubApiProvider;

export const _internal = {
    extractNextLink,
    fetchPaginatedArray,
    MAX_PAGES
};

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 行為與原 milestone-check.js 的 collectEvidence 完全一致
 *    - `since` 參數僅在 commits API 做 server-side 過濾，其他 3 個端點為 client-side
 *    - issues API 回傳中包含 PR（透過 pull_request 欄位過濾）
 * 2. 潛在邊界情況：
 *    - 單次查詢上限 100/30，超過時數據截斷
 *    - metadata 中保存了 pageSize 以供報告標記截斷
 * 3. 模組依賴：
 *    - types.js（githubFetch, makeTimeFilter, EVIDENCE_TYPES, PROVIDER_SOURCES）
 */
