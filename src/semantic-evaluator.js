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
  if (hitCount >= 2 && keywordCoverage >= 60) verdict = 'met';
  else if (hitCount >= 1 && keywordCoverage >= 30) verdict = 'partially_met';

  const confidence = Math.min(95, Math.round(keywordCoverage * 0.7 + Math.min(hitCount, 5) * 6));
  const citedUrls = uniq(hits.map((h) => h.url)).slice(0, 3);

  let rationale = 'No sufficient evidence matched this rule.';
  if (verdict === 'met') {
    rationale = `Multiple evidence items matched with ${keywordCoverage}% keyword coverage.`;
  } else if (verdict === 'partially_met') {
    rationale = `Some evidence matched with ${keywordCoverage}% keyword coverage.`;
  }

  return { verdict, confidence, rationale, citedUrls, keywordCoverage };
}
