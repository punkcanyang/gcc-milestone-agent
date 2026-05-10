/**
 * __ai_context__
 * 模組角色：GCC Milestone Agent 的核心邏輯模組
 * 系統位置：CLI 入口(cli.js) → [本模組] → providers/ → rule-engine.js → 報告輸出
 * 核心職責：
 *   1. 透過 Provider 系統收集多形態證據（預設 GitHub REST API）
 *   2. 調用 rule-engine 進行 milestone 規則評估
 *   3. 計算加權分數並生成 Markdown/JSON/HTML 報告
 * 關鍵依賴：providers/（證據收集）, rule-engine.js, html-report.js
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateMilestoneRules, loadRulesFromFile } from './rule-engine.js';
import { applyLlmSemanticEvaluation } from './llm-semantic.js';
import { renderHtmlReport } from './html-report.js';
import { collectFromProviders, flattenCounts, flattenLinks, getAvailableProviders } from './providers/index.js';
import { PROVIDER_SOURCES } from './providers/types.js';
import { buildCommunityHealth, computeTrend, formatCommunityHealthMarkdown } from './community-health.js';
import { saveSnapshot, loadPreviousSnapshot } from './snapshot-store.js';

// --- 評分權重常數 ---
// WHY: 各類型證據對 milestone 完成度的貢獻不同
//   - releases 權重最高(5)，因為發布是最具里程碑意義的成果
//   - PRs 權重次之(4)，因為 PR 代表已完成的功能單元
//   - commits 和 issues 權重較低(2)，因為單個 commit/issue 粒度較細
const WEIGHT_COMMITS = 2;
const WEIGHT_PULLS = 4;
const WEIGHT_ISSUES = 2;
const WEIGHT_RELEASES = 5;

// WHY: 活動分數與規則通過率的混合比例
//   - 活動分佔 60%，反映「有做事」的基本事實
//   - 規則通過率佔 40%，反映「做的事是否符合 milestone 目標」
const ACTIVITY_WEIGHT = 0.6;
const RULE_WEIGHT = 0.4;

// WHY: 評分閾值基於 GCC 審查標準
//   - 70 分以上視為「達標」(met)，允許一定的證據缺失容差
//   - 40 分以上視為「部分達標」(partially_met)，提示需要更多證據
const THRESHOLD_MET = 70;
const THRESHOLD_PARTIAL = 40;

// WHY: provider bonus 上限與分項配比
//   - 總 bonus 最多 +20 分，避免壓過 activity/rule 主分
//   - CI/Community 權重較高（各最多 8/6），npm/URL 為輔助信號（各最多 3）
const MAX_PROVIDER_BONUS = 20;
const BONUS_CI_MAX = 8;
const BONUS_COMMUNITY_MAX = 6;
const BONUS_NPM = 3;
const BONUS_URL_MAX = 3;

// WHY: GitHub API 單次查詢上限常數，用於報告中的截斷警告
const GITHUB_PAGE_SIZE_DEFAULT = 100;
const GITHUB_PAGE_SIZE_RELEASES = 30;
const SEMANTIC_MODE_HEURISTIC = 'heuristic';
const SEMANTIC_MODE_LLM = 'llm';
const DEFAULT_LLM_MODEL = 'gpt-5-mini';

/**
 * @typedef {'heuristic'|'llm'} SemanticMode
 */

