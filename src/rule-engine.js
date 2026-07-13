/**
 * __ai_context__
 * 模組角色：Milestone 規則引擎，負責解析 milestone 文本為可驗證的規則，並與證據進行匹配
 * 系統位置：milestone-check.js → [本模組] → semantic-evaluator.js
 * 核心職責：
 *   1. 將 milestone 文本（逗號/換行分隔）拆分為獨立規則
 *   2. 從 YAML 文件加載外部規則定義
 *   3. 以關鍵字匹配方式評估證據是否符合規則
 * 關鍵依賴：semantic-evaluator.js（語義評估）、js-yaml（YAML 解析）
 */
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { evaluateSemanticVerdict } from './semantic-evaluator.js';

// WHY: 統一最小關鍵字長度，避免 milestone 自動解析與外部規則行為不一致
// 設為 2 以支援短縮寫如 "PR"、"CI" 等常見技術用語
const MIN_KEYWORD_LENGTH = 2;
const EXPLAIN_SNIPPET_MAX = 180;
const EXPLAIN_CONTEXT_BEFORE = 40;
const EXPLAIN_CONTEXT_AFTER = 120;
const PASSING_SEMANTIC_VERDICTS = new Set(['met']);

function normalizeKeyword(word) {
  return word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]/gu, '');
}

function normalizeRuleSource(source) {
  if (typeof source !== 'string') return null;
  const normalized = source.trim();
  return normalized || null;
}

function splitMilestoneToRules(milestoneText) {
  const text = String(milestoneText || '').trim();
  if (!text) return [];

  const byLines = text
    .split(/\r?\n/)
    .map((x) => x.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean);

  const rawParts = byLines.length > 1
    ? byLines
    : text.split(/,|，|;|；| and | 以及 |\|/i).map((x) => x.trim()).filter(Boolean);

  return rawParts.map((part, idx) => ({
    id: `R${idx + 1}`,
    text: part,
    source: null,
    keywords: part
      .split(/\s+/)
      .map(normalizeKeyword)
      // WHY: 使用統一常數過濾短停用詞，避免與 normalizeExternalRules 不一致
      .filter((w) => w.length >= MIN_KEYWORD_LENGTH)
      .slice(0, 8)
  }));
}

function normalizeExternalRules(rules) {
  // WHY: 防禦性斷言 — 確保外部規則為陣列，避免 YAML 解析結果異常
  assert(Array.isArray(rules), `Expected rules to be an array, got ${typeof rules}`);

  return rules.map((r, idx) => ({
    id: r.id || `R${idx + 1}`,
    text: r.text || `Rule ${idx + 1}`,
    source: normalizeRuleSource(r.source),
    keywords: (r.keywords || [])
      .map((k) => normalizeKeyword(String(k)))
      // WHY: 使用與 splitMilestoneToRules 相同的 MIN_KEYWORD_LENGTH 常數
      .filter((k) => k.length >= MIN_KEYWORD_LENGTH)
  }));
}

export async function loadRulesFromFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(abs, 'utf8');
  const parsed = yaml.load(raw);

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rules)) {
    throw new Error(`Invalid rules file: ${filePath}. Expected YAML with top-level 'rules' array.`);
  }

  return normalizeExternalRules(parsed.rules);
}

function evidenceText(item) {
  return `${item.title || ''} ${item.body || ''}`.toLowerCase();
}

function buildExplainabilitySnippet(item, matchedKeywords) {
  const normalized = `${item.title || ''} ${item.body || ''}`.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const normalizedLower = normalized.toLowerCase();
  const anchor = matchedKeywords.find((kw) => normalizedLower.includes(kw));
  if (!anchor) {
    return normalized.length > EXPLAIN_SNIPPET_MAX
      ? `${normalized.slice(0, EXPLAIN_SNIPPET_MAX)}...`
      : normalized;
  }

  const anchorIdx = normalizedLower.indexOf(anchor);
  const start = Math.max(0, anchorIdx - EXPLAIN_CONTEXT_BEFORE);
  const end = Math.min(normalized.length, anchorIdx + anchor.length + EXPLAIN_CONTEXT_AFTER);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalized.length ? '...' : '';
  return `${prefix}${normalized.slice(start, end).trim()}${suffix}`;
}

