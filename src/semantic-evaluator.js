/**
 * __ai_context__
 * 模組角色：語義評估引擎，基於關鍵字覆蓋率和命中數量對規則匹配結果做語義判定
 * 系統位置：rule-engine.js → [本模組]（被 matchRule 調用）
 * 核心職責：
 *   1. 計算規則關鍵字的覆蓋率（matched / total keywords）
 *   2. 根據覆蓋率和命中次數給出 met/partially_met/not_met 判定
 *   3. 計算置信度分數和生成判定理由
 * 設計說明：目前為 heuristic 判定，未來可替換為 LLM-based 語義推理
 */

// WHY: 語義判定閾值
// hitCount >= 2 且覆蓋率 >= 60% 才視為 met —— 要求多條證據交叉驗證
// hitCount >= 1 且覆蓋率 >= 30% 視為 partially_met —— 有初步證據但不充分
const THRESHOLD_HIT_MET = 2;
const THRESHOLD_COVERAGE_MET = 60;
const THRESHOLD_HIT_PARTIAL = 1;
const THRESHOLD_COVERAGE_PARTIAL = 30;

// WHY: 置信度公式的上限和權重
// 上限 95% 是因為純 keyword 方式無法達到 100% 確定性
// 覆蓋率佔 70% 權重，命中數佔 30%（每次命中 +6 分，最多計算 5 次）
const CONFIDENCE_CAP = 95;
const COVERAGE_WEIGHT = 0.7;
const HIT_SCORE_PER_COUNT = 6;
const MAX_HIT_COUNT_FOR_SCORE = 5;

function uniq(arr) {
  return [...new Set(arr)];
}

function coverage(ruleKeywords, matchedKeywords) {
  if (!ruleKeywords.length) return 0;
  return Math.round((uniq(matchedKeywords).length / ruleKeywords.length) * 100);
}

export function evaluateSemanticVerdict(rule, hits) {
  const flatMatched = hits.flatMap((h) => h.matchedKeywords || []);
  const keywordCoverage = coverage(rule.keywords || [], flatMatched);
  const hitCount = hits.length;

  let verdict = 'not_met';
  if (hitCount >= THRESHOLD_HIT_MET && keywordCoverage >= THRESHOLD_COVERAGE_MET) {
    verdict = 'met';
  } else if (hitCount >= THRESHOLD_HIT_PARTIAL && keywordCoverage >= THRESHOLD_COVERAGE_PARTIAL) {
    verdict = 'partially_met';
  }

  // WHY: 置信度混合覆蓋率和命中數，cap 在 95% 表示 keyword 方式的固有限制
  const confidence = Math.min(
    CONFIDENCE_CAP,
    Math.round(keywordCoverage * COVERAGE_WEIGHT + Math.min(hitCount, MAX_HIT_COUNT_FOR_SCORE) * HIT_SCORE_PER_COUNT)
  );
  const citedUrls = uniq(hits.map((h) => h.url)).slice(0, 3);

  let rationale = 'No sufficient evidence matched this rule.';
  if (verdict === 'met') {
    rationale = `Multiple evidence items matched with ${keywordCoverage}% keyword coverage.`;
  } else if (verdict === 'partially_met') {
    rationale = `Some evidence matched with ${keywordCoverage}% keyword coverage.`;
  }

  return { verdict, confidence, rationale, citedUrls, keywordCoverage };
}

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 當前為純 heuristic 評估，置信度上限 95% 反映這一限制
 *    - 覆蓋率計算基於去重後的已匹配關鍵字數量
 *    - hitCount 對置信度的貢獻有上限（MAX_HIT_COUNT_FOR_SCORE = 5）
 * 2. 潛在邊界情況：
 *    - rule.keywords 為空陣列時，覆蓋率為 0，verdict 為 not_met
 *    - hits 為空陣列時，所有指標為 0
 *    - 所有閾值常數可獨立調整而不影響其他模組
 * 3. 模組依賴：
 *    - 無外部依賴，被 rule-engine.js 的 matchRule 調用
 */
