/**
 * __ai_context__
 * 模組角色：Milestone phase 設定解析與驗證工具
 * 系統位置：cli/config-loader → [本模組] → milestone-check
 * 核心職責：
 *   1. 驗證 .gcc-milestone.yaml 的 milestones schema
 *   2. 選取 --phase 指定的單一期別
 *   3. 合併 top-level、phase、CLI options
 */

const PHASE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const PHASE_OVERRIDABLE_KEYS = [
  'milestone',
  'profile',
  'providers',
  'since',
  'rulesFile',
  'twitterHandle',
  'contractAddress',
  'etherscanUrl',
  'articleUrls',
  'discordInvite',
  'telegramGroup',
  'semanticMode',
  'llmModel'
];

function mergeNonEmpty(target, source, allowedKeys = null) {
  const allowed = allowedKeys ? new Set(allowedKeys) : null;
  for (const [key, value] of Object.entries(source || {})) {
    if (allowed && !allowed.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    target[key] = value;
  }
  return target;
}

function assertNoCycles(phases) {
  const byId = new Map(phases.map((phase) => [phase.id, phase]));
  const visiting = new Set();
  const visited = new Set();

  function visit(phase) {
    if (visited.has(phase.id)) return;
    if (visiting.has(phase.id)) {
      throw new Error(`Milestone dependency cycle detected at phase: ${phase.id}`);
    }

    visiting.add(phase.id);
    for (const dependencyId of phase.dependsOn) {
      visit(byId.get(dependencyId));
    }
    visiting.delete(phase.id);
    visited.add(phase.id);
  }

  for (const phase of phases) {
    visit(phase);
  }
}

export function validatePhaseId(id) {
  const value = String(id || '').trim();
  if (!value || !PHASE_ID_PATTERN.test(value)) {
    throw new Error(`Invalid phase id: ${id}. Use letters, numbers, underscores, and hyphens only.`);
  }
  return value;
}

export function normalizeDependsOn(dependsOn) {
  if (dependsOn === undefined || dependsOn === null || dependsOn === '') return [];
  const values = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
  return values.map(validatePhaseId);
}

export function normalizeMilestones(milestones) {
  if (!Array.isArray(milestones)) {
    throw new Error('Invalid milestones config: expected an array.');
  }

  return milestones.map((phase) => {
    if (!phase || typeof phase !== 'object') {
      throw new Error('Invalid milestone phase: expected an object.');
    }
    return {
      ...phase,
      id: validatePhaseId(phase.id),
      dependsOn: normalizeDependsOn(phase.dependsOn)
    };
  });
}

export function validateMilestones(milestones) {
  const phases = normalizeMilestones(milestones);
  const ids = new Set();

  for (const phase of phases) {
    if (ids.has(phase.id)) {
      throw new Error(`Duplicate phase id: ${phase.id}`);
    }
    ids.add(phase.id);
  }

  for (const phase of phases) {
    for (const dependencyId of phase.dependsOn) {
      if (dependencyId === phase.id) {
        throw new Error(`Phase ${phase.id} depends on itself.`);
      }
      if (!ids.has(dependencyId)) {
        throw new Error(`Phase ${phase.id} depends on unknown phase: ${dependencyId}`);
      }
    }
  }

  assertNoCycles(phases);
  return phases;
}

export function selectPhase(phases, phaseId) {
  const id = validatePhaseId(phaseId);
  const selected = phases.find((phase) => phase.id === id);
  if (!selected) {
    const available = phases.map((phase) => phase.id).join(', ');
    throw new Error(`Unknown phase id: ${id}. Available phases: ${available}`);
  }
  return selected;
}

export function mergePhaseOptions({ topLevel, phase, cli }) {
  const merged = {};
  mergeNonEmpty(merged, topLevel);
  mergeNonEmpty(merged, phase, PHASE_OVERRIDABLE_KEYS);
  mergeNonEmpty(merged, cli);

  merged.phase = {
    id: phase.id,
    title: phase.title || null,
    dependsOn: phase.dependsOn || []
  };

  if (!merged.repo) {
    throw new Error('repo is required.');
  }
  if (!merged.milestone) {
    throw new Error('milestone is required.');
  }

  return merged;
}

export const _internal = {
  PHASE_ID_PATTERN
};

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - phase id 會進 CLI、JSON 與檔名，因此只允許安全 slug 字元。
 *    - dependsOn 在內部永遠是 array。
 * 2. 潛在邊界情況：
 *    - phase id 大小寫視為不同 id。
 * 3. 模組依賴：
 *    - 無 filesystem 依賴，方便單元測試。
 */
