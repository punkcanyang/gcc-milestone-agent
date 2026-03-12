import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluateMilestoneRules, loadRulesFromFile, _internal } from '../src/rule-engine.js';

test('splitMilestoneToRules parses comma-separated milestone text', () => {
  const rules = _internal.splitMilestoneToRules('submission template, issue discussion');
  assert.equal(rules.length, 2);
  assert.equal(rules[0].id, 'R1');
  assert.ok(rules[0].keywords.includes('submission'));
});

test('evaluateMilestoneRules matches evidence by keywords', () => {
  const evalResult = evaluateMilestoneRules(
    'submission template',
    [{ title: 'Add submission template', body: 'for issue workflow', url: 'https://example.com/1' }]
  );

  assert.equal(evalResult.total, 1);
  assert.equal(evalResult.passed, 1);
  assert.equal(evalResult.passRate, 100);
});

test('loadRulesFromFile reads YAML rules', async () => {
  const fixturePath = path.resolve(process.cwd(), 'test/fixtures/rules.yaml');
  const rules = await loadRulesFromFile(fixturePath);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].id, 'R-Template');
  assert.deepEqual(rules[0].keywords, ['submission', 'template']);
});

test('loadRulesFromFile throws on invalid schema', async () => {
  const invalidPath = path.resolve(process.cwd(), 'test/fixtures/invalid-rules.yaml');
  await assert.rejects(() => loadRulesFromFile(invalidPath), /Expected YAML with top-level 'rules' array/);
});

test('normalizeKeyword strips punctuation', () => {
  assert.equal(_internal.normalizeKeyword('Workflow!'), 'workflow');
});

test('normalizeExternalRules preserves ids and normalizes keywords', () => {
  const out = _internal.normalizeExternalRules([{ id: 'R9', text: 'x', keywords: ['Open-Source', 'OK!'] }]);
  assert.deepEqual(out[0].keywords, ['open-source', 'ok']);
});
