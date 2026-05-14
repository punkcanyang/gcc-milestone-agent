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

export const _internal = {
  ACCEPTABLE_DEPENDENCY_STATUSES,
  safeReportSlug,
  parseGeneratedAt,
  compareCandidates
};

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 舊 JSON report 沒有 phase.id，不算 dependency result。
 *    - dependency warning 只提醒，不阻擋目前 phase 執行。
 * 2. 潛在邊界情況：
 *    - matching report 缺少 generatedAt 時用檔案 mtime 排序，並保留 warning。
 *    - 多個 report timestamp 相同時用 lexical file path 確保結果穩定。
 * 3. 模組依賴：
 *    - 只讀 filesystem；目錄建立與輸出寫入會在後續 task 處理。
 */
