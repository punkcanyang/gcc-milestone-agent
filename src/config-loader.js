import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const CONFIG_FILE = '.gcc-milestone.yaml';

export function loadConfig(cwd = process.cwd()) {
  const filePath = path.join(cwd, CONFIG_FILE);
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