function normalizeDate(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid --since date: ${input}`);
  }
  return d.toISOString();
}

function parseRepo(repo) {
  const [owner, name] = String(repo).split('/');
  if (!owner || !name) {
    throw new Error(`Invalid --repo format: ${repo}. Expected owner/name`);
  }
  return { owner, name };
}

/**
 * @param {string|undefined|null} mode
 * @returns {SemanticMode}
 */
function normalizeSemanticMode(mode) {
  const value = String(mode || SEMANTIC_MODE_HEURISTIC).trim().toLowerCase();
  if (value === SEMANTIC_MODE_HEURISTIC || value === SEMANTIC_MODE_LLM) {
    return value;
  }
  throw new Error(`Invalid --semantic-mode: ${mode}. Expected: ${SEMANTIC_MODE_HEURISTIC} | ${SEMANTIC_MODE_LLM}`);
}

function calculateProviderBonus(providerMeta = {}) {
  const breakdown = {
    ci: 0,
    community: 0,
    npm: 0,
    url: 0
  };

  const ciMeta = providerMeta[PROVIDER_SOURCES.GITHUB_ACTIONS];
  if (ciMeta?.totalRuns > 0 && Number.isFinite(ciMeta.successRate)) {
    const clampedRate = Math.max(0, Math.min(100, ciMeta.successRate));
    breakdown.ci = Math.round((clampedRate / 100) * BONUS_CI_MAX);
  }

  const communityMeta = providerMeta[PROVIDER_SOURCES.GITHUB_COMMUNITY];
  if (communityMeta && typeof communityMeta === 'object') {
    const stars = Number(communityMeta.stars || 0);
    const forks = Number(communityMeta.forks || 0);
    const contributors = Number(communityMeta.contributorCount || 0);
    const starScore = Math.min(2, Math.floor(stars / 25));
    const forkScore = Math.min(2, Math.floor(forks / 10));
    const contributorScore = Math.min(2, Math.floor(contributors / 5));
    breakdown.community = Math.min(BONUS_COMMUNITY_MAX, starScore + forkScore + contributorScore);
  }

  const npmMeta = providerMeta[PROVIDER_SOURCES.NPM_REGISTRY];
  if (npmMeta?.published === true) {
    breakdown.npm = BONUS_NPM;
  }

  const urlMeta = providerMeta[PROVIDER_SOURCES.URL_CHECKER];
  if (urlMeta?.totalChecked > 0 && Number.isFinite(urlMeta.reachableRate)) {
    const clampedRate = Math.max(0, Math.min(100, urlMeta.reachableRate));
    breakdown.url = Math.round((clampedRate / 100) * BONUS_URL_MAX);
  }

  const totalBonus = Math.min(
    MAX_PROVIDER_BONUS,
    breakdown.ci + breakdown.community + breakdown.npm + breakdown.url
  );

  return { totalBonus, breakdown };
}

function scoreEvidence({ commits, pulls, issues, releases, rulePassRate, providerBonus = 0 }) {
  // WHY: 加權求和反映不同證據類型對 milestone 的貢獻差異
  const activityRaw =
    commits * WEIGHT_COMMITS +
    pulls * WEIGHT_PULLS +
    issues * WEIGHT_ISSUES +
    releases * WEIGHT_RELEASES;
  const activityScore = Math.min(100, activityRaw);
  const baseScore = Math.round(activityScore * ACTIVITY_WEIGHT + rulePassRate * RULE_WEIGHT);
  const normalizedProviderBonus = Math.max(0, Number(providerBonus) || 0);
  const score = Math.min(100, Math.round(baseScore + normalizedProviderBonus));

  let status = 'not_met';
  if (score >= THRESHOLD_MET) status = 'met';
  else if (score >= THRESHOLD_PARTIAL) status = 'partially_met';

  return { score, status, activityScore, baseScore, providerBonus: normalizedProviderBonus };
}

/**
 * WHY: 解析 --providers CLI 參數
 * 支援逗號分隔的 provider 名稱清單，預設為 github-api
 *
 * @param {string|undefined} providersArg - CLI 傳入的 providers 字串
 * @returns {string[]}
 */
function parseProviders(providersArg) {
  if (!providersArg) {
    return [PROVIDER_SOURCES.GITHUB_API];
  }
  return providersArg.split(',').map((s) => s.trim()).filter(Boolean);
}

function listOrNone(items) {
  if (!items.length) return '- (none)\n';
  return items.map((url) => `- ${url}\n`).join('');
}

function buildRuleSection(ruleEval) {
  if (!ruleEval.rules.length) return '- No parseable rules from milestone text.\n';
  return `${ruleEval.rules.map((r) => {
    const icon = r.result.matched ? '✅' : '❌';
    const sourceTag = r.source ? ` [source: ${r.source}]` : '';
    const samples = r.result.sampleLinks.length
      ? r.result.sampleLinks.map((s) => `  - ${s.url} (matched: ${s.matchedKeywords.join(', ')})`).join('\n')
      : '  - (no matching evidence)';
    const explainability = r.result.explainability?.length
      ? r.result.explainability.map((x) => `  - [${x.source || 'unknown'}] "${x.snippet}" (${x.url})`).join('\n')
      : '  - (no explainability snippets)';
    const sem = r.result.semantic;
    const semanticLine = sem
      ? `  - semantic: ${sem.verdict}, confidence=${sem.confidence}, semanticCoverage=${sem.semanticCoverage}%, keywordCoverage=${sem.keywordCoverage}%, sourceDiversity=${sem.sourceDiversity}\n  - rationale: ${sem.rationale}`
      : '  - semantic: n/a';
    return `- ${icon} ${r.id}: ${r.text}${sourceTag}\n${samples}\n${explainability}\n${semanticLine}`;
  }).join('\n')}\n`;
}

function buildReport({
  repo,
  milestone,
  since,
  profile,
  providers,
  score,
  status,
  activityScore,
  baseScore,
  providerBonus,
  providerBonusBreakdown,
  semanticMode,
  semanticWarnings,
  counts,
  links,
  ruleEval,
  providerErrors,
  communityHealthMarkdown
}) {
  // WHY: 當任一類型的證據達到 API 查詢上限時，提醒審閱者數據可能被截斷
  const truncationWarnings = [];
  if (counts.commits >= GITHUB_PAGE_SIZE_DEFAULT) {
    truncationWarnings.push(`- ⚠️ Commits count reached API limit (${GITHUB_PAGE_SIZE_DEFAULT}). Actual count may be higher.`);
  }
  if (counts.pulls >= GITHUB_PAGE_SIZE_DEFAULT) {
    truncationWarnings.push(`- ⚠️ Pull requests count reached API limit (${GITHUB_PAGE_SIZE_DEFAULT}). Actual count may be higher.`);
  }
  if (counts.issues >= GITHUB_PAGE_SIZE_DEFAULT) {
    truncationWarnings.push(`- ⚠️ Issues count reached API limit (${GITHUB_PAGE_SIZE_DEFAULT}). Actual count may be higher.`);
  }
  if (counts.releases >= GITHUB_PAGE_SIZE_RELEASES) {
    truncationWarnings.push(`- ⚠️ Releases count reached API limit (${GITHUB_PAGE_SIZE_RELEASES}). Actual count may be higher.`);
  }
  const truncationSection = truncationWarnings.length
    ? `\n## Data Truncation Warnings\n${truncationWarnings.join('\n')}\n`
    : '';

  // WHY: 如果有 provider 收集失敗，在報告中標記
  const errorSection = providerErrors?.length
    ? `\n## Provider Errors\n${providerErrors.map((e) => `- ⚠️ Provider "${e.provider}" failed: ${e.message}`).join('\n')}\n`
    : '';

  return `# Milestone Verification Report\n\n` +
    `- Repo: ${repo}\n` +
    `- Milestone: ${milestone}\n` +
    `- Profile: ${profile || 'none'}\n` +
    `- Providers: ${providers.join(', ')}\n` +
    `- Since: ${since ?? 'N/A'}\n` +
    `- Result: **${status}**\n` +
    `- Score: **${score}/100**\n` +
    `- Activity Score: ${activityScore}/100\n` +
    `- Base Score (activity + rules): ${baseScore}/100\n` +
    `- Provider Bonus: +${providerBonus} (ci:${providerBonusBreakdown.ci}, community:${providerBonusBreakdown.community}, npm:${providerBonusBreakdown.npm}, url:${providerBonusBreakdown.url})\n` +
    `- Semantic Mode: ${semanticMode}\n` +
    `${semanticWarnings?.length ? `- Semantic Warnings: ${semanticWarnings.join(' | ')}\n` : ''}` +
    `- Rule Pass Rate: ${ruleEval.passRate}% (${ruleEval.passed}/${ruleEval.total})\n\n` +
    `## Evidence Summary\n` +
    `- Commits counted: ${counts.commits}\n` +
    `- Pull requests counted: ${counts.pulls}\n` +
    `- Issues counted: ${counts.issues}\n` +
    `- Releases counted: ${counts.releases}\n` +
    truncationSection +
    errorSection +
    `\n## Evidence Links (sample)\n` +
    `### Commits\n${listOrNone(links.commits)}` +
    `### Pull Requests\n${listOrNone(links.pulls)}` +
    `### Issues\n${listOrNone(links.issues)}` +
    `### Releases\n${listOrNone(links.releases)}` +
    `\n## Rule Evaluation\n${buildRuleSection(ruleEval)}\n` +
    communityHealthMarkdown +
    `\n## Risk Notes\n` +
    `- Semantic evaluation defaults to heuristic mode; optional LLM mode should still be human-reviewed.\n` +
    `- Keep human final approval (human-in-the-loop) before any fund allocation decision.\n`;
}

