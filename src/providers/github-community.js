/**
 * __ai_context__
 * 模組角色：GitHub Community Evidence Provider — 收集社群活躍度指標
 * 系統位置：providers/index.js → [本模組] → types.js
 * 核心職責：
 *   1. 從 repo metadata 取得 stars/forks/watchers
 *   2. 取得 contributors 列表
 *   3. 生成社群健康度的 EvidenceItem
 */
import assert from 'node:assert';
import { EVIDENCE_TYPES, PROVIDER_SOURCES, githubFetch } from './types.js';

const GITHUB_API = 'https://api.github.com';

/**
 * @type {import('./types.js').ProviderDefinition}
 */
const githubCommunityProvider = {
    name: PROVIDER_SOURCES.GITHUB_COMMUNITY,
    types: [EVIDENCE_TYPES.COMMUNITY_METRIC],

    /**
     * WHY: 社群指標反映項目是否有真實使用者和協作者
     * stars/forks 反映關注度，contributors 反映實際參與度
     */
    async collect({ owner, name, token }) {
        const base = `${GITHUB_API}/repos/${owner}/${name}`;

        const [repoData, contributorsRaw] = await Promise.all([
            githubFetch(base, token),
            githubFetch(`${base}/contributors?per_page=100`, token)
        ]);

        // WHY: repo endpoint 回傳 object，contributors 回傳 array
        assert(repoData && typeof repoData === 'object', `Expected object from repo API, got ${typeof repoData}`);
        assert(Array.isArray(contributorsRaw), `Expected array from contributors API, got ${typeof contributorsRaw}`);

        const stars = repoData.stargazers_count || 0;
        const forks = repoData.forks_count || 0;
        const watchers = repoData.subscribers_count || 0;
        const openIssues = repoData.open_issues_count || 0;
        const contributorCount = contributorsRaw.length;
        const description = repoData.description || '';
        const hasWiki = repoData.has_wiki || false;
        const hasPages = repoData.has_pages || false;

        const source = PROVIDER_SOURCES.GITHUB_COMMUNITY;

        // WHY: 將各社群指標轉為 EvidenceItem，使規則引擎可以匹配社群相關關鍵字
        const items = [
            {
                type: EVIDENCE_TYPES.COMMUNITY_METRIC,
                source,
                title: `Repository: ${stars} stars, ${forks} forks, ${contributorCount} contributors`,
                body: `${description}\nWatchers: ${watchers}, Open issues: ${openIssues}, Wiki: ${hasWiki}, Pages: ${hasPages}`,
                url: repoData.html_url || `https://github.com/${owner}/${name}`,
                metadata: { stars, forks, watchers, contributorCount, openIssues, hasWiki, hasPages }
            }
        ];

        // WHY: 加入 top contributors 作為額外證據項目
        const topContributors = contributorsRaw.slice(0, 5);
        for (const c of topContributors) {
            items.push({
                type: EVIDENCE_TYPES.COMMUNITY_METRIC,
                source,
                title: `Contributor: ${c.login} (${c.contributions} contributions)`,
                body: `contributor ${c.login} with ${c.contributions} commits`,
                url: c.html_url || `https://github.com/${c.login}`,
                metadata: { login: c.login, contributions: c.contributions }
            });
        }

        return {
            items,
            counts: {
                community_metrics: 1,
                contributors: contributorCount
            },
            links: {
                repository: [repoData.html_url || `https://github.com/${owner}/${name}`],
                contributors: topContributors.slice(0, 5).map((c) => c.html_url || `https://github.com/${c.login}`)
            },
            metadata: { stars, forks, watchers, contributorCount, openIssues }
        };
    }
};

export default githubCommunityProvider;

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - repo endpoint 不需要 since 過濾（社群指標是累計值）
 *    - contributors API 最多回傳 100 位（無分頁）
 *    - subscribers_count 才是真正的 "watchers"（GitHub API 名稱混淆）
 * 2. 潛在邊界情況：
 *    - 私有 repo 沒有 token 時會 403
 *    - 空 repo（無 commits）的 contributors 可能回傳空陣列
 * 3. 模組依賴：
 *    - types.js（githubFetch, EVIDENCE_TYPES, PROVIDER_SOURCES）
 */