function isRulePassed(result) {
  return PASSING_SEMANTIC_VERDICTS.has(result?.semantic?.verdict);
}

function normalizeRuleResult(result) {
  const keywordMatched = Boolean(result?.keywordMatched ?? result?.matched);
  const passed = isRulePassed(result);
  return {
    ...result,
    keywordMatched,
    passed,
    // WHY: `matched` is kept as a legacy pass alias; raw keyword hits live in `keywordMatched`.
    matched: passed
  };
}

export function recalculateRuleEval(ruleEval) {
  const rules = (Array.isArray(ruleEval?.rules) ? ruleEval.rules : []).map((rule) => ({
    ...rule,
    result: normalizeRuleResult(rule.result || {})
  }));
  const total = rules.length;
  const passed = rules.filter((rule) => rule.result.passed).length;
  const passRate = total ? Math.round((passed / total) * 100) : 0;

  return {
    ...ruleEval,
    rules,
    passRate,
    passed,
    total
  };
}

function matchRule(rule, evidenceItems) {
  if (!rule.keywords.length) {
    return normalizeRuleResult({
      keywordMatched: false,
      hitCount: 0,
      sampleLinks: [],
      explainability: [],
      semantic: evaluateSemanticVerdict(rule, [])
    });
  }

  // WHY: 若規則指定 source，僅在該 provider 的證據中匹配
  const candidateEvidence = rule.source
    ? evidenceItems.filter((ev) => ev?.source === rule.source)
    : evidenceItems;

  const hits = [];
  for (const ev of candidateEvidence) {
    const text = evidenceText(ev);
    const matchedKeywords = rule.keywords.filter((kw) => text.includes(kw));
    if (matchedKeywords.length > 0) {
      hits.push({
        url: ev.url,
        source: ev.source || null,
        matchedKeywords,
        snippet: buildExplainabilitySnippet(ev, matchedKeywords)
      });
    }
  }

  const sampleLinks = hits.slice(0, 3).map((h) => ({ url: h.url, matchedKeywords: h.matchedKeywords }));
  const explainability = hits.slice(0, 3).map((h) => ({
    url: h.url,
    source: h.source,
    matchedKeywords: h.matchedKeywords,
    snippet: h.snippet
  }));
  return normalizeRuleResult({
    keywordMatched: hits.length > 0,
    hitCount: hits.length,
    sampleLinks,
    explainability,
    semantic: evaluateSemanticVerdict(rule, hits)
  });
}

export function evaluateMilestoneRules(milestoneText, evidenceItems, externalRules = null) {
  // WHY: 防禦性斷言 — 確保 evidenceItems 為陣列
  assert(Array.isArray(evidenceItems), `Expected evidenceItems to be an array, got ${typeof evidenceItems}`);

  const rules = externalRules?.length ? externalRules : splitMilestoneToRules(milestoneText);
  if (!rules.length) {
    return { rules: [], passRate: 0, passed: 0, total: 0 };
  }

  const evaluated = rules.map((rule) => ({
    ...rule,
    result: matchRule(rule, evidenceItems)
  }));

  return recalculateRuleEval({ rules: evaluated });
}

export const _internal = {
  splitMilestoneToRules,
  normalizeExternalRules,
  normalizeKeyword,
  normalizeRuleSource,
  buildExplainabilitySnippet,
  isRulePassed,
  recalculateRuleEval,
  MIN_KEYWORD_LENGTH
};

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - Milestone 文本使用逗號/分號/換行/and/| 分隔多條規則
 *    - 關鍵字匹配為 case-insensitive 的子字串包含（非精確匹配），但通過狀態以 semantic verdict 為準
 *    - MIN_KEYWORD_LENGTH = 2 適用於中英文混合場景
 * 2. 潛在邊界情況：
 *    - 單行 milestone text 無分隔符時，整體視為一條規則
 *    - 外部 YAML 規則的 keywords 為空時，該規則永遠不會 matched
 *    - normalizeKeyword 會移除所有非字母/數字/底線/連字號的字符
 * 3. 模組依賴：
 *    - semantic-evaluator.js（evaluateSemanticVerdict）
 *    - js-yaml（YAML 文件解析）
 */
