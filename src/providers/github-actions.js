/**
 * __ai_context__
 * 模組角色：GitHub Actions Evidence Provider — 收集 CI/CD workflow runs 狀態
 * 系統位置：providers/index.js → [本模組] → types.js
 * 核心職責：
 *   1. 呼叫 GitHub Actions API 取得最近的 workflow runs
 *   2. 計算成功率、最近一次運行狀態
 *   3. 轉換為 EvidenceItem 格式
 */
import assert from 'node:assert';
import { EVIDENCE_TYPES, PROVIDER_SOURCES, githubFetch, makeTimeFilter } from './types.js';

const GITHUB_API = 'https://api.github.com';
const PAGE_SIZE = 50;

/**
 * @type {import('./types.js').ProviderDefinition}
 */
const githubActionsProvider = {
    name: PROVIDER_SOURCES.GITHUB_ACTIONS,
    types: [EVIDENCE_TYPES.CI_RUN],

    /**
     * WHY: 收集 GitHub Actions workflow runs 作為 CI/CD 健康度的證據
     * 計算成功率和最近運行狀態，讓規則引擎可以匹配 CI 相關關鍵字
     */
    async collect({ owner, name, sinceIso, token }) {
        const base = `${GITHUB_API}/repos/${owner}/${name}`;
        const runsRaw = await githubFetch(
            `${base}/actions/runs?per_page=${PAGE_SIZE}&status=completed`,
            token
        );

        // WHY: Actions API 回傳 { total_count, workflow_runs: [...] } 結構
        assert(
            runsRaw && Array.isArray(runsRaw.workflow_runs),
            `Expected workflow_runs array from Actions API, got ${typeof runsRaw?.workflow_runs}`
        );

        const inWindow = makeTimeFilter(sinceIso);
        const runs = runsRaw.workflow_runs.filter((r) => inWindow(r?.created_at));

        const successCount = runs.filter((r) => r.conclusion === 'success').length;
        const failureCount = runs.filter((r) => r.conclusion === 'failure').length;
        const successRate = runs.length > 0 ? Math.round((successCount / runs.length) * 100) : 0;

        const source = PROVIDER_SOURCES.GITHUB_ACTIONS;

        const items = runs.slice(0, 20).map((r) => ({
            type: EVIDENCE_TYPES.CI_RUN,
            source,
            title: `${r.name || 'Workflow'}: ${r.conclusion || 'unknown'}`,
            body: `Workflow "${r.name}" run #${r.run_number} — ${r.conclusion} (${r.head_branch})`,
            url: r.html_url,
            metadata: {
                status: r.conclusion,
                branch: r.head_branch,
                runNumber: r.run_number
            }
        }));

        return {
            items,
            counts: { ci_runs: runs.length },
            links: { ci_runs: runs.slice(0, 5).map((r) => r.html_url) },
            metadata: {
                totalRuns: runs.length,
                successCount,
                failureCount,
                successRate
            }
        };
    }
};

export default githubActionsProvider;

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 僅收集 completed 狀態的 runs（排除 in_progress/queued）
 *    - 最多取前 50 次 runs，轉換為 items 時截斷前 20 條
 * 2. 潛在邊界情況：
 *    - 沒有 GitHub Actions 的 repo 會回傳空陣列（不會拋錯）
 *    - 需要 repo 層級的 actions 讀取權限
 * 3. 模組依賴：
 *    - types.js（githubFetch, makeTimeFilter, EVIDENCE_TYPES, PROVIDER_SOURCES）
 */
