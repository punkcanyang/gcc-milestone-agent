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

function listExplainability(items = []) {
  if (!items.length) return '<p style="opacity:.7;">(none)</p>';
  return `<ul>${items.map((item) => `
    <li>
      <div><strong>${esc(item.source || 'unknown')}</strong></div>
      <div>${esc(item.snippet || '')}</div>
      <div><a href="${esc(item.url || '')}" target="_blank" rel="noreferrer">${esc(item.url || '')}</a></div>
    </li>
  `).join('')}</ul>`;
}

function clampPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function meterRow(label, value, color) {
  const pct = clampPercent(value);
  return `
    <div style="margin:8px 0;">
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span>${esc(label)}</span>
        <span>${esc(pct)}%</span>
      </div>
      <div class="meter"><span style="width:${esc(pct)}%;background:${esc(color)}"></span></div>
    </div>
  `;
}

function renderDashboard(payload) {
  const rules = payload.rules || [];
  const verdictCounts = { met: 0, partially_met: 0, not_met: 0 };
  for (const r of rules) {
    const verdict = r?.result?.semantic?.verdict;
    if (verdict in verdictCounts) verdictCounts[verdict] += 1;
  }
  const totalRules = rules.length || 1;
  const metRate = Math.round((verdictCounts.met / totalRules) * 100);
  const partialRate = Math.round((verdictCounts.partially_met / totalRules) * 100);
  const notMetRate = Math.round((verdictCounts.not_met / totalRules) * 100);
  const bonusPct = Math.round((Number(payload.providerBonus || 0) / 20) * 100);

  return `
    <div class="card" id="dashboardSection">
      ${meterRow('Overall Score', payload.score, '#2563eb')}
      ${meterRow('Activity Score', payload.activityScore, '#0ea5e9')}
      ${meterRow('Rule Pass Rate', payload.rulePassRate, '#16a34a')}
      ${meterRow('Provider Bonus Utilization', bonusPct, '#d97706')}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;" />
      ${meterRow('Rules: met', metRate, '#16a34a')}
      ${meterRow('Rules: partially_met', partialRate, '#d97706')}
      ${meterRow('Rules: not_met', notMetRate, '#dc2626')}
    </div>
  `;
}

function renderCommunityHealth(payload) {
  const health = payload.communityHealth;
  if (!health || (!health.github && !health.discord && !health.twitter && !health.telegram && !health.discussions)) {
    return '';
  }

  const rows = [];
  if (health.github) {
    rows.push(`<div class="card"><div class="badge">GitHub</div><h3>${esc(health.github.stars)} ⭐ · ${esc(health.github.forks)} forks · ${esc(health.github.contributors)} contributors</h3></div>`);
  }
  if (health.discord) {
    rows.push(`<div class="card"><div class="badge">Discord</div><h3>${esc(health.discord.memberCount)} members (${esc(health.discord.onlineCount)} online)</h3></div>`);
  }
  if (health.twitter) {
    rows.push(`<div class="card"><div class="badge">Twitter</div><h3>@${esc(health.twitter.handle)} · ${esc(health.twitter.followerCount)} followers</h3></div>`);
  }
  if (health.telegram) {
    rows.push(`<div class="card"><div class="badge">Telegram</div><h3>${esc(health.telegram.memberCount)} members</h3></div>`);
  }
  if (health.discussions) {
    rows.push(`<div class="card"><div class="badge">Discussions</div><h3>${esc(health.discussions.totalCount)} threads · ${esc(health.discussions.answeredRate)}% answered</h3></div>`);
  }

  return rows.join('\n');
}