function buildJsonReport({
  repo,
  milestone,
  sinceIso,
  profile,
  providers,
  score,
  status,
  activityScore,
  baseScore,
  providerBonus,
  providerBonusBreakdown,
  semanticMode,
  semanticWarnings,
  counts,
  ruleEval,
  links,
  providerErrors,
  providerMeta,
  communityHealth
}) {
  return {
    generatedAt: new Date().toISOString(),
    repo,
    milestone,
    profile: profile || null,
    providers,
    since: sinceIso,
    status,
    score,
    activityScore,
    baseScore,
    providerBonus,
    providerBonusBreakdown,
    semanticMode,
    semanticWarnings: semanticWarnings || [],
    rulePassRate: ruleEval.passRate,
    ruleStats: { passed: ruleEval.passed, total: ruleEval.total },
    evidenceCounts: counts,
    evidenceLinks: links,
    rules: ruleEval.rules,
    providerErrors: providerErrors || [],
    providerMeta: providerMeta || {},
    communityHealth: communityHealth || {}
  };
}

function resolveProfileRulesFile(profile) {
  if (!profile) return null;

  // WHY: 使用 import.meta.url 解析路徑，確保在任意工作目錄下都能找到內建 profile
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const builtIn = {
    'gcc-allocation': path.join(__dirname, '..', 'profiles', 'gcc-allocation.yaml')
  };
  const found = builtIn[profile];
  if (!found) {
    throw new Error(`Unknown profile: ${profile}. Available: ${Object.keys(builtIn).join(', ')}`);
  }
  return found;
}

