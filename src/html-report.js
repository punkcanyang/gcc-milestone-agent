function esc(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sectionTitle(text) {
  return `<h2 style="margin:18px 0 8px;">${esc(text)}</h2>`;
}

function listLinks(links = []) {
  if (!links.length) return '<p style="opacity:.7;">(none)</p>';
  return `<ul>${links.map((url) => `<li><a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(url)}</a></li>`).join('')}</ul>`;
}

export function renderHtmlReport(payload) {
  const scoreColor = payload.score >= 70 ? '#16a34a' : payload.score >= 40 ? '#d97706' : '#dc2626';

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Milestone Report - ${esc(payload.repo)}</title>
  <style>
    body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:980px;margin:24px auto;padding:0 16px;line-height:1.5;color:#111827}
    .card{border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:10px 0;background:#fff}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
    .badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#f3f4f6;font-size:12px}
    code{background:#f3f4f6;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body>
  <h1>GCC Milestone Verification Report</h1>
  <div class="card">
    <div><strong>Repo:</strong> ${esc(payload.repo)}</div>
    <div><strong>Milestone:</strong> ${esc(payload.milestone)}</div>
    <div><strong>Profile:</strong> ${esc(payload.profile || 'none')}</div>
    <div><strong>Generated:</strong> ${esc(payload.generatedAt)}</div>
  </div>

  <div class="grid">
    <div class="card"><div class="badge">Status</div><h3>${esc(payload.status)}</h3></div>
    <div class="card"><div class="badge">Score</div><h3 style="color:${scoreColor}">${esc(payload.score)}/100</h3></div>
    <div class="card"><div class="badge">Activity</div><h3>${esc(payload.activityScore)}/100</h3></div>
    <div class="card"><div class="badge">Rule pass</div><h3>${esc(payload.rulePassRate)}%</h3></div>
  </div>

  ${sectionTitle('Evidence Counts')}
  <div class="card">
    <ul>
      <li>Commits: ${esc(payload.evidenceCounts?.commits)}</li>
      <li>PRs: ${esc(payload.evidenceCounts?.pulls)}</li>
      <li>Issues: ${esc(payload.evidenceCounts?.issues)}</li>
      <li>Releases: ${esc(payload.evidenceCounts?.releases)}</li>
    </ul>
  </div>

  ${sectionTitle('Rule Evaluation')}
  ${payload.rules.map((r) => `
    <div class="card">
      <div><strong>${esc(r.id)}</strong> - ${esc(r.text)}</div>
      <div>Keyword matched: <code>${esc(r.result?.matched ? 'yes' : 'no')}</code></div>
      <div>Semantic: <code>${esc(r.result?.semantic?.verdict || 'n/a')}</code> / confidence <code>${esc(r.result?.semantic?.confidence ?? 'n/a')}</code></div>
      <div>${esc(r.result?.semantic?.rationale || '')}</div>
      ${listLinks((r.result?.semantic?.citedUrls || r.result?.sampleLinks?.map((x) => x.url) || []).slice(0, 3))}
    </div>
  `).join('')}

  ${sectionTitle('Evidence Links')}
  <div class="card"><h3>Commits</h3>${listLinks(payload.evidenceLinks?.commits || [])}</div>
  <div class="card"><h3>PRs</h3>${listLinks(payload.evidenceLinks?.pulls || [])}</div>
  <div class="card"><h3>Issues</h3>${listLinks(payload.evidenceLinks?.issues || [])}</div>
  <div class="card"><h3>Releases</h3>${listLinks(payload.evidenceLinks?.releases || [])}</div>
</body>
</html>`;
}
