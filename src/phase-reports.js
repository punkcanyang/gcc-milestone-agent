/**
 * __ai_context__
 * 模組角色：Milestone phase 報表路徑與歷史 dependency lookup 工具
 * 系統位置：cli/config-loader → [本模組] → milestone-check
 * 核心職責：
 *   1. 解析 phase mode 的預設輸出路徑
 *   2. 掃描 reportsDir 裡的 phase-aware JSON report
 *   3. 對 dependsOn 產生 non-blocking dependency warnings
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const ACCEPTABLE_DEPENDENCY_STATUSES = new Set(['met', 'partially_met']);

function safeReportSlug(value) {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function parseGeneratedAt(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function compareCandidates(a, b) {
  if (a.time !== b.time) return b.time - a.time;
  return a.file.localeCompare(b.file);
}

export function formatPhaseTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

export function resolvePhaseOutputPaths({
  cwd = process.cwd(),
  reportsDir = 'reports',
  repo,
  phaseId,
  timestamp = formatPhaseTimestamp(),
  out,
  jsonOut,
  htmlOut
}) {
  const resolvedReportsDir = path.resolve(cwd, reportsDir || 'reports');
  const base = `${safeReportSlug(repo)}-${safeReportSlug(phaseId)}-${timestamp}`;
  const defaultOut = path.join(resolvedReportsDir, `${base}.md`);
  const defaultJsonOut = path.join(resolvedReportsDir, `${base}.json`);
  const defaultHtmlOut = path.join(resolvedReportsDir, `${base}.html`);

  return {
    reportsDir: resolvedReportsDir,
    out: out ? path.resolve(cwd, out) : defaultOut,
    jsonOut: jsonOut ? path.resolve(cwd, jsonOut) : defaultJsonOut,
    htmlOut: htmlOut ? path.resolve(cwd, htmlOut) : defaultHtmlOut,
    phaseJsonOut: defaultJsonOut
  };
}

async function readReportCandidate(file) {
  const stat = await fs.stat(file);
  const raw = await fs.readFile(file, 'utf8');
  return {
    file,
    mtimeMs: stat.mtimeMs,
    payload: JSON.parse(raw)
  };
}

function candidateWithTime(candidate, warnings) {
  const generatedAtTime = parseGeneratedAt(candidate.payload?.generatedAt);
  if (generatedAtTime !== null) {
    return { ...candidate, time: generatedAtTime };
  }

  warnings.push(`Report ${candidate.file} has missing or invalid generatedAt; using file mtime.`);
  return { ...candidate, time: candidate.mtimeMs };
}

export async function detectDependencyWarnings({ reportsDir = 'reports', repo, phase }) {
  const warnings = [];
  const dependencies = phase?.dependsOn || [];

  let entries;
  try {
    entries = await fs.readdir(reportsDir, { withFileTypes: true });
  } catch {
    if (!dependencies.length) return [];
    return dependencies.map((dependencyId) => (
      `Phase ${phase.id} depends on ${dependencyId}, but reportsDir does not exist or cannot be read: ${reportsDir}`
    ));
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== '.json') continue;

    const file = path.join(reportsDir, entry.name);
    try {
      candidates.push(await readReportCandidate(file));
    } catch {
      warnings.push(`Skipping invalid JSON report: ${file}`);
    }
  }

  for (const dependencyId of dependencies) {
    const matches = candidates
      .filter((candidate) => (
        candidate.payload?.repo === repo &&
        candidate.payload?.phase?.id === dependencyId
      ))
      .map((candidate) => candidateWithTime(candidate, warnings))
      .sort(compareCandidates);

    const latest = matches[0];
    if (!latest) {
      warnings.push(`Phase ${phase.id} depends on ${dependencyId}, but no prior result was found in reportsDir.`);
      continue;
    }

    if (!ACCEPTABLE_DEPENDENCY_STATUSES.has(latest.payload?.status)) {
      warnings.push(`Phase ${phase.id} depends on ${dependencyId}, but latest result is not met: ${latest.payload?.status || 'unknown'}.`);
    }
  }

  return warnings;
}

export async function loadPhaseTimelineData({
  reportsDir = 'reports',
  repo,
  currentPhasePayload = null,
  milestonesConfig = null
}) {
  const warnings = [];
  const timelineMap = new Map();

  let entries;
  try {
    entries = await fs.readdir(reportsDir, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== '.json') continue;

    const file = path.join(reportsDir, entry.name);
    try {
      candidates.push(await readReportCandidate(file));
    } catch {
      // Ignore invalid JSON reports
    }
  }

  const phaseLatestReport = new Map();
  for (const candidate of candidates) {
    const payload = candidate.payload;
    if (payload?.repo !== repo || !payload?.phase?.id) continue;

    const phaseId = payload.phase.id;
    const itemWithTime = candidateWithTime(candidate, warnings);

    const existing = phaseLatestReport.get(phaseId);
    if (!existing || compareCandidates(itemWithTime, existing) < 0) {
      phaseLatestReport.set(phaseId, itemWithTime);
    }
  }

  for (const [phaseId, latest] of phaseLatestReport.entries()) {
    const p = latest.payload;
    timelineMap.set(phaseId, {
      id: phaseId,
      title: p.phase.title || null,
      score: p.score ?? null,
      status: p.status || 'not_met',
      generatedAt: p.generatedAt || null,
      isCurrent: false,
      rulePassRate: p.rulePassRate ?? null,
      counts: p.evidenceCounts || null,
      community: p.communityHealth ? {
        stars: p.communityHealth.github?.stars ?? p.communityHealth.stars ?? null,
        forks: p.communityHealth.github?.forks ?? p.communityHealth.forks ?? null,
        contributors: p.communityHealth.github?.contributors ?? p.communityHealth.contributorCount ?? null
      } : null
    });
  }

  if (currentPhasePayload && currentPhasePayload.phase) {
    const curPhaseId = typeof currentPhasePayload.phase === 'string'
      ? currentPhasePayload.phase
      : currentPhasePayload.phase.id;
    if (curPhaseId) {
      const curPhaseTitle = typeof currentPhasePayload.phase === 'object'
        ? currentPhasePayload.phase.title
        : null;
      timelineMap.set(curPhaseId, {
        id: curPhaseId,
        title: curPhaseTitle || null,
        score: currentPhasePayload.score ?? null,
        status: currentPhasePayload.status || 'not_met',
        generatedAt: currentPhasePayload.generatedAt || new Date().toISOString(),
        isCurrent: true,
        rulePassRate: currentPhasePayload.rulePassRate ?? null,
        counts: currentPhasePayload.evidenceCounts || null,
        community: currentPhasePayload.communityHealth ? {
          stars: currentPhasePayload.communityHealth.github?.stars ?? currentPhasePayload.communityHealth.stars ?? null,
          forks: currentPhasePayload.communityHealth.github?.forks ?? currentPhasePayload.communityHealth.forks ?? null,
          contributors: currentPhasePayload.communityHealth.github?.contributors ?? currentPhasePayload.communityHealth.contributorCount ?? null
        } : null
      });
    }
  }

  const result = [];
  if (Array.isArray(milestonesConfig) && milestonesConfig.length) {
    for (const config of milestonesConfig) {
      if (!config || !config.id) continue;
      const phaseId = config.id;
      const existing = timelineMap.get(phaseId);
      if (existing) {
        if (config.title) {
          existing.title = config.title;
        }
        result.push(existing);
      } else {
        result.push({
          id: phaseId,
          title: config.title || null,
          score: null,
          status: 'pending',
          generatedAt: null,
          isCurrent: false,
          rulePassRate: null,
          counts: null,
          community: null
        });
      }
    }
  } else {
    const sorted = [...timelineMap.values()].sort((a, b) => {
      const timeA = a.generatedAt ? Date.parse(a.generatedAt) : 0;
      const timeB = b.generatedAt ? Date.parse(b.generatedAt) : 0;
      return timeA - timeB;
    });
    result.push(...sorted);
  }

  // 计算每个已运行阶段相对于“前一个已运行阶段”的增量
  let lastRanItem = null;
  for (const item of result) {
    if (item.status === 'pending') {
      item.deltas = null;
      continue;
    }
    if (!lastRanItem) {
      item.deltas = null;
      lastRanItem = item;
      continue;
    }

    const deltas = {};

    // 1. 得分差
    if (item.score !== null && lastRanItem.score !== null) {
      deltas.score = item.score - lastRanItem.score;
    } else {
      deltas.score = null;
    }

    // 2. 规则通过率差
    if (item.rulePassRate !== null && lastRanItem.rulePassRate !== null) {
      deltas.rulePassRate = item.rulePassRate - lastRanItem.rulePassRate;
    } else {
      deltas.rulePassRate = null;
    }

    // 3. 证据统计差 (commits, pulls, issues, releases)
    const counts = {};
    let hasCountsDelta = false;
    const curCounts = item.counts || {};
    const prevCounts = lastRanItem.counts || {};
    for (const key of ['commits', 'pulls', 'issues', 'releases']) {
      const curVal = curCounts[key];
      const prevVal = prevCounts[key];
      if (curVal !== undefined && prevVal !== undefined && curVal !== null && prevVal !== null) {
        counts[key] = curVal - prevVal;
        hasCountsDelta = true;
      } else {
        counts[key] = null;
      }
    }
    deltas.counts = hasCountsDelta ? counts : null;

    // 4. 社群健康差 (stars, forks, contributors)
    const community = {};
    let hasCommunityDelta = false;
    const curComm = item.community || {};
    const prevComm = lastRanItem.community || {};
    for (const key of ['stars', 'forks', 'contributors']) {
      const curVal = curComm[key];
      const prevVal = prevComm[key];
      if (curVal !== undefined && prevVal !== undefined && curVal !== null && prevVal !== null) {
        community[key] = curVal - prevVal;
        hasCommunityDelta = true;
      } else {
        community[key] = null;
      }
    }
    deltas.community = hasCommunityDelta ? community : null;

    item.deltas = deltas;
    lastRanItem = item;
  }

  return result;
}

export const _internal = {
  ACCEPTABLE_DEPENDENCY_STATUSES,
  safeReportSlug,
  parseGeneratedAt,
  compareCandidates,
  loadPhaseTimelineData
};

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 舊 JSON report 沒有 phase.id，不算 dependency result。
 *    - dependency warning 只提醒，不阻擋目前 phase 執行。
 *    - timeline 數據的順序如果提供了配置，則嚴格按照 config.milestones 順序輸出。
 * 2. 潛在邊界情況：
 *    - matching report 缺少 generatedAt 時用檔案 mtime 排序，並保留 warning。
 *    - 多個 report timestamp 相同時用 lexical file path 確保結果穩定。
 *    - 對未執行的配置 Phase 會填充 'pending' 狀態與 null 分數。
 * 3. 模組依賴：
 *    - 只讀 filesystem；目錄建立與輸出寫入會在後續 task 處理。
 */