export async function runMilestoneCheck({
  repo,
  milestone,
  since,
  out,
  jsonOut,
  htmlOut,
  rulesFile,
  profile,
  providers: providersArg,
  twitterHandle,
  contractAddress,
  etherscanUrl,
  articleUrls,
  discordInvite,
  telegramGroup,
  semanticMode: semanticModeArg,
  llmModel
}) {
  const sinceIso = normalizeDate(since);
  const { owner, name } = parseRepo(repo);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const semanticMode = normalizeSemanticMode(semanticModeArg);
  const semanticWarnings = [];

  // WHY: 解析要啟用的 providers，預設只用 github-api
  const providerNames = parseProviders(providersArg);

  // WHY: 使用 Provider 系統收集證據，傳遞 options 給特定的 provider (如 twitterHandle)
  const evidence = await collectFromProviders(providerNames, {
    owner,
    name,
    sinceIso,
    token,
    options: { 
      twitterHandle, 
      contractAddress, 
      etherscanUrl, 
      etherscanApiKey: process.env.ETHERSCAN_API_KEY,
      articleUrls: articleUrls ? articleUrls.split(',').map(u => u.trim()).filter(Boolean) : [],
      discordInvite,
      telegramGroup
    }
  });

  // WHY: flattenCounts/flattenLinks 將多 provider 結果轉為舊格式，維持向下相容
  const counts = flattenCounts(evidence.counts);
  const links = flattenLinks(evidence.links);

  const profileRulesFile = resolveProfileRulesFile(profile);
  // WHY: --rules-file CLI 選項優先於 --profile 內建規則，允許用戶覆蓋預設行為
  const effectiveRulesFile = rulesFile || profileRulesFile;
  const rules = effectiveRulesFile ? await loadRulesFromFile(effectiveRulesFile) : null;
  let ruleEval = evaluateMilestoneRules(milestone, evidence.items, rules);

  let effectiveSemanticMode = SEMANTIC_MODE_HEURISTIC;
  if (semanticMode === SEMANTIC_MODE_LLM) {
    const llmResult = await applyLlmSemanticEvaluation(ruleEval, {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: llmModel || DEFAULT_LLM_MODEL,
      milestone
    });
    ruleEval = llmResult.ruleEval;
    semanticWarnings.push(...llmResult.warnings);
    effectiveSemanticMode = llmResult.mode;
  }

  const bonusInfo = calculateProviderBonus(evidence.providerMeta);
  const { score, status, activityScore, baseScore, providerBonus } = scoreEvidence({
    ...counts,
    rulePassRate: ruleEval.passRate,
    providerBonus: bonusInfo.totalBonus
  });

  const communityHealth = buildCommunityHealth(evidence.providerMeta);
  const previousSnapshot = await loadPreviousSnapshot(repo);
  const communityTrend = computeTrend(communityHealth, previousSnapshot?.communityHealth);
  const communityHealthMarkdown = formatCommunityHealthMarkdown(communityHealth, communityTrend);

  const report = buildReport({
    repo,
    milestone,
    profile,
    providers: providerNames,
    since: sinceIso,
    score,
    status,
    activityScore,
    baseScore,
    providerBonus,
    providerBonusBreakdown: bonusInfo.breakdown,
    semanticMode: effectiveSemanticMode,
    semanticWarnings,
    counts,
    links,
    ruleEval,
    providerErrors: evidence.errors,
    communityHealthMarkdown
  });

  const reportPath = path.resolve(process.cwd(), out);
  await fs.writeFile(reportPath, report, 'utf8');

  const payload = buildJsonReport({
    repo,
    milestone,
    profile,
    providers: providerNames,
    sinceIso,
    score,
    status,
    activityScore,
    baseScore,
    providerBonus,
    providerBonusBreakdown: bonusInfo.breakdown,
    semanticMode: effectiveSemanticMode,
    semanticWarnings,
    counts,
    ruleEval,
    links,
    providerErrors: evidence.errors,
    providerMeta: evidence.providerMeta,
    communityHealth
  });

  let jsonReportPath = null;
  if (jsonOut) {
    jsonReportPath = path.resolve(process.cwd(), jsonOut);
    await fs.writeFile(jsonReportPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  let htmlReportPath = null;
  if (htmlOut) {
    htmlReportPath = path.resolve(process.cwd(), htmlOut);
    const html = renderHtmlReport(payload);
    await fs.writeFile(htmlReportPath, html, 'utf8');
  }

  await saveSnapshot(repo, { score, status, communityHealth, counts });

  return {
    summary: `[${status}] ${repo} milestone score ${score}/100 (activity:${activityScore} rules:${ruleEval.passRate}% commits:${counts.commits} prs:${counts.pulls} issues:${counts.issues} releases:${counts.releases})`,
    reportPath,
    jsonReportPath,
    htmlReportPath
  };
}

export const _internal = {
  scoreEvidence,
  calculateProviderBonus,
  normalizeDate,
  parseRepo,
  parseProviders,
  normalizeSemanticMode
};

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 評分權重和閾值基於 GCC 審查標準，修改時需考慮對所有 profile 的影響
 *    - --rules-file 優先於 --profile，兩者不會合併
 *    - Provider 系統透過 collectFromProviders 並行收集，單個失敗不阻塞其他
 * 2. 潛在邊界情況：
 *    - flattenCounts 只合併已知的 4 個 key，新 provider 類型需擴展 scoreEvidence
 *    - providerErrors 會出現在 JSON 和 Markdown 報告中
 *    - 所有 provider 都失敗時，evidence.items 為空但不會拋錯
 * 3. 模組依賴：
 *    - providers/（collectFromProviders, flattenCounts, flattenLinks）
 *    - rule-engine.js（evaluateMilestoneRules, loadRulesFromFile）
 *    - html-report.js（renderHtmlReport）
 *    - profiles/*.yaml（內建規則集）
 */
