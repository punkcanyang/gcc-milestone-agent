/**
 * __ai_context__
 * 模組角色：HTML 報告渲染器，將 JSON 格式的驗證結果轉換為可視化 HTML 頁面
 * 系統位置：milestone-check.js → [本模組]（當 --html-out 選項啟用時調用）
 * 核心職責：
 *   1. 將 JSON payload 渲染為結構化的 HTML 報告
 *   2. 提供 XSS 安全的 HTML 轉義
 *   3. 根據分數動態配色（綠/橙/紅）
 * 設計說明：使用純字串模板生成，無外部模板引擎依賴
 */

// WHY: 分數對應的顏色閾值，與 milestone-check.js 的 THRESHOLD_MET/THRESHOLD_PARTIAL 保持語義一致
const COLOR_MET = '#16a34a';       // 綠色 — 達標
const COLOR_PARTIAL = '#d97706';   // 橙色 — 部分達標
const COLOR_NOT_MET = '#dc2626';   // 紅色 — 未達標
const SCORE_THRESHOLD_GREEN = 70;
const SCORE_THRESHOLD_YELLOW = 40;

/**
 * WHY: 防禦 XSS 攻擊 — 對 5 類 HTML 特殊字符進行轉義
 * 此函數是所有用戶輸入進入 HTML 的唯一入口
 */
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
  const scoreColor = payload.score >= SCORE_THRESHOLD_GREEN
    ? COLOR_MET
    : payload.score >= SCORE_THRESHOLD_YELLOW
      ? COLOR_PARTIAL
      : COLOR_NOT_MET;

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
  ${(payload.rules || []).map((r) => `
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

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 所有用戶輸入均透過 esc() 函數轉義，防止 XSS
 *    - 分數顏色閾值需與 milestone-check.js 的評分閾值語義一致
 *    - payload 結構與 buildJsonReport() 的輸出一致
 * 2. 潛在邊界情況：
 *    - payload.rules 可能為 undefined（已加 || [] 防護）
 *    - evidenceCounts 可能為 undefined（已用 ?. 防護）
 *    - esc() 對 null/undefined 輸入返回空字串
 * 3. 模組依賴：
 *    - 無外部依賴，被 milestone-check.js 調用
 */
