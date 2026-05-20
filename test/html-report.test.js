import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHtmlReport, renderBatchDashboardHtml } from '../src/html-report.js';/**
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

test('renderHtmlReport includes phase metadata when present', () => {
    const html = renderHtmlReport(makePayload({
        phase: { id: 'M2', title: 'Community proof', dependsOn: ['M1'] },
        dependencyWarnings: []
    }));
    assert.ok(html.includes('Phase'), 'should render phase label');
    assert.ok(html.includes('M2'), 'should render phase id');
    assert.ok(html.includes('Community proof'), 'should render phase title');
    assert.ok(html.includes('M1'), 'should render dependency');
});

test('renderHtmlReport includes dependency warnings when present', () => {
    const html = renderHtmlReport(makePayload({
        phase: { id: 'M2', title: 'Community proof', dependsOn: ['M1'] },
        dependencyWarnings: ['Phase M2 depends on M1, but no prior result was found in reportsDir.']
    }));
    assert.ok(html.includes('Dependency Warnings'), 'should render warnings title');
    assert.ok(html.includes('no prior result'), 'should render warning text');
});

test('renderHtmlReport escapes phase metadata and dependency warnings', () => {
    const html = renderHtmlReport(makePayload({
        phase: {
            id: '<script>alert("phase")</script>',
            title: '"><img onerror=alert(1)>',
            dependsOn: ['M1 & <M0>']
        },
        dependencyWarnings: ['warn <script>alert("x")</script> & "quote"']
    }));

    assert.ok(!html.includes('<script>alert("phase")</script>'), 'should not render raw phase id');
    assert.ok(!html.includes('"><img onerror=alert(1)>'), 'should not render raw phase title');
    assert.ok(!html.includes('warn <script>alert("x")</script>'), 'should not render raw warning');
    assert.ok(html.includes('&lt;script&gt;alert(&quot;phase&quot;)&lt;/script&gt;'), 'should escape phase id');
    assert.ok(html.includes('&quot;&gt;&lt;img onerror=alert(1)&gt;'), 'should escape phase title');
    assert.ok(html.includes('M1 &amp; &lt;M0&gt;'), 'should escape dependencies');
    assert.ok(html.includes('warn &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quote&quot;'), 'should escape warnings');
});

test('renderHtmlReport renders timeline items and styles correctly', () => {
    const html = renderHtmlReport(makePayload({
        timeline: [
            { id: 'M1', title: 'Phase 1', status: 'met', score: 90, generatedAt: '2026-05-14T01:00:00.000Z', isCurrent: false },
            { id: 'M2', title: 'Phase 2', status: 'partially_met', score: 50, generatedAt: '2026-05-14T02:00:00.000Z', isCurrent: true }
        ]
    }));

    assert.ok(html.includes('Phase Verification Timeline'), 'should render timeline title');
    assert.ok(html.includes('timeline-container'), 'should render timeline container');
    assert.ok(html.includes('class="timeline-badge met"'), 'should render M1 met badge');
    assert.ok(html.includes('class="timeline-badge partially_met current"'), 'should render M2 current badge');
    assert.ok(html.includes('(Current)'), 'should render current badge label');
    assert.ok(html.includes('90/100'), 'should render M1 score');
    assert.ok(html.includes('50/100'), 'should render M2 score');
    assert.ok(html.includes('2026-05-14'), 'should render dates');
});

test('renderHtmlReport escapes XSS in timeline items', () => {
    const html = renderHtmlReport(makePayload({
        timeline: [
            { id: '<script>alert("id")</script>', title: '"><img onerror=alert(1)>', status: 'met', score: 90, generatedAt: '2026-05-14T01:00:00.000Z', isCurrent: false }
        ]
    }));

    assert.ok(!html.includes('<script>alert("id")</script>'), 'should not render raw script in timeline id');
    assert.ok(!html.includes('"><img onerror=alert(1)>'), 'should not render raw img tag in timeline title');
    assert.ok(html.includes('&lt;script&gt;alert(&quot;id&quot;)&lt;/script&gt;'), 'should escape timeline id');
    assert.ok(html.includes('&quot;&gt;&lt;img onerror=alert(1)&gt;'), 'should escape timeline title');
});

test('renderBatchDashboardHtml renders dashboard with KPIs and table', () => {
    const payload = {
        projects: [
            { repo: 'org1/repo1', phaseId: 'M1', phaseTitle: 'Phase One', milestoneText: 'milestone 1', status: 'met', score: 90, generatedAt: '2026-05-14T01:00:00.000Z', reportPath: 'r1.md', htmlReportPath: 'r1.html' },
            { repo: 'org2/repo2', phaseId: null, phaseTitle: null, milestoneText: 'milestone 2', status: 'partially_met', score: 50, generatedAt: '2026-05-14T02:00:00.000Z', reportPath: 'r2.md', htmlReportPath: 'r2.html' },
            { repo: 'org3/repo3', phaseId: 'M2', phaseTitle: null, milestoneText: 'milestone 3', status: 'failed', score: 0, generatedAt: '2026-05-14T03:00:00.000Z', reportPath: null, htmlReportPath: null, error: 'Connection timeout' }
        ],
        generatedAt: '2026-05-20T00:00:00Z'
    };

    const html = renderBatchDashboardHtml(payload);

    assert.ok(html.includes('GCC Milestone Verification Dashboard'), 'should have dashboard title');
    assert.ok(html.includes('Total Projects'), 'should render total projects KPI');
    assert.ok(html.includes('Met Rate'), 'should render met rate KPI');
    assert.ok(html.includes('Average Score'), 'should render average score KPI');
    assert.ok(html.includes('Run Success Rate'), 'should render run success rate KPI');

    // Values verification
    assert.ok(html.includes('3'), 'should display total projects count of 3');
    assert.ok(html.includes('33%'), 'should display met rate of 33%'); // 1 out of 3 is met
    assert.ok(html.includes('70/100'), 'should display average score of 70'); // (90 + 50) / 2
    assert.ok(html.includes('67%'), 'should display success rate of 67%'); // 2 out of 3 succeeded

    // Table rows check
    assert.ok(html.includes('org1/repo1'), 'should render first project repo');
    assert.ok(html.includes('Phase: M1 (Phase One)'), 'should render M1 and its title');
    assert.ok(html.includes('badge-met'), 'should have met badge class');
    assert.ok(html.includes('href="r1.html"'), 'should have M1 html report link');

    assert.ok(html.includes('org2/repo2'), 'should render second project repo');
    assert.ok(html.includes('milestone 2'), 'should fallback to milestoneText if no phase');
    assert.ok(html.includes('badge-partially_met'), 'should have partially_met badge class');

    assert.ok(html.includes('org3/repo3'), 'should render third project repo');
    assert.ok(html.includes('badge-failed'), 'should have failed badge class');
    assert.ok(html.includes('Connection timeout'), 'should render failed error message');
});

test('renderBatchDashboardHtml escapes XSS in project fields', () => {
    const payload = {
        projects: [
            { repo: '<script>alert("repo")</script>', phaseId: '"><img onerror=alert(1)>', phaseTitle: '"><img onerror=alert(2)>', milestoneText: '"><img onerror=alert(3)>', status: 'met', score: 90, generatedAt: '2026-05-14T01:00:00.000Z', reportPath: 'r1.md', htmlReportPath: 'r1.html' }
        ],
        generatedAt: '2026-05-20T00:00:00Z'
    };

    const html = renderBatchDashboardHtml(payload);

    assert.ok(!html.includes('<script>alert("repo")</script>'), 'should not contain raw script tag in repo');
    assert.ok(!html.includes('"><img onerror=alert(1)>'), 'should not contain raw img tag');
    assert.ok(html.includes('&lt;script&gt;alert(&quot;repo&quot;)&lt;/script&gt;'), 'should escape repo name');
});

test('renderHtmlReport renders Cross-Phase Progress Comparison when timeline contains at least 2 ran phases', () => {
    const payload = makePayload({
        timeline: [
            {
                id: 'M1',
                title: 'Phase One',
                score: 80,
                status: 'met',
                generatedAt: '2026-05-14T01:00:00Z',
                isCurrent: false,
                rulePassRate: 70,
                counts: { commits: 10, pulls: 2, issues: 1, releases: 0 },
                community: { stars: 10, forks: 2, contributors: 1 },
                deltas: null
            },
            {
                id: 'M2',
                title: 'Phase Two',
                score: 90,
                status: 'met',
                generatedAt: '2026-05-14T03:00:00Z',
                isCurrent: true,
                rulePassRate: 85,
                counts: { commits: 15, pulls: 3, issues: 2, releases: 1 },
                community: { stars: 12, forks: 3, contributors: 2 },
                deltas: {
                    score: 10,
                    rulePassRate: 15,
                    counts: { commits: 5, pulls: 1, issues: 1, releases: 1 },
                    community: { stars: 2, forks: 1, contributors: 1 }
                }
            }
        ]
    });

    const html = renderHtmlReport(payload);

    assert.ok(html.includes('Cross-Phase Progress Comparison'), 'should render comparison section header');
    assert.ok(html.includes('comp-table'), 'should have comp-table css class');
    assert.ok(html.includes('Latest Delta'), 'should have Latest Delta column header');
    assert.ok(html.includes('Overall Score'), 'should compare Overall Score');
    assert.ok(html.includes('Rule Pass Rate'), 'should compare Rule Pass Rate');
    assert.ok(html.includes('Commits'), 'should compare Commits count');
    assert.ok(html.includes('GitHub Stars'), 'should compare GitHub Stars');
    assert.ok(html.includes('M1'), 'should show M1 header');
    assert.ok(html.includes('M2'), 'should show M2 header');
    assert.ok(html.includes('(Current)'), 'should label current phase');
    assert.ok(html.includes('<span style="color:#16a34a;font-weight:bold;">+10</span>'), 'should format +10 score delta in green');
    assert.ok(html.includes('<span style="color:#16a34a;font-weight:bold;">+15%</span>'), 'should format +15% pass rate delta in green');
    assert.ok(html.includes('<span style="color:#16a34a;font-weight:bold;">+5</span>'), 'should format +5 commits delta in green');
});

test('renderHtmlReport hides Cross-Phase Progress Comparison if less than 2 ran phases', () => {
    const payload = makePayload({
        timeline: [
            {
                id: 'M1',
                title: 'Phase One',
                score: 80,
                status: 'met',
                generatedAt: '2026-05-14T01:00:00Z',
                isCurrent: true,
                rulePassRate: 70,
                counts: { commits: 10, pulls: 2, issues: 1, releases: 0 },
                community: null,
                deltas: null
            },
            {
                id: 'M2',
                title: 'Phase Two',
                score: null,
                status: 'pending',
                generatedAt: null,
                isCurrent: false,
                rulePassRate: null,
                counts: null,
                community: null,
                deltas: null
            }
        ]
    });

    const html = renderHtmlReport(payload);
    assert.ok(!html.includes('Cross-Phase Progress Comparison'), 'should hide comparison section');
});

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - XSS 測試僅驗證最常見的攻擊向量（<script> 和 onerror）
 *    - 顏色值直接硬編碼在測試中，需與 html-report.js 的常數同步
 *    - timeline 渲染測試覆蓋了 isCurrent 的 CSS 動態標記和 (Current) 語意提示
 *    - renderBatchDashboardHtml 单元测试覆盖了 KPI 逻辑计算、异常错误渲染和 XSS 过滤
 * 2. 潛在邊界情況：
 *    - 未測試超長文本、Unicode 特殊字符、空字串 payload
 *    - 未測試 evidenceLinks 為 undefined 的情況
 *    - 未测试批量仪表板在 projects 数组为空时的边界渲染
 * 3. 模組依賴：
 *    - html-report.js (renderHtmlReport, renderBatchDashboardHtml)
 */
