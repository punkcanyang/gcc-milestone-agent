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
