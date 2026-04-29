/**
 * __ai_context__
 * 模組角色：可選的 LLM 語義判定模組（對 heuristic 結果做覆寫）
 * 系統位置：milestone-check.js → [本模組]
 * 核心職責：
 *   1. 針對每條規則請求 LLM 給出 verdict/confidence/rationale
 *   2. 在 LLM 可用時覆蓋 heuristic semantic 結果
 *   3. 在 API key 缺失或請求失敗時 graceful fallback
 */

import fs from 'node:fs';

const OPENAI_RESPONSES_API = 'https://api.openai.com/v1/responses';
const OPENAI_CHAT_API = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_LLM_MODEL = 'gpt-5-mini';
const DEFAULT_VISION_MODEL = 'gpt-4o-mini';
const VALID_VERDICTS = new Set(['met', 'partially_met', 'not_met']);
const MAX_CONFIDENCE = 100;
const MAX_RULES_FOR_LLM = 30;

/**
 * @typedef {Object} ExplainabilitySnippet
 * @property {string} [source]
 * @property {string} [snippet]
 * @property {string} [url]
 */

/**
 * @typedef {Object} LlmSemanticRequest
 * @property {string} apiKey
 * @property {string} [model]
 * @property {string} [milestone]
 * @property {{ id?: string, text?: string, keywords?: string[] }} [rule]
 * @property {{ verdict?: string, confidence?: number, rationale?: string }} [semantic]
 * @property {ExplainabilitySnippet[]} [explainability]
 * @property {typeof fetch} [fetchImpl]
 */

/**
 * @typedef {Object} LlmSemanticVerdict
 * @property {'met'|'partially_met'|'not_met'} verdict
 * @property {number} confidence
 * @property {string} rationale
 */

/**
 * @typedef {Object} LlmEvaluationResult
 * @property {'heuristic'|'llm'|'llm_with_fallback'} mode
 * @property {string[]} warnings
 * @property {any} ruleEval
 */

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }
  return chunks.join('\n').trim();
}

function normalizeVerdict(raw) {
  const verdict = String(raw || '').trim().toLowerCase();
  if (!VALID_VERDICTS.has(verdict)) {
    throw new Error(`Invalid LLM verdict: ${raw}`);
  }
  return verdict;
}

function normalizeConfidence(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_CONFIDENCE, Math.round(value)));
}

/**
 * @param {LlmSemanticRequest} params
 * @returns {Promise<LlmSemanticVerdict>}
 */
