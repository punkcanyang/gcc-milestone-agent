import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLlmSemanticEvaluation, requestLlmSemanticVerdict } from '../src/llm-semantic.js';

test('requestLlmSemanticVerdict parses output_text JSON payload', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        verdict: 'met',
        confidence: 88,
        rationale: 'Cross-source evidence strongly supports this rule.'
      })
    })
  });

  const result = await requestLlmSemanticVerdict({
    apiKey: 'test-key',
    model: 'gpt-5-mini',
    milestone: 'GCC allocation verification',
    rule: { id: 'R1', text: 'CI is healthy', keywords: ['ci', 'success'] },
    semantic: { verdict: 'partially_met', confidence: 61, rationale: 'heuristic' },
    explainability: [{ source: 'github-actions', snippet: 'CI workflow success on main', url: 'https://example.com/ci' }],
    fetchImpl: mockFetch
  });

  assert.equal(result.verdict, 'met');
  assert.equal(result.confidence, 88);
  assert.ok(result.rationale.includes('Cross-source'));
});

test('applyLlmSemanticEvaluation falls back when OPENAI_API_KEY is missing', async () => {
  const ruleEval = {
    rules: [
      {
        id: 'R1',
        text: 'CI is healthy',
        keywords: ['ci', 'success'],
        result: {
          semantic: { verdict: 'partially_met', confidence: 61, rationale: 'heuristic' },
          explainability: []
        }
      }
    ],
    passRate: 100,
    passed: 1,
    total: 1
  };

  const out = await applyLlmSemanticEvaluation(ruleEval, {
    apiKey: '',
    model: 'gpt-5-mini'
  });

  assert.equal(out.mode, 'heuristic');
  assert.ok(out.warnings.length > 0);
  assert.equal(out.ruleEval.rules[0].result.semantic.verdict, 'partially_met');
});

test('applyLlmSemanticEvaluation overrides semantic verdict when llm succeeds', async () => {
  const ruleEval = {
    rules: [
      {
        id: 'R1',
        text: 'CI is healthy',
        keywords: ['ci', 'success'],
        result: {
          semantic: { verdict: 'partially_met', confidence: 61, rationale: 'heuristic' },
          explainability: [{ source: 'github-actions', snippet: 'CI workflow success on main', url: 'https://example.com/ci' }]
        }
      }
    ],
    passRate: 100,
    passed: 1,
    total: 1
  };

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        verdict: 'met',
        confidence: 92,
        rationale: 'Strong and direct evidence.'
      })
    })
  });

  const out = await applyLlmSemanticEvaluation(ruleEval, {
    apiKey: 'test-key',
    model: 'gpt-5-mini',
    fetchImpl: mockFetch
  });

  assert.equal(out.mode, 'llm');
  assert.equal(out.warnings.length, 0);
  assert.equal(out.ruleEval.rules[0].result.semantic.verdict, 'met');
  assert.equal(out.ruleEval.rules[0].result.semantic.confidence, 92);
  assert.equal(out.ruleEval.rules[0].result.semantic.method, 'llm');
});
