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