function renderAttachments(payload) {
  const meta = payload.providerMeta || {};
  const attachments = [];
  for (const provider of Object.values(meta)) {
    if (provider && Array.isArray(provider.attachments)) {
      attachments.push(...provider.attachments);
    }
  }
  if (!attachments.length) return '';

  return `
    ${sectionTitle('Visual Evidence (Screenshots)')}
    <div class="grid">
      ${attachments.map(att => `
        <div class="card" style="text-align:center;">
          <a href="${esc(att.url)}" target="_blank">
            <img src="${esc(att.url)}" alt="Screenshot" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e5e7eb;" />
          </a>
          <div style="font-size:12px;color:#6b7280;margin-top:8px;">Open to view full image</div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderHtmlReport(payload) {
  const rules = payload.rules || [];
  const availableSources = [...new Set(rules.map((r) => r.source).filter(Boolean))];
  const sourceOptions = availableSources
    .map((source) => `<option value="${esc(source)}">${esc(source)}</option>`)
    .join('');

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
    .meter{height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden}
    .meter span{display:block;height:100%}
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

  ${sectionTitle('Reviewer Dashboard')}
  ${renderDashboard(payload)}

  ${sectionTitle('Community Health')}
  <div class="grid">
    ${renderCommunityHealth(payload)}
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
  <div class="card">
    <label for="ruleVerdictFilter"><strong>Semantic verdict:</strong></label>
    <select id="ruleVerdictFilter" onchange="applyRuleFilters()">
      <option value="all">all</option>
      <option value="met">met</option>
      <option value="partially_met">partially_met</option>
      <option value="not_met">not_met</option>
    </select>
    <label for="ruleSourceFilter" style="margin-left:12px;"><strong>Source:</strong></label>
    <select id="ruleSourceFilter" onchange="applyRuleFilters()">
      <option value="all">all</option>
      ${sourceOptions}
    </select>
  </div>
  ${rules.map((r) => `
    <div class="card rule-card" data-semantic="${esc(r.result?.semantic?.verdict || 'n/a')}" data-source="${esc(r.source || '')}">
      <div><strong>${esc(r.id)}</strong> - ${esc(r.text)}</div>
      <div>Keyword matched: <code>${esc(r.result?.matched ? 'yes' : 'no')}</code></div>
      <div>Semantic: <code>${esc(r.result?.semantic?.verdict || 'n/a')}</code> / confidence <code>${esc(r.result?.semantic?.confidence ?? 'n/a')}</code></div>
      <div>Coverage: semantic <code>${esc(r.result?.semantic?.semanticCoverage ?? 'n/a')}%</code> / keyword <code>${esc(r.result?.semantic?.keywordCoverage ?? 'n/a')}%</code> / source diversity <code>${esc(r.result?.semantic?.sourceDiversity ?? 'n/a')}</code></div>
      <div>${esc(r.result?.semantic?.rationale || '')}</div>
      <div><strong>Explainability</strong></div>
      ${listExplainability((r.result?.explainability || []).slice(0, 3))}
      ${listLinks((r.result?.semantic?.citedUrls || r.result?.sampleLinks?.map((x) => x.url) || []).slice(0, 3))}
    </div>
  `).join('')}

  ${sectionTitle('Evidence Links')}
  <div class="card"><h3>Commits</h3>${listLinks(payload.evidenceLinks?.commits || [])}</div>
  <div class="card"><h3>PRs</h3>${listLinks(payload.evidenceLinks?.pulls || [])}</div>
  <div class="card"><h3>Issues</h3>${listLinks(payload.evidenceLinks?.issues || [])}</div>
  <div class="card"><h3>Releases</h3>${listLinks(payload.evidenceLinks?.releases || [])}</div>
  ${renderAttachments(payload)}
  <script>
    function applyRuleFilters() {
      const verdict = document.getElementById('ruleVerdictFilter')?.value || 'all';
      const source = document.getElementById('ruleSourceFilter')?.value || 'all';
      const cards = document.querySelectorAll('.rule-card');
      cards.forEach((card) => {
        const cardVerdict = card.dataset.semantic || '';
        const cardSource = card.dataset.source || '';
        const verdictMatch = verdict === 'all' || cardVerdict === verdict;
        const sourceMatch = source === 'all' || cardSource === source;
        card.style.display = verdictMatch && sourceMatch ? '' : 'none';
      });
    }
    applyRuleFilters();
  </script>
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
