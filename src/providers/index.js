/**
 * __ai_context__
 * 模組角色：Provider 註冊表，管理所有可用的 Evidence Provider
 * 系統位置：milestone-check.js → [本模組] → 各 provider 模組
 * 核心職責：
 *   1. 註冊所有內建 provider
 *   2. 提供按名稱查找 provider 的功能
 *   3. 匯總多個 provider 的結果為統一格式
 */
import assert from 'node:assert';
import githubApiProvider from './github-api.js';
import githubActionsProvider from './github-actions.js';
import githubCommunityProvider from './github-community.js';
import npmRegistryProvider from './npm-registry.js';
import urlCheckerProvider from './url-checker.js';
import githubDiscussionsProvider from './github-discussions.js';
import twitterBrowserProvider from './twitter-browser.js';
import etherscanApiProvider from './etherscan-api.js';
import articleCrawlerProvider from './article-crawler.js';
import discordApiProvider from './discord-api.js';

// --- 內建 provider 註冊表 ---
// WHY: 集中管理所有 provider，新增 provider 只需在此處 import 並加入 registry
const BUILTIN_PROVIDERS = [
    githubApiProvider,
    githubActionsProvider,
    githubCommunityProvider,
    npmRegistryProvider,
    urlCheckerProvider,
    githubDiscussionsProvider,
    twitterBrowserProvider,
    etherscanApiProvider,
    articleCrawlerProvider,
    discordApiProvider
];

const providerMap = new Map(BUILTIN_PROVIDERS.map((p) => [p.name, p]));

/**
 * 取得所有已註冊的 provider 名稱
 * @returns {string[]}
 */
export function getAvailableProviders() {
    return [...providerMap.keys()];
}

/**
 * 按名稱查找 provider
 * @param {string} name
 * @returns {import('./types.js').ProviderDefinition}
 */
export function getProvider(name) {
    const provider = providerMap.get(name);
    if (!provider) {
        const available = getAvailableProviders().join(', ');
        throw new Error(`Unknown provider: "${name}". Available: ${available}`);
    }
    return provider;
}

/**
 * WHY: 匯總多個 provider 的收集結果為統一格式
 * 不同 provider 的 items 會合併，counts 和 links 會按 provider 分組
 *
 * @param {string[]} providerNames - 要啟用的 provider 名稱清單
 * @param {import('./types.js').CollectContext} ctx - 收集上下文
 * @returns {Promise<{ items: import('./types.js').EvidenceItem[], counts: Record<string, Record<string, number>>, links: Record<string, Record<string, string[]>>, providerMeta: Record<string, Object> }>}
 */
export async function collectFromProviders(providerNames, ctx) {
    assert(Array.isArray(providerNames) && providerNames.length > 0, 'At least one provider name required');

    const providers = providerNames.map((name) => getProvider(name));

    // WHY: 所有 provider 並行收集，提升效率
    const results = await Promise.all(
        providers.map(async (p) => {
            try {
                const result = await p.collect(ctx);
                return { name: p.name, result, error: null };
            } catch (error) {
                // WHY: 單個 provider 失敗不應阻塞其他 provider
                return { name: p.name, result: null, error };
            }
        })
    );

    const allItems = [];
    const allCounts = {};
    const allLinks = {};
    const providerMeta = {};
    const errors = [];

    for (const { name, result, error } of results) {
        if (error) {
            errors.push({ provider: name, message: error.message });
            continue;
        }
        allItems.push(...result.items);
        allCounts[name] = result.counts;
        allLinks[name] = result.links;
        if (result.metadata) {
            providerMeta[name] = result.metadata;
        }
    }

    return {
        items: allItems,
        counts: allCounts,
        links: allLinks,
        providerMeta,
        errors
    };
}

// WHY: 向下相容 — 提供一個函數將新的多 provider 結果轉換為舊的 flat 格式
// 用於過渡期間，讓 scoreEvidence 和報告生成不需要大幅重構
export function flattenCounts(multiCounts) {
    const flat = { commits: 0, pulls: 0, issues: 0, releases: 0 };
    for (const providerCounts of Object.values(multiCounts)) {
        for (const [key, val] of Object.entries(providerCounts)) {
            if (key in flat) {
                flat[key] += val;
            }
        }
    }
    return flat;
}

export function flattenLinks(multiLinks) {
    const flat = { commits: [], pulls: [], issues: [], releases: [] };
    for (const providerLinks of Object.values(multiLinks)) {
        for (const [key, urls] of Object.entries(providerLinks)) {
            if (key in flat) {
                flat[key].push(...urls);
            }
        }
    }
    // WHY: 去重並截斷為 5 條，保持報告簡潔
    for (const key of Object.keys(flat)) {
        flat[key] = [...new Set(flat[key])].slice(0, 5);
    }
    return flat;
}

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 新增 provider 只需 import 並加入 BUILTIN_PROVIDERS 陣列
 *    - 單個 provider 失敗不會阻塞其他 provider（graceful degradation）
 *    - flattenCounts/flattenLinks 為過渡方案，Phase 3 可能重構
 * 2. 潛在邊界情況：
 *    - 所有 provider 都失敗時 items 為空陣列（不會拋錯）
 *    - flattenCounts 只合併已知的 4 個 key，新類型需手動擴展
 * 3. 模組依賴：
 *    - github-api.js（預設 provider）
 *    - 未來新增的 provider 也在此處 import
 */
