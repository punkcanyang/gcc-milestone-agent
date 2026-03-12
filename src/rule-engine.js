import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { evaluateSemanticVerdict } from './semantic-evaluator.js';

function normalizeKeyword(word) {
  return word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]/gu, '');
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
    keywords: part
      .split(/\s+/)
      .map(normalizeKeyword)
      .filter((w) => w.length >= 3)
      .slice(0, 8)
  }));
}

function normalizeExternalRules(rules) {
  return (rules || []).map((r, idx) => ({
    id: r.id || `R${idx + 1}`,
    text: r.text || `Rule ${idx + 1}`,
    keywords: (r.keywords || [])
      .map((k) => normalizeKeyword(String(k)))
      .filter((k) => k.length >= 2)
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

function matchRule(rule, evidenceItems) {
  if (!rule.keywords.length) {
    return { matched: false, hitCount: 0, sampleLinks: [] };
  }

  const hits = [];
  for (const ev of evidenceItems) {
    const text = evidenceText(ev);
    const matchedKeywords = rule.keywords.filter((kw) => text.includes(kw));
    if (matchedKeywords.length > 0) {
      hits.push({ url: ev.url, matchedKeywords });
    }
  }

  const sampleLinks = hits.slice(0, 3);
  return {
    matched: hits.length > 0,
    hitCount: hits.length,
    sampleLinks,
    semantic: evaluateSemanticVerdict(rule, hits)
  };
}

export function evaluateMilestoneRules(milestoneText, evidenceItems, externalRules = null) {
  const rules = externalRules?.length ? externalRules : splitMilestoneToRules(milestoneText);
  if (!rules.length) {
    return { rules: [], passRate: 0, passed: 0, total: 0 };
  }

  const evaluated = rules.map((rule) => ({
    ...rule,
    result: matchRule(rule, evidenceItems)
  }));

  const passed = evaluated.filter((r) => r.result.matched).length;
  const total = evaluated.length;
  const passRate = total ? Math.round((passed / total) * 100) : 0;

  return { rules: evaluated, passRate, passed, total };
}

export const _internal = {
  splitMilestoneToRules,
  normalizeExternalRules,
  normalizeKeyword
};
