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
import { EVIDENCE_TYPES, PROVIDER_SOURCES, githubFetch, makeTimeFilter } from './types.js';

const GITHUB_API = 'https://api.github.com';

// WHY: GitHub API 單次查詢上限，未實作分頁
const PAGE_SIZE_DEFAULT = 100;
const PAGE_SIZE_RELEASES = 30;

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

        const [commitsRaw, pullsRaw, issuesRaw, releasesRaw] = await Promise.all([
            githubFetch(`${base}/commits?per_page=${PAGE_SIZE_DEFAULT}${sinceQuery}`, token),
            githubFetch(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=${PAGE_SIZE_DEFAULT}`, token),
            githubFetch(`${base}/issues?state=all&sort=updated&direction=desc&per_page=${PAGE_SIZE_DEFAULT}`, token),
            githubFetch(`${base}/releases?per_page=${PAGE_SIZE_RELEASES}`, token)
        ]);

        // WHY: 防禦性斷言 — GitHub API 在 repo 不存在或認證失敗時可能回傳 object 而非 array
        assert(Array.isArray(commitsRaw), `Expected array from commits API, got ${typeof commitsRaw}`);
        assert(Array.isArray(pullsRaw), `Expected array from pulls API, got ${typeof pullsRaw}`);
        assert(Array.isArray(issuesRaw), `Expected array from issues API, got ${typeof issuesRaw}`);
        assert(Array.isArray(releasesRaw), `Expected array from releases API, got ${typeof releasesRaw}`);

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
                pageSizeReleases: PAGE_SIZE_RELEASES
            }
        };
    }
};

export default githubApiProvider;

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
