import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHtmlReport } from '../src/html-report.js';

/**
 * __ai_context__
 * 測試目標：html-report.js 的 renderHtmlReport 函數
 * 驗證重點：XSS 防護、分數配色、邊界輸入處理
 */

// --- 測試用的基礎 payload ---
function makePayload(overrides = {}) {
    return {
        repo: 'test-org/test-repo',
        milestone: 'test milestone',
        profile: null,
        generatedAt: '2026-03-15T00:00:00Z',
        status: 'met',
        score: 80,
        activityScore: 70,
        rulePassRate: 100,
        evidenceCounts: { commits: 5, pulls: 2, issues: 3, releases: 1 },
        evidenceLinks: {
            commits: ['https://github.com/a/b/commit/1'],
            pulls: ['https://github.com/a/b/pull/1'],
            issues: ['https://github.com/a/b/issues/1'],
            releases: ['https://github.com/a/b/releases/1']
        },
        rules: [
            {
                id: 'R1',
                text: 'Test rule',
                result: {
                    matched: true,
                    hitCount: 2,
                    sampleLinks: [{ url: 'https://example.com/1', matchedKeywords: ['test'] }],
                    semantic: { verdict: 'met', confidence: 80, rationale: 'Strong match', citedUrls: ['https://example.com/1'], keywordCoverage: 100 }
                }
            }
        ],
        ...overrides
    };
}

test('renderHtmlReport returns valid HTML with correct structure', () => {
    const html = renderHtmlReport(makePayload());

    assert.ok(html.includes('<!doctype html>'), 'should have doctype');
    assert.ok(html.includes('<html lang="zh-Hant">'), 'should have html lang');
    assert.ok(html.includes('</html>'), 'should close html tag');
    assert.ok(html.includes('test-org/test-repo'), 'should include repo name');
    assert.ok(html.includes('test milestone'), 'should include milestone text');
    assert.ok(html.includes('80/100'), 'should include score');
});

test('renderHtmlReport applies green color for score >= 70', () => {
    const html = renderHtmlReport(makePayload({ score: 75 }));
    assert.ok(html.includes('#16a34a'), 'should use green color');
});

test('renderHtmlReport applies yellow color for score 40-69', () => {
    const html = renderHtmlReport(makePayload({ score: 55 }));
    assert.ok(html.includes('#d97706'), 'should use yellow/orange color');
});

test('renderHtmlReport applies red color for score < 40', () => {
    const html = renderHtmlReport(makePayload({ score: 20 }));
    assert.ok(html.includes('#dc2626'), 'should use red color');
});

test('renderHtmlReport escapes XSS in repo name', () => {
    const html = renderHtmlReport(makePayload({ repo: '<script>alert("xss")</script>' }));
    assert.ok(!html.includes('<script>alert'), 'should not contain raw script tag');
    assert.ok(html.includes('&lt;script&gt;'), 'should escape angle brackets');
});

test('renderHtmlReport escapes XSS in milestone', () => {
    const html = renderHtmlReport(makePayload({ milestone: '"><img onerror=alert(1)>' }));
    assert.ok(!html.includes('<img'), 'should not contain raw img tag');
    assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'), 'should escape angle brackets in payload');
    assert.ok(html.includes('&quot;'), 'should escape quotes');
});

test('renderHtmlReport handles empty rules array', () => {
    const html = renderHtmlReport(makePayload({ rules: [] }));
    assert.ok(html.includes('Rule Evaluation'), 'should still have rule section');
});

test('renderHtmlReport handles undefined rules', () => {
    const html = renderHtmlReport(makePayload({ rules: undefined }));
    assert.ok(html.includes('Rule Evaluation'), 'should not crash on undefined rules');
});

test('renderHtmlReport handles null profile', () => {
    const html = renderHtmlReport(makePayload({ profile: null }));
    assert.ok(html.includes('none'), 'should show "none" for null profile');
});

test('renderHtmlReport handles undefined evidenceCounts', () => {
    const html = renderHtmlReport(makePayload({ evidenceCounts: undefined }));
    assert.ok(html.includes('Evidence Counts'), 'should not crash on undefined counts');
});

test('renderHtmlReport includes interactive rule filter controls', () => {
    const html = renderHtmlReport(makePayload());
    assert.ok(html.includes('id="ruleVerdictFilter"'), 'should render verdict filter');
    assert.ok(html.includes('id="ruleSourceFilter"'), 'should render source filter');
    assert.ok(html.includes('function applyRuleFilters()'), 'should include filter script');
});

test('renderHtmlReport includes reviewer dashboard section', () => {
    const html = renderHtmlReport(makePayload());
    assert.ok(html.includes('Reviewer Dashboard'), 'should include dashboard title');
    assert.ok(html.includes('id="dashboardSection"'), 'should include dashboard section id');
});

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - XSS 測試僅驗證最常見的攻擊向量（<script> 和 onerror）
 *    - 顏色值直接硬編碼在測試中，需與 html-report.js 的常數同步
 * 2. 潛在邊界情況：
 *    - 未測試超長文本、Unicode 特殊字符、空字串 payload
 *    - 未測試 evidenceLinks 為 undefined 的情況
 * 3. 模組依賴：
 *    - html-report.js (renderHtmlReport)
 */
