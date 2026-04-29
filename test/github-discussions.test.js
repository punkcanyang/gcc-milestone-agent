import test from 'node:test';
import assert from 'node:assert/strict';
import { _internal } from '../src/providers/github-discussions.js';
import { PROVIDER_SOURCES, EVIDENCE_TYPES } from '../src/providers/types.js';

/**
 * __ai_context__
 * 測試目標：GitHub Discussions Provider 的核心功能
 * 驗證重點：GraphQL query 構建、參與者提取、常數註冊
 */

const { buildDiscussionsQuery, extractTopParticipants } = _internal;

// --- GraphQL Query 構建測試 ---

test('buildDiscussionsQuery generates valid query string', () => {
    const query = buildDiscussionsQuery('test-owner', 'test-repo');
    assert.ok(query.includes('test-owner'), 'should include owner');
    assert.ok(query.includes('test-repo'), 'should include repo name');
    assert.ok(query.includes('discussions'), 'should query discussions');
    assert.ok(query.includes('totalCount'), 'should request totalCount');
    assert.ok(query.includes('answerChosenAt'), 'should request answerChosenAt');
    assert.ok(query.includes('answered: true'), 'should filter answered discussions');
    assert.ok(query.includes('answered: false'), 'should filter unanswered discussions');
});

test('buildDiscussionsQuery includes comments totalCount', () => {
    const query = buildDiscussionsQuery('owner', 'repo');
    assert.ok(query.includes('comments'), 'should request comments');
    // WHY: 回覆數是衡量討論活躍度的重要指標
});

// --- 參與者提取測試 ---

test('extractTopParticipants returns sorted unique participants', () => {
    const discussions = [
        { author: { login: 'alice' }, comments: { totalCount: 5 } },
        { author: { login: 'bob' }, comments: { totalCount: 3 } },
        { author: { login: 'alice' }, comments: { totalCount: 2 } },
        { author: { login: 'charlie' }, comments: { totalCount: 1 } }
    ];

    const result = extractTopParticipants(discussions);

    assert.equal(result.length, 3, 'should have 3 unique participants');
    assert.equal(result[0].login, 'alice', 'alice should be first (2 discussions)');
    assert.equal(result[0].discussionCount, 2);
    assert.equal(result[1].login, 'bob');
    assert.equal(result[1].discussionCount, 1);
});

test('extractTopParticipants handles null authors', () => {
    const discussions = [
        { author: null, comments: { totalCount: 5 } },
        { author: { login: 'valid-user' }, comments: { totalCount: 3 } }
    ];

    const result = extractTopParticipants(discussions);

    // WHY: 已刪除的使用者 author 為 null，應該跳過
    assert.equal(result.length, 1);
    assert.equal(result[0].login, 'valid-user');
});

test('extractTopParticipants handles empty array', () => {
    const result = extractTopParticipants([]);
    assert.equal(result.length, 0);
});

test('extractTopParticipants caps at MAX_TOP_PARTICIPANTS', () => {
    // WHY: 模擬超過上限的參與者數量
    const discussions = Array.from({ length: 20 }, (_, i) => ({
        author: { login: `user-${i}` },
        comments: { totalCount: 1 }
    }));

    const result = extractTopParticipants(discussions);

    assert.ok(result.length <= 10, 'should cap at 10 participants');
});

// --- 常數註冊驗證 ---

test('EVIDENCE_TYPES includes DISCUSSION', () => {
    assert.equal(EVIDENCE_TYPES.DISCUSSION, 'discussion');
});

test('PROVIDER_SOURCES includes GITHUB_DISCUSSIONS', () => {
    assert.equal(PROVIDER_SOURCES.GITHUB_DISCUSSIONS, 'github-discussions');
});

// --- Provider 結構驗證 ---

test('githubDiscussionsProvider has correct structure', async () => {
    const { default: provider } = await import('../src/providers/github-discussions.js');

    assert.equal(provider.name, 'github-discussions');
    assert.ok(Array.isArray(provider.types), 'types should be array');
    assert.ok(provider.types.includes('discussion'), 'should include discussion type');
    assert.ok(typeof provider.collect === 'function', 'should have collect function');
});

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 不測試實際 GraphQL HTTP 請求（需 mock），僅測試純函數邏輯
 *    - _internal 匯出供測試使用的內部函數
 * 2. 潛在邊界情況：
 *    - 實際 GraphQL 請求測試需要 token 和 HTTP mock
 *    - 某些 repo 可能未啟用 discussions 功能
 * 3. 模組依賴：
 *    - providers/github-discussions.js, providers/types.js
 */
