/**
 * __ai_context__
 * 模組角色：設定檔載入模組
 * 系統位置：CLI 入口(cli.js) → [本模組] → phase-config.js / milestone-check.js
 * 核心職責：
 *   1. 載入並解析 YAML 格式的本機設定檔（預設為 `.gcc-milestone.yaml`）
 *   2. 提供 CLI 參數與設定檔參數的合併解析邏輯 (CLI 優先於設定檔)
 *   3. 處理單期執行模式 (`--phase`) 的期號選項解析
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { mergePhaseOptions, selectPhase, validateMilestones } from './phase-config.js';

const CONFIG_FILE = '.gcc-milestone.yaml';

export function loadConfig(cwd = process.cwd(), configPath = CONFIG_FILE) {
  const filePath = path.isAbsolute(configPath)
    ? configPath
    : path.join(cwd, configPath);
  if (!fs.existsSync(filePath)) return {};

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== 'object') return {};

  return parsed;
}

export function mergeOptions(cliOptions, config) {
  const merged = { ...config };
  for (const [key, value] of Object.entries(cliOptions)) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }
  return merged;
}

export function resolveOptions(cliOptions, config) {
  if (!cliOptions?.phase) {
    return mergeOptions(cliOptions, config);
  }

  if (!Array.isArray(config?.milestones)) {
    throw new Error('--phase requires milestones in .gcc-milestone.yaml');
  }

  const phases = validateMilestones(config.milestones);
  const selected = selectPhase(phases, cliOptions.phase);
  return mergePhaseOptions({
    topLevel: config,
    phase: selected,
    cli: cliOptions
  });
}

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 載入設定檔預設使用 CWD + `.gcc-milestone.yaml`。若指定了 `--config`，則使用指定路徑。
 *    - CLI 參數具有最高優先權，未指定或為空時才回退到設定檔預設值。
 * 2. 潛在邊界情況：
 *    - 若設定檔不存在，回傳空物件 `{}` 而不報錯。
 *    - 當指定 `--phase` 時，設定檔中必須存在合法的 `milestones` 陣列，否則拋出 Error。
 * 3. 模組依賴：
 *    - js-yaml (用於載入和解析 YAML)
 *    - phase-config.js (用於校驗和解析分期設定)
 */