export async function requestLlmSemanticVerdict({
  apiKey,
  model = DEFAULT_LLM_MODEL,
  milestone,
  rule,
  semantic,
  explainability,
  fetchImpl = fetch
}) {
  const evidenceText = (explainability || [])
    .slice(0, 5)
    .map((x, idx) => `${idx + 1}. [${x.source || 'unknown'}] ${x.snippet || ''} (${x.url || ''})`)
    .join('\n');

  const systemPrompt = [
    'You evaluate milestone verification rules from repository evidence.',
    'Return strict JSON with fields: verdict, confidence, rationale.',
    'verdict must be one of: met, partially_met, not_met.',
    'confidence must be an integer 0-100.',
    'Use provided evidence only; do not invent facts.'
  ].join(' ');

  const userPrompt = [
    `Milestone: ${milestone || ''}`,
    `Rule: ${rule?.id || ''} - ${rule?.text || ''}`,
    `Keywords: ${(rule?.keywords || []).join(', ')}`,
    `Heuristic semantic: verdict=${semantic?.verdict || 'n/a'}, confidence=${semantic?.confidence ?? 'n/a'}, rationale=${semantic?.rationale || ''}`,
    `Evidence snippets:\n${evidenceText || '(none)'}`,
    'Provide final semantic verdict based on these snippets.'
  ].join('\n\n');

  const res = await fetchImpl(OPENAI_RESPONSES_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_output_tokens: 220
    })
  });

  if (!res.ok) {
    const body = typeof res.text === 'function' ? await res.text() : '';
    throw new Error(`OpenAI API error: HTTP ${res.status} ${body.slice(0, 240)}`);
  }

  const payload = await res.json();
  const text = extractOutputText(payload);
  if (!text) {
    throw new Error('OpenAI API returned empty output_text');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse LLM JSON: ${text.slice(0, 240)}`);
  }

  return {
    verdict: normalizeVerdict(parsed.verdict),
    confidence: normalizeConfidence(parsed.confidence),
    rationale: String(parsed.rationale || '').trim() || 'LLM semantic reasoning applied.'
  };
}

/**
 * 透過 Vision AI 解析圖片中的數字 (例如：Twitter 粉絲數)
 * @param {string} apiKey 
 * @param {string} imagePath 
 * @param {string} [prompt]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>}
 */
export async function requestLlmVisionExtraction(apiKey, imagePath, prompt = 'Please read this Twitter profile screenshot and reply with the number of "Followers". Reply ONLY with the number (e.g. 12345). If you cannot find it, reply "unknown".', fetchImpl = fetch) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const base64Image = fs.readFileSync(imagePath, { encoding: 'base64' });
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const res = await fetchImpl(OPENAI_CHAT_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEFAULT_VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: dataUrl }
            }
          ]
        }
      ],
      max_tokens: 50
    })
  });

  if (!res.ok) {
    const body = typeof res.text === 'function' ? await res.text() : '';
    throw new Error(`OpenAI Vision API error: HTTP ${res.status} ${body.slice(0, 240)}`);
  }

  const payload = await res.json();
  const text = payload.choices?.[0]?.message?.content || '';
  const result = text.trim();
  
  // 嘗試清洗並提取純數字
  const match = result.replace(/,/g, '').match(/(\d+)/);
  if (match && result.toLowerCase() !== 'unknown') {
    return match[1];
  }
  return 'unknown';
}

/**
 * @param {any} ruleEval
 * @param {{ apiKey?: string, model?: string, milestone?: string, fetchImpl?: typeof fetch, maxRules?: number }} [options]
 * @returns {Promise<LlmEvaluationResult>}
 */
export async function applyLlmSemanticEvaluation(
  ruleEval,
  {
    apiKey,
    model = DEFAULT_LLM_MODEL,
    milestone = '',
    fetchImpl = fetch,
    maxRules = MAX_RULES_FOR_LLM
  } = {}
) {
  if (!apiKey) {
    return {
      mode: 'heuristic',
      warnings: ['OPENAI_API_KEY not set; using heuristic semantic evaluation.'],
      ruleEval
    };
  }

  const warnings = [];
  const nextRules = [];
  const rules = Array.isArray(ruleEval?.rules) ? ruleEval.rules : [];

  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    if (i >= maxRules) {
      nextRules.push(rule);
      continue;
    }

    try {
      const llm = await requestLlmSemanticVerdict({
        apiKey,
        model,
        milestone,
        rule,
        semantic: rule?.result?.semantic,
        explainability: rule?.result?.explainability || [],
        fetchImpl
      });

      nextRules.push({
        ...rule,
        result: {
          ...rule.result,
          semantic: {
            ...rule.result.semantic,
            ...llm,
            method: 'llm'
          }
        }
      });
    } catch (error) {
      warnings.push(`Rule ${rule?.id || 'unknown'} LLM semantic fallback: ${error.message}`);
      nextRules.push(rule);
    }
  }

  return {
    mode: warnings.length === 0 ? 'llm' : 'llm_with_fallback',
    warnings,
    ruleEval: {
      ...ruleEval,
      rules: nextRules
    }
  };
}

export const _internal = {
  extractOutputText,
  normalizeVerdict,
  normalizeConfidence,
  DEFAULT_LLM_MODEL,
  MAX_RULES_FOR_LLM
};

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - OpenAI Responses API 返回 output_text 或 output[].content[].text
 *    - LLM 回傳內容為 JSON 字串（verdict/confidence/rationale）
 * 2. 潛在邊界情況：
 *    - API 返回非 JSON 文本時會 fallback 到 heuristic
 *    - 部分規則失敗時 mode 為 llm_with_fallback
 * 3. 模組依賴：
 *    - 無內部模組依賴，由 milestone-check.js 調用
 */
