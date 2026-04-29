/**
 * __ai_context__
 * 模組角色：GitHub Discussions Evidence Provider — 收集社區討論活躍度指標
 * 系統位置：providers/index.js → [本模組] → types.js
 * 核心職責：
 *   1. 透過 GitHub GraphQL API 取得 Discussions 統計
 *   2. 收集討論數量、已回答數量、參與者等
 *   3. 生成社區討論健康度的 EvidenceItem
 */
import assert from 'node:assert';
import { EVIDENCE_TYPES, PROVIDER_SOURCES, fetchWithRetry } from './types.js';

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

/**
 * WHY: 每次抓取的 discussions 數量上限
 * GraphQL API 單次最多 100，我們取 50 保持效率
 */
const DISCUSSIONS_PER_PAGE = 50;

/**
 * WHY: 最多抓取的 top 討論者數量，用於展示社區活躍度
 */
const MAX_TOP_PARTICIPANTS = 10;

/**
 * WHY: 構建 GraphQL 查詢字串
 * 需要分別查詢總數、已回答數、以及最近討論的明細
 *
 * @param {string} owner - repo owner
 * @param {string} name - repo name
 * @returns {string} - GraphQL query
 */
function buildDiscussionsQuery(owner, name) {
    return `
    query {
      repository(owner: "${owner}", name: "${name}") {
        discussions(first: ${DISCUSSIONS_PER_PAGE}, orderBy: {field: UPDATED_AT, direction: DESC}) {
          totalCount
          nodes {
            title
            url
            createdAt
            updatedAt
            answerChosenAt
            author {
              login
            }
            comments {
              totalCount
            }
            labels(first: 5) {
              nodes {
                name
              }
            }
          }
        }
        # WHY: 單獨查詢已回答的數量，用於計算回答率
        answeredDiscussions: discussions(answered: true) {
          totalCount
        }
        # WHY: 單獨查詢未回答的數量
        unansweredDiscussions: discussions(answered: false) {
          totalCount
        }
      }
    }
  `;
}

/**
 * WHY: 從 GraphQL 結果中提取 unique 參與者並排序
 * 用於展示社區中最活躍的討論參與者
 *
 * @param {Array<{author: {login: string}|null, comments: {totalCount: number}}>} discussions
 * @returns {Array<{login: string, discussionCount: number}>}
 */
function extractTopParticipants(discussions) {
    /** @type {Map<string, number>} */
    const participantMap = new Map();

    for (const discussion of discussions) {
        const login = discussion.author?.login;
        if (!login) continue;

        const currentCount = participantMap.get(login) || 0;
        participantMap.set(login, currentCount + 1);
    }

    // WHY: 按討論數量降序排列，取 top N
    const sorted = [...participantMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOP_PARTICIPANTS);

    return sorted.map(([login, discussionCount]) => ({
        login,
        discussionCount
    }));
}

/**
 * WHY: 執行 GraphQL 請求
 * GitHub GraphQL API 需要 POST 請求，與 REST API 的 GET 不同
 *
 * @param {string} query - GraphQL query string
 * @param {string|null} token - GitHub PAT
 * @returns {Promise<any>} - GraphQL response data
 */
async function executeGraphQL(query, token) {
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'gcc-milestone-agent'
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchWithRetry(GITHUB_GRAPHQL, {
        headers,
        // WHY: fetchWithRetry 預設用 GET，但 GraphQL 需要 POST
        // 這裡我們直接用 fetch 來處理 POST
    });

    // WHY: fetchWithRetry 不支援 POST body，改用原生 fetch + 手動重試
    return response;
}

/**
 * WHY: 用原生 fetch 發送 GraphQL POST 請求，帶基本重試邏輯
 *
 * @param {string} query - GraphQL query string
 * @param {string|null} token - GitHub PAT
 * @param {number} [retries=2] - 最大重試次數
 * @returns {Promise<any>} - GraphQL response data
 */
async function graphqlFetch(query, token, retries = 2) {
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'gcc-milestone-agent'
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const res = await fetch(GITHUB_GRAPHQL, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query })
            });

            if (res.ok) {
                const json = await res.json();

                // WHY: GraphQL 回傳 200 但可能含 errors 欄位
                if (json.errors && json.errors.length > 0) {
                    const errorMsg = json.errors.map((e) => e.message).join('; ');
                    throw new Error(`GraphQL errors: ${errorMsg}`);
                }

                return json.data;
            }

            const body = await res.text();
            const retriable = res.status >= 500 || res.status === 429;
            if (!retriable || attempt === retries) {
                throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
            }

            const retryAfter = Number(res.headers.get('retry-after') || '0');
            await new Promise((r) => setTimeout(r, (retryAfter || (1 + attempt)) * 1000));
        } catch (error) {
            if (attempt === retries) throw error;
            await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
        }
    }

    throw new Error('Unexpected graphqlFetch flow');
}

/**
 * @type {import('./types.js').ProviderDefinition}
 */
