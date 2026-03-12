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
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}_-]/gu, ''))
      .filter((w) => w.length >= 3)
      .slice(0, 8)
  }));
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

  return {
    matched: hits.length > 0,
    hitCount: hits.length,
    sampleLinks: hits.slice(0, 3)
  };
}

export function evaluateMilestoneRules(milestoneText, evidenceItems) {
  const rules = splitMilestoneToRules(milestoneText);
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
