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

function renderPhaseInfo(payload) {
  const phase = payload.phase;
  if (!phase) return '';
  const dependsOn = Array.isArray(phase.dependsOn) && phase.dependsOn.length
    ? phase.dependsOn.join(', ')
    : '(none)';
  const warnings = payload.dependencyWarnings || [];
  return `
    <div class="card">
      <div><strong>Phase:</strong> ${esc(phase.id)}${phase.title ? ` (${esc(phase.title)})` : ''}</div>
      <div><strong>Depends on:</strong> ${esc(dependsOn)}</div>
    </div>
    ${warnings.length ? `
      ${sectionTitle('Dependency Warnings')}
      <div class="card"><ul>${warnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul></div>
    ` : ''}
  `;
}

function renderTimeline(payload) {
  const timeline = payload.timeline || [];
  if (!timeline.length) return '';

  const itemsHtml = timeline.map((item) => {
    const isCurrentClass = item.isCurrent ? ' current' : '';
    const statusClass = esc(item.status);
    const scoreText = item.score !== null ? `${esc(item.score)}/100` : 'N/A';
    const dateText = item.generatedAt ? esc(item.generatedAt.slice(0, 10)) : '-';
    
    let badgeText = '';
    if (item.status === 'met') badgeText = '✓';
    else if (item.status === 'partially_met') badgeText = '⚠';
    else if (item.status === 'not_met') badgeText = '✗';
    else badgeText = '○';

    return `
      <div class="timeline-item">
        <div class="timeline-badge ${statusClass}${isCurrentClass}">${badgeText}</div>
        <div class="timeline-content">
          <div class="timeline-title">${esc(item.id)}${item.isCurrent ? ' <span style="font-size:10px;color:#2563eb;font-weight:bold;">(Current)</span>' : ''}</div>
          <div class="timeline-desc" style="font-size:12px;opacity:0.8;margin-top:2px;">${esc(item.title || 'no title')}</div>
          <div class="timeline-score">${scoreText}</div>
          <div class="timeline-date">${dateText}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
    ${sectionTitle('Phase Verification Timeline')}
    <div class="timeline-container">
      ${itemsHtml}
    </div>
  `;
}

function renderComparison(payload) {
  const timeline = payload.timeline || [];
  const ranItems = timeline.filter(item => item.status !== 'pending');
  if (ranItems.length < 2) return '';

  const currentItem = ranItems.find(item => item.isCurrent) || ranItems[ranItems.length - 1];

  const formatDelta = (val, isPercent = false) => {
    if (val === null || val === undefined) return '<span style="color:#6b7280;">-</span>';
    if (val === 0) return '<span style="color:#6b7280;">0</span>';
    const sign = val > 0 ? '+' : '';
    const color = val > 0 ? '#16a34a' : '#dc2626';
    const suffix = isPercent ? '%' : '';
    return `<span style="color:${color};font-weight:bold;">${sign}${esc(val)}${suffix}</span>`;
  };

  const getCommunityVal = (item, key) => {
    return item.community?.[key] ?? null;
  };

  const metrics = [
    { label: 'Overall Score', val: item => item.score !== null ? `${esc(item.score)}/100` : 'N/A', delta: item => formatDelta(item.deltas?.score) },
    { label: 'Rule Pass Rate', val: item => item.rulePassRate !== null ? `${esc(item.rulePassRate)}%` : 'N/A', delta: item => formatDelta(item.deltas?.rulePassRate, true) },
    { label: 'Commits', val: item => item.counts?.commits !== undefined && item.counts?.commits !== null ? esc(item.counts.commits) : '-', delta: item => formatDelta(item.deltas?.counts?.commits) },
    { label: 'Pull Requests', val: item => item.counts?.pulls !== undefined && item.counts?.pulls !== null ? esc(item.counts.pulls) : '-', delta: item => formatDelta(item.deltas?.counts?.pulls) },
    { label: 'Issues', val: item => item.counts?.issues !== undefined && item.counts?.issues !== null ? esc(item.counts.issues) : '-', delta: item => formatDelta(item.deltas?.counts?.issues) },
    { label: 'Releases', val: item => item.counts?.releases !== undefined && item.counts?.releases !== null ? esc(item.counts.releases) : '-', delta: item => formatDelta(item.deltas?.counts?.releases) },
  ];

  const hasCommunity = ranItems.some(item => item.community && (item.community.stars !== null || item.community.contributors !== null));
  if (hasCommunity) {
    metrics.push(
      { label: 'GitHub Stars', val: item => getCommunityVal(item, 'stars') !== null ? esc(getCommunityVal(item, 'stars')) : '-', delta: item => formatDelta(item.deltas?.community?.stars) },
      { label: 'GitHub Forks', val: item => getCommunityVal(item, 'forks') !== null ? esc(getCommunityVal(item, 'forks')) : '-', delta: item => formatDelta(item.deltas?.community?.forks) },
      { label: 'Contributors', val: item => getCommunityVal(item, 'contributors') !== null ? esc(getCommunityVal(item, 'contributors')) : '-', delta: item => formatDelta(item.deltas?.community?.contributors) }
    );
  }

  const thHtml = ranItems.map(item => `<th>${esc(item.id)}${item.isCurrent ? ' <span style="font-size:10px;color:#2563eb;">(Current)</span>' : ''}</th>`).join('');

  const trsHtml = metrics.map(m => {
    const valsHtml = ranItems.map(item => `<td>${m.val(item)}</td>`).join('');
    return `
      <tr>
        <td style="font-weight:600;text-align:left;">${esc(m.label)}</td>
        ${valsHtml}
        <td style="background-color:#f9fafb;">${m.delta(currentItem)}</td>
      </tr>
    `;
  }).join('');

  return `
    <h2 style="margin:18px 0 8px;">Cross-Phase Progress Comparison</h2>
    <div class="card" style="padding:0;overflow:hidden;border:1px solid #e5e7eb;">
      <table class="comp-table">
        <thead>
          <tr>
            <th style="text-align:left;">Metric</th>
            ${thHtml}
            <th style="background-color:#f3f4f6;">Latest Delta</th>
          </tr>
        </thead>
        <tbody>
          ${trsHtml}
        </tbody>
      </table>
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
    .timeline-container{display:flex;flex-direction:row;justify-content:space-between;align-items:flex-start;margin:16px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;overflow-x:auto;gap:16px}
    .timeline-item{position:relative;display:flex;flex-direction:column;align-items:center;flex:1;min-width:140px;text-align:center}
    .timeline-item:not(:last-child)::after{content:\'\';position:absolute;top:20px;left:50%;width:100%;height:3px;background:#e5e7eb;z-index:1}
    .timeline-badge{position:relative;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;z-index:2;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)}
    .timeline-badge.met{background-color:#16a34a}
    .timeline-badge.partially_met{background-color:#d97706}
    .timeline-badge.not_met{background-color:#dc2626}
    .timeline-badge.pending{background-color:#9ca3af;color:#f3f4f6}
    .timeline-badge.current{outline:4px solid #3b82f6;animation:timeline-pulse 2s infinite}
    @keyframes timeline-pulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,0.7)}70%{box-shadow:0 0 0 10px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}
    .timeline-content{margin-top:12px;z-index:2}
    .timeline-title{font-weight:600;font-size:14px;color:#111827}
    .timeline-score{font-size:13px;font-weight:bold;margin-top:4px}
    .timeline-score{color:#374151}
    .timeline-date{font-size:11px;color:#6b7280;margin-top:2px}
    .comp-table{width:100%;border-collapse:collapse;font-size:14px;text-align:center}
    .comp-table th,.comp-table td{padding:10px 12px;border-bottom:1px solid #e5e7eb}
    .comp-table th{background-color:#f9fafb;font-weight:600;color:#374151}
    .comp-table tbody tr:last-child td{border-bottom:none}
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
  ${renderPhaseInfo(payload)}
  ${renderTimeline(payload)}
  ${renderComparison(payload)}

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

export function renderBatchDashboardHtml(payload) {
  const projects = payload.projects || [];
  const generatedAt = payload.generatedAt || new Date().toISOString();

  const totalProjects = projects.length;
  const metCount = projects.filter((p) => p.status === 'met').length;
  const metRate = totalProjects ? Math.round((metCount / totalProjects) * 100) : 0;

  const successCount = projects.filter((p) => p.status !== 'failed').length;
  const successRate = totalProjects ? Math.round((successCount / totalProjects) * 100) : 0;

  const successProjects = projects.filter((p) => p.status !== 'failed');
  const avgScore = successProjects.length
    ? Math.round(successProjects.reduce((sum, p) => sum + (p.score || 0), 0) / successProjects.length)
    : 0;

  const rowsHtml = projects.map((p) => {
    const isFailed = p.status === 'failed';
    const scoreText = isFailed ? 'N/A' : `${p.score}/100`;
    const milestoneInfo = p.phaseId
      ? `Phase: ${p.phaseId}${p.phaseTitle ? ` (${p.phaseTitle})` : ''}`
      : (p.milestoneText || '(no milestone specified)');

    let statusLabel = p.status.toUpperCase();
    if (p.status === 'partially_met') statusLabel = 'PARTIALLY MET';

    const htmlLink = p.htmlReportPath
      ? `<a href="${esc(p.htmlReportPath)}" class="report-link html-link">HTML</a>`
      : '<span class="report-link disabled">HTML</span>';
    const mdLink = p.reportPath
      ? `<a href="${esc(p.reportPath)}" class="report-link md-link">MD</a>`
      : '<span class="report-link disabled">MD</span>';

    const errDetail = p.error
      ? `<div class="error-detail">${esc(p.error)}</div>`
      : '';

    return `
      <tr class="project-row" data-repo="${esc(p.repo)}" data-status="${esc(p.status)}">
        <td style="font-weight: 600; color: #f8fafc;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg style="width:16px;height:16px;fill:currentColor;opacity:.6;" viewBox="0 0 16 16">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            ${esc(p.repo)}
          </div>
        </td>
        <td>
          <div style="font-size: 13px; opacity: .85;">${esc(milestoneInfo)}</div>
        </td>
        <td>
          <span class="badge badge-${esc(p.status)}">${esc(statusLabel)}</span>
        </td>
        <td>
          <span style="font-family: monospace; font-weight: bold; color: ${isFailed ? '#94a3b8' : (p.score >= 70 ? '#4ade80' : (p.score >= 40 ? '#fbbf24' : '#f87171'))}">
            ${esc(scoreText)}
          </span>
          ${errDetail}
        </td>
        <td style="font-size: 12px; opacity: .7;">
          ${esc(p.generatedAt ? p.generatedAt.slice(0, 16).replace('T', ' ') : '-')}
        </td>
        <td>
          <div style="display: flex; gap: 8px;">
            ${htmlLink}
            ${mdLink}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GCC Projects Verification Aggregation Dashboard</title>
  <style>
    body {
      background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0f172a 100%);
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      margin: 0;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 40px;
      text-align: center;
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 32px;
      background: linear-gradient(to right, #818cf8, #c084fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      opacity: .6;
      font-size: 14px;
      margin: 0;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }
    .kpi-card {
      background: rgba(30, 41, 59, 0.4);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      transition: transform 0.2s;
    }
    .kpi-card:hover {
      transform: translateY(-2px);
      border-color: rgba(129, 140, 248, 0.3);
    }
    .kpi-val {
      font-size: 36px;
      font-weight: 800;
      margin: 8px 0 4px;
      background: linear-gradient(to right, #f8fafc, #cbd5e1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .kpi-lbl {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: .5;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 24px;
      align-items: center;
    }
    .search-input {
      flex: 1;
      min-width: 260px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px 14px;
      color: #f8fafc;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-input:focus {
      border-color: #818cf8;
    }
    .filter-select {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px 14px;
      color: #f8fafc;
      font-size: 14px;
      outline: none;
      cursor: pointer;
    }
    .filter-select:focus {
      border-color: #818cf8;
    }
    .table-container {
      background: rgba(30, 41, 59, 0.4);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th, td {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: .5;
      font-weight: 700;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .badge-met {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .badge-partially_met {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .badge-not_met {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .badge-failed {
      background: rgba(100, 116, 139, 0.15);
      color: #94a3b8;
      border: 1px solid rgba(100, 116, 139, 0.3);
    }
    .error-detail {
      font-size: 11px;
      color: #f87171;
      margin-top: 4px;
      max-width: 250px;
      word-break: break-all;
      opacity: .9;
    }
    .report-link {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }
    .html-link {
      background: rgba(129, 140, 248, 0.15);
      color: #818cf8;
      border: 1px solid rgba(129, 140, 248, 0.3);
    }
    .html-link:hover {
      background: #818cf8;
      color: #0f172a;
    }
    .md-link {
      background: rgba(192, 132, 252, 0.15);
      color: #c084fc;
      border: 1px solid rgba(192, 132, 252, 0.3);
    }
    .md-link:hover {
      background: #c084fc;
      color: #0f172a;
    }
    .report-link.disabled {
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.04);
      cursor: not-allowed;
    }
    .no-results {
      padding: 40px;
      text-align: center;
      opacity: .5;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>GCC Milestone Verification Dashboard</h1>
      <p class="subtitle">Aggregation report compiled at ${esc(generatedAt)}</p>
    </header>

    <div class="kpis">
      <div class="kpi-card">
        <div class="kpi-lbl">Total Projects</div>
        <div class="kpi-val">${esc(totalProjects)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Met Rate</div>
        <div class="kpi-val">${esc(metRate)}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Average Score</div>
        <div class="kpi-val">${esc(avgScore)}/100</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Run Success Rate</div>
        <div class="kpi-val">${esc(successRate)}%</div>
      </div>
    </div>

    <div class="controls">
      <input type="text" id="searchRepo" class="search-input" placeholder="Search by repository name...">
      <select id="statusFilter" class="filter-select">
        <option value="all">All Statuses</option>
        <option value="met">Met</option>
        <option value="partially_met">Partially Met</option>
        <option value="not_met">Not Met</option>
        <option value="failed">Failed</option>
      </select>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Repository</th>
            <th>Phase / Milestone</th>
            <th>Status</th>
            <th>Score</th>
            <th>Evaluation Time</th>
            <th>Reports</th>
          </tr>
        </thead>
        <tbody id="projectsBody">
          ${rowsHtml || `<tr><td colspan="6" class="no-results">No projects analyzed.</td></tr>`}
        </tbody>
      </table>
      <div id="noResultsMsg" class="no-results" style="display: none;">No matching projects found.</div>
    </div>
  </div>

  <script>
    const searchInput = document.getElementById('searchRepo');
    const statusFilter = document.getElementById('statusFilter');
    const projectsBody = document.getElementById('projectsBody');
    const noResultsMsg = document.getElementById('noResultsMsg');
    const rows = document.querySelectorAll('.project-row');

    function filterProjects() {
      const query = searchInput.value.toLowerCase().trim();
      const status = statusFilter.value;
      let visibleCount = 0;

      rows.forEach(row => {
        const repo = row.getAttribute('data-repo').toLowerCase();
        const rowStatus = row.getAttribute('data-status');

        const matchesSearch = repo.includes(query);
        const matchesStatus = status === 'all' || rowStatus === status;

        if (matchesSearch && matchesStatus) {
          row.style.display = '';
          visibleCount++;
        } else {
          row.style.display = 'none';
        }
      });

      if (rows.length > 0 && visibleCount === 0) {
        noResultsMsg.style.display = 'block';
      } else {
        noResultsMsg.style.display = 'none';
      }
    }

    searchInput.addEventListener('input', filterProjects);
    statusFilter.addEventListener('change', filterProjects);
  </script>
</body>
</html>`;
}

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 所有用戶輸入均透過 esc() 函數轉義，防止 XSS
 *    - 分數顏色閾值需與 milestone-check.js 的評分閾值語義一致
 *    - payload 結構與 buildJsonReport() 的輸出一致，且可能包含 timeline 數組以渲染進度時間軸。
 *    - renderBatchDashboardHtml 支持批量校验输出仪表板，包含过滤和搜索功能。
 * 2. 潛在邊界情況：
 *    - payload.rules 可能為 undefined（已加 || [] 防護）
 *    - evidenceCounts 可能為 undefined（已用 ?. 防護）
 *    - esc() 對 null/undefined 輸入返回空字串
 *    - timeline 數組如果為空，則不會渲染任何時間轴 HTML
 * 3. 模組依賴：
 *    - 無外部依賴，被 milestone-check.js / cli.js 調用
 */