const githubDiscussionsProvider = {
    name: PROVIDER_SOURCES.GITHUB_DISCUSSIONS,
    types: [EVIDENCE_TYPES.DISCUSSION],

    /**
     * WHY: 社區討論反映項目是否有活躍的使用者互動
     * 已回答比例反映維護者的回應速度和態度
     * 討論參與者數量反映社區廣度
     */
    async collect({ owner, name, token, sinceIso }) {
        const query = buildDiscussionsQuery(owner, name);
        const data = await graphqlFetch(query, token);

        assert(
            data && data.repository,
            `Expected repository data from GraphQL, got ${JSON.stringify(data).slice(0, 200)}`
        );

        const repo = data.repository;
        const discussions = repo.discussions;

        const totalCount = discussions.totalCount;
        const answeredCount = repo.answeredDiscussions.totalCount;
        const unansweredCount = repo.unansweredDiscussions.totalCount;

        // WHY: 回答率是衡量社區健康度的關鍵指標
        const answerRate = totalCount > 0
            ? Math.round((answeredCount / totalCount) * 100)
            : 0;

        const nodes = discussions.nodes || [];

        // WHY: 如果有 sinceIso 過濾，只統計該日期之後的討論
        const filteredNodes = sinceIso
            ? nodes.filter((n) => new Date(n.updatedAt) >= new Date(sinceIso))
            : nodes;

        // WHY: 計算總回覆數，反映社區互動深度
        let totalComments = 0;
        for (const node of filteredNodes) {
            totalComments += node.comments?.totalCount || 0;
        }

        const topParticipants = extractTopParticipants(filteredNodes);
        const source = PROVIDER_SOURCES.GITHUB_DISCUSSIONS;

        // WHY: 將討論統計轉為 EvidenceItem，使規則引擎可以匹配社區討論相關關鍵字
        const items = [
            {
                type: EVIDENCE_TYPES.DISCUSSION,
                source,
                title: `Discussions: ${totalCount} total, ${answeredCount} answered (${answerRate}% answer rate)`,
                body: `Repository has ${totalCount} discussions with ${answeredCount} answered and ${unansweredCount} unanswered. ` +
                    `Answer rate: ${answerRate}%. ` +
                    `Recent discussions have ${totalComments} comments from ${topParticipants.length} unique participants.`,
                url: `https://github.com/${owner}/${name}/discussions`,
                metadata: {
                    totalCount,
                    answeredCount,
                    unansweredCount,
                    answerRate,
                    totalComments,
                    participantCount: topParticipants.length
                }
            }
        ];

        // WHY: 加入最近的活躍討論作為額外證據項目
        const recentDiscussions = filteredNodes.slice(0, 5);
        for (const d of recentDiscussions) {
            const labels = (d.labels?.nodes || []).map((l) => l.name).join(', ');
            const commentCount = d.comments?.totalCount || 0;
            const isAnswered = d.answerChosenAt !== null;

            items.push({
                type: EVIDENCE_TYPES.DISCUSSION,
                source,
                title: `Discussion: ${d.title}${isAnswered ? ' ✅' : ''}`,
                body: `${d.title} — ${commentCount} comments${labels ? `, labels: ${labels}` : ''}` +
                    `${isAnswered ? ', answered' : ', open'}`,
                url: d.url,
                metadata: {
                    author: d.author?.login || 'unknown',
                    commentCount,
                    isAnswered,
                    createdAt: d.createdAt,
                    updatedAt: d.updatedAt
                }
            });
        }

        // WHY: 加入 top 參與者作為社區活躍度證據
        for (const p of topParticipants.slice(0, 5)) {
            items.push({
                type: EVIDENCE_TYPES.DISCUSSION,
                source,
                title: `Discussion participant: ${p.login} (${p.discussionCount} discussions)`,
                body: `Active discussion participant ${p.login} with ${p.discussionCount} discussions started`,
                url: `https://github.com/${p.login}`,
                metadata: { login: p.login, discussionCount: p.discussionCount }
            });
        }

        return {
            items,
            counts: {
                discussions: totalCount,
                answered_discussions: answeredCount,
                discussion_comments: totalComments
            },
            links: {
                discussions: recentDiscussions.slice(0, 5).map((d) => d.url)
            },
            metadata: {
                totalCount,
                answeredCount,
                unansweredCount,
                answerRate,
                totalComments,
                topParticipants
            }
        };
    }
};

export default githubDiscussionsProvider;

// WHY: 匯出內部函數供單元測試使用
export const _internal = {
    buildDiscussionsQuery,
    extractTopParticipants,
    graphqlFetch
};

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - GitHub GraphQL API 需要 token 才能查詢（public repos 也需要 token）
 *    - discussions 功能需要 repo 已啟用（並非所有 repo 都有 discussions）
 *    - totalCount 包含所有討論（不受 first 參數限制）
 *    - answered filter 只計算有「已選擇的答案」的討論
 * 2. 潛在邊界情況：
 *    - repo 未啟用 discussions 時 GraphQL 會回傳 errors
 *    - 私有 repo 沒有 token 時會 401
 *    - author 可能為 null（已刪除的使用者）
 *    - 沒有任何 discussions 時 totalCount = 0，nodes = []
 * 3. 模組依賴：
 *    - types.js（EVIDENCE_TYPES, PROVIDER_SOURCES, fetchWithRetry）
 *    - 需要 EVIDENCE_TYPES.DISCUSSION 和 PROVIDER_SOURCES.GITHUB_DISCUSSIONS 常數
 */
