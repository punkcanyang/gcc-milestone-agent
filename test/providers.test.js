import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableProviders, getProvider, flattenCounts, flattenLinks, collectFromProviders } from '../src/providers/index.js';
import { PROVIDER_SOURCES, EVIDENCE_TYPES } from '../src/providers/types.js';
import { _extractUrls } from '../src/providers/url-checker.js';

/**
 * __ai_context__
 * 測試目標：Provider 系統的核心功能
 * 驗證重點：provider registry、flattenCounts/flattenLinks、URL 提取
 */

// --- Provider Registry 測試 ---

test('getAvailableProviders returns all registered providers', () => {
    const providers = getAvailableProviders();
    assert.ok(providers.includes('github-api'), 'should include github-api');
    assert.ok(providers.includes('github-actions'), 'should include github-actions');
    assert.ok(providers.includes('github-community'), 'should include github-community');
    assert.ok(providers.includes('npm-registry'), 'should include npm-registry');
    assert.ok(providers.includes('url-checker'), 'should include url-checker');
    assert.ok(providers.includes('github-discussions'), 'should include github-discussions');
    assert.ok(providers.includes('twitter-browser'), 'should include twitter-browser');
    assert.ok(providers.includes('etherscan-api'), 'should include etherscan-api');
    assert.ok(providers.includes('article-crawler'), 'should include article-crawler');
    assert.ok(providers.includes('discord-api'), 'should include discord-api');
    assert.ok(providers.includes('telegram-group'), 'should include telegram-group');
    assert.equal(providers.length, 11);
});

test('getProvider returns provider by name', () => {
    const provider = getProvider('github-api');
    assert.equal(provider.name, 'github-api');
    assert.ok(Array.isArray(provider.types));
    assert.ok(typeof provider.collect === 'function');
});

test('getProvider throws for unknown provider', () => {
    assert.throws(() => getProvider('nonexistent'), /Unknown provider/);
});

// --- flattenCounts 測試 ---

test('flattenCounts merges counts from multiple providers', () => {
    const multiCounts = {
        'github-api': { commits: 10, pulls: 3, issues: 5, releases: 1 },
        'github-actions': { ci_runs: 20 }
    };
    const flat = flattenCounts(multiCounts);
    assert.equal(flat.commits, 10);
    assert.equal(flat.pulls, 3);
    assert.equal(flat.issues, 5);
    assert.equal(flat.releases, 1);
});

test('flattenCounts ignores unknown keys', () => {
    const multiCounts = {
        'github-actions': { ci_runs: 20, unknown_field: 99 }
    };
    const flat = flattenCounts(multiCounts);
    assert.equal(flat.commits, 0);
    assert.ok(!('ci_runs' in flat));
});

test('flattenCounts handles empty input', () => {
    const flat = flattenCounts({});
    assert.deepEqual(flat, { commits: 0, pulls: 0, issues: 0, releases: 0 });
});

// --- flattenLinks 測試 ---

test('flattenLinks merges and deduplicates links', () => {
    const multiLinks = {
        'github-api': { commits: ['https://a', 'https://b'], pulls: ['https://c'] }
    };
    const flat = flattenLinks(multiLinks);
    assert.deepEqual(flat.commits, ['https://a', 'https://b']);
    assert.deepEqual(flat.pulls, ['https://c']);
});

test('flattenLinks caps at 5 per category', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`);
    const multiLinks = {
        'provider-a': { commits: urls.slice(0, 5) },
        'provider-b': { commits: urls.slice(5, 10) }
    };
    const flat = flattenLinks(multiLinks);
    assert.equal(flat.commits.length, 5);
});

// --- URL 提取測試 ---

test('extractUrls finds HTTP URLs in text', () => {
    const text = 'Visit https://example.com and http://test.org for more info.';
    const urls = _extractUrls(text);
    assert.ok(urls.includes('https://example.com'));
    assert.ok(urls.includes('http://test.org'));
});

test('extractUrls excludes GitHub API and badge URLs', () => {
    const text = 'API: https://api.github.com/repos/foo/bar Badge: https://img.shields.io/badge/test Demo: https://demo.example.com';
    const urls = _extractUrls(text);
    assert.ok(!urls.some((u) => u.includes('api.github.com')));
    assert.ok(!urls.some((u) => u.includes('shields.io')));
    assert.ok(urls.includes('https://demo.example.com'));
});

test('extractUrls deduplicates URLs', () => {
    const text = 'Link: https://example.com and also https://example.com again.';
    const urls = _extractUrls(text);
    assert.equal(urls.filter((u) => u === 'https://example.com').length, 1);
});

test('extractUrls caps at MAX_URLS_TO_CHECK', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://example${i}.com`);
    const text = urls.join(' ');
    const result = _extractUrls(text);
    assert.ok(result.length <= 10);
});

// --- collectFromProviders 測試 ---

test('collectFromProviders rejects empty provider list', async () => {
    await assert.rejects(
        () => collectFromProviders([], { owner: 'test', name: 'test', sinceIso: null, token: null }),
        /At least one provider/
    );
});

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 不測試實際 HTTP 請求（需 mock），僅測試純函數邏輯
 *    - provider 數量和名稱需與 providers/index.js 同步
 * 2. 潛在邊界情況：
 *    - collectFromProviders 的實際收集測試需要 HTTP mock（在此省略）
 * 3. 模組依賴：
 *    - providers/index.js, providers/types.js, providers/url-checker.js
 */
