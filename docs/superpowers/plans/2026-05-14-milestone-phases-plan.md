# Milestone Phases Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in `--phase <id>` support backed by `.gcc-milestone.yaml` milestone phase definitions.

**Architecture:** Keep phase validation and config selection out of the rule engine. Add focused phase helpers for pure config validation and report-history lookup, then pass already-resolved phase metadata and dependency warnings into `runMilestoneCheck`. Preserve old single-milestone behavior when `--phase` is absent.

**Tech Stack:** Node >=18 ESM, Commander, js-yaml, built-in `node:test`, existing Markdown/JSON/HTML report writers.

---

## File Structure

- Create `src/phase-config.js`
  - Pure phase schema helpers: phase id validation, `dependsOn` normalization, duplicate/missing/self/cycle validation, phase selection, and effective option merge.
  - No filesystem access.

- Create `src/phase-reports.js`
  - Filesystem-aware helpers: dependency result lookup, reportsDir output path resolution, JSON report sorting by `generatedAt` with file mtime fallback.

- Modify `src/config-loader.js`
  - Keep `loadConfig()` and `mergeOptions()` behavior available.
  - Add phase-aware resolution that delegates to `phase-config.js`.

- Modify `src/cli.js`
  - Add `--phase` and `--reports-dir`.
  - Stop relying on Commander default `--out` as a signal of user intent.
  - Resolve phase mode before validating required `repo`/`milestone`.

- Modify `src/milestone-check.js`
  - Accept `phase`, `dependencyWarnings`, and `phaseJsonOut`.
  - Include phase metadata/warnings in Markdown and JSON.
  - Always write `phaseJsonOut` when provided.

- Modify `src/html-report.js`
  - Render phase metadata and dependency warnings when present.

- Add tests:
  - `test/phase-config.test.js`
  - `test/phase-reports.test.js`
  - Extend `test/config-loader.test.js`
  - Extend `test/milestone-check.test.js`
  - Extend `test/html-report.test.js`

- Update docs:
  - `README.md`
  - `AGENTS.md`
  - `TODO.md`
  - `WORKLOG.md`

## Chunk 1: Phase Config Model

### Task 1: Add Pure Phase Config Validation

**Files:**
- Create: `src/phase-config.js`
- Create: `test/phase-config.test.js`

- [ ] **Step 1: Write failing tests for phase ids and dependsOn normalization**

Add `test/phase-config.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePhaseId,
  normalizeDependsOn,
  normalizeMilestones
} from '../src/phase-config.js';

test('validatePhaseId accepts slug-like ids', () => {
  assert.equal(validatePhaseId('M1'), 'M1');
  assert.equal(validatePhaseId('phase-1'), 'phase-1');
  assert.equal(validatePhaseId('delivery_alpha'), 'delivery_alpha');
});

test('validatePhaseId rejects empty or unsafe ids', () => {
  assert.throws(() => validatePhaseId(''), /Invalid phase id/);
  assert.throws(() => validatePhaseId('M 1'), /Invalid phase id/);
  assert.throws(() => validatePhaseId('../M1'), /Invalid phase id/);
});

test('normalizeDependsOn accepts string, array, and empty values', () => {
  assert.deepEqual(normalizeDependsOn('M1'), ['M1']);
  assert.deepEqual(normalizeDependsOn(['M1', 'M2']), ['M1', 'M2']);
  assert.deepEqual(normalizeDependsOn(undefined), []);
});

test('normalizeMilestones normalizes dependsOn to arrays', () => {
  const phases = normalizeMilestones([
    { id: 'M1', milestone: 'one' },
    { id: 'M2', milestone: 'two', dependsOn: 'M1' }
  ]);
  assert.deepEqual(phases[1].dependsOn, ['M1']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/phase-config.test.js`

Expected: FAIL with module not found for `../src/phase-config.js`.

- [ ] **Step 3: Implement minimal phase id and dependsOn helpers**

Create `src/phase-config.js` with the repo's Chinese context block and focused helpers:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/phase-config.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/phase-config.js test/phase-config.test.js
git commit -m "feat: add milestone phase config helpers"
```

### Task 2: Validate Phase Graph and Select Phase

**Files:**
- Modify: `src/phase-config.js`
- Modify: `test/phase-config.test.js`

- [ ] **Step 1: Write failing tests for duplicates, missing dependencies, self-dependencies, cycles, and selection**

Append to `test/phase-config.test.js`:

```js
import {
  selectPhase,
  validateMilestones,
  mergePhaseOptions
} from '../src/phase-config.js';

test('validateMilestones rejects duplicate phase ids', () => {
  assert.throws(
    () => validateMilestones([
      { id: 'M1', milestone: 'one' },
      { id: 'M1', milestone: 'duplicate' }
    ]),
    /Duplicate phase id: M1/
  );
});

test('validateMilestones rejects missing dependencies', () => {
  assert.throws(
    () => validateMilestones([{ id: 'M2', milestone: 'two', dependsOn: 'M1' }]),
    /depends on unknown phase: M1/
  );
});

test('validateMilestones rejects self-dependency', () => {
  assert.throws(
    () => validateMilestones([{ id: 'M1', milestone: 'one', dependsOn: 'M1' }]),
    /depends on itself/
  );
});

test('validateMilestones rejects dependency cycles', () => {
  assert.throws(
    () => validateMilestones([
      { id: 'M1', milestone: 'one', dependsOn: 'M2' },
      { id: 'M2', milestone: 'two', dependsOn: 'M1' }
    ]),
    /cycle/i
  );
});

test('selectPhase returns the requested phase and lists available ids on miss', () => {
  const phases = validateMilestones([{ id: 'M1', milestone: 'one' }]);
  assert.equal(selectPhase(phases, 'M1').id, 'M1');
  assert.throws(() => selectPhase(phases, 'M2'), /Available phases: M1/);
});

test('mergePhaseOptions applies CLI > phase > top-level for execution keys', () => {
  const topLevel = {
    repo: 'owner/name',
    profile: 'gcc-allocation',
    providers: 'github-api',
    reportsDir: 'reports',
    out: 'top.md',
    jsonOut: 'top.json',
    htmlOut: 'top.html',
    milestones: [{ id: 'Top', milestone: 'top' }]
  };
  const phase = {
    id: 'M2',
    milestone: 'phase milestone',
    profile: 'phase-profile',
    repo: 'ignored/repo',
    reportsDir: 'ignored-reports',
    out: 'ignored.md',
    jsonOut: 'ignored.json',
    htmlOut: 'ignored.html',
    milestones: [{ id: 'Ignored', milestone: 'ignored' }]
  };
  const cli = {
    phase: 'M2',
    profile: 'cli-profile',
    milestone: 'cli milestone'
  };
  const merged = mergePhaseOptions({ topLevel, phase, cli });
  assert.equal(merged.repo, 'owner/name');
  assert.equal(merged.reportsDir, 'reports');
  assert.equal(merged.out, 'top.md');
  assert.equal(merged.jsonOut, 'top.json');
  assert.equal(merged.htmlOut, 'top.html');
  assert.deepEqual(merged.milestones, [{ id: 'Top', milestone: 'top' }]);
  assert.equal(merged.profile, 'cli-profile');
  assert.equal(merged.milestone, 'cli milestone');
  assert.deepEqual(merged.phase, { id: 'M2', title: null, dependsOn: [] });
});

test('mergePhaseOptions requires effective repo and milestone', () => {
  assert.throws(
    () => mergePhaseOptions({ topLevel: { repo: 'owner/name' }, phase: { id: 'M1' }, cli: {} }),
    /milestone is required/
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/phase-config.test.js`

Expected: FAIL because `selectPhase`, `validateMilestones`, and `mergePhaseOptions` are missing.

- [ ] **Step 3: Implement validation and merge helpers**

Add to `src/phase-config.js`:

```js
const PHASE_OVERRIDABLE_KEYS = new Set([
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
]);

function mergeNonEmpty(target, source, allowedKeys = null) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (allowedKeys && !allowedKeys.has(key)) continue;
    target[key] = value;
  }
  return target;
}

function assertNoCycles(phases) {
  const byId = new Map(phases.map((phase) => [phase.id, phase]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id, stack = []) {
    if (visiting.has(id)) {
      throw new Error(`Milestone phase dependency cycle detected: ${[...stack, id].join(' -> ')}`);
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const phase = byId.get(id);
    for (const depId of phase.dependsOn) {
      visit(depId, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const phase of phases) visit(phase.id);
}

export function validateMilestones(milestones) {
  const phases = normalizeMilestones(milestones);
  const seen = new Set();
  for (const phase of phases) {
    if (seen.has(phase.id)) {
      throw new Error(`Duplicate phase id: ${phase.id}`);
    }
    seen.add(phase.id);
  }

  for (const phase of phases) {
    for (const depId of phase.dependsOn) {
      if (depId === phase.id) {
        throw new Error(`Milestone phase ${phase.id} depends on itself.`);
      }
      if (!seen.has(depId)) {
        throw new Error(`Milestone phase ${phase.id} depends on unknown phase: ${depId}`);
      }
    }
  }

  assertNoCycles(phases);
  return phases;
}

export function selectPhase(phases, phaseId) {
  const id = validatePhaseId(phaseId);
  const found = phases.find((phase) => phase.id === id);
  if (!found) {
    throw new Error(`Unknown phase: ${id}. Available phases: ${phases.map((phase) => phase.id).join(', ') || '(none)'}`);
  }
  return found;
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
    throw new Error('--repo is required (via CLI or .gcc-milestone.yaml)');
  }
  if (!merged.milestone) {
    throw new Error('--milestone is required for selected phase');
  }

  return merged;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/phase-config.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/phase-config.js test/phase-config.test.js
git commit -m "feat: validate and select milestone phases"
```

### Task 3: Add Phase-Aware Config Resolution

**Files:**
- Modify: `src/config-loader.js`
- Modify: `test/config-loader.test.js`

- [ ] **Step 1: Write failing config-loader tests**

Append to `test/config-loader.test.js`:

```js
import { resolveOptions } from '../src/config-loader.js';

test('resolveOptions preserves old single milestone behavior without phase', () => {
  const config = {
    repo: 'config/repo',
    milestone: 'config milestone',
    milestones: [
      { id: 'M1', milestone: 'phase milestone' },
      { id: 'M1', milestone: 'duplicate phase should not be validated without --phase' }
    ]
  };
  const cli = { repo: 'cli/repo' };
  const resolved = resolveOptions(cli, config);
  assert.equal(resolved.repo, 'cli/repo');
  assert.equal(resolved.milestone, 'config milestone');
  assert.equal(resolved.phase, undefined);
});

test('resolveOptions selects phase when --phase is provided', () => {
  const config = {
    repo: 'owner/name',
    profile: 'gcc-allocation',
    milestones: [
      { id: 'M1', milestone: 'one' },
      { id: 'M2', milestone: 'two', profile: 'phase-profile', dependsOn: 'M1' }
    ]
  };
  const resolved = resolveOptions({ phase: 'M2' }, config);
  assert.equal(resolved.repo, 'owner/name');
  assert.equal(resolved.milestone, 'two');
  assert.equal(resolved.profile, 'phase-profile');
  assert.deepEqual(resolved.phase, { id: 'M2', title: null, dependsOn: ['M1'] });
});

test('resolveOptions requires milestones when --phase is provided', () => {
  assert.throws(
    () => resolveOptions({ phase: 'M1' }, { repo: 'owner/name' }),
    /milestones/
  );
});
```

- [ ] **Step 2: Run config-loader tests to verify they fail**

Run: `node --test test/config-loader.test.js`

Expected: FAIL because `resolveOptions` is not exported.

- [ ] **Step 3: Implement `resolveOptions`**

Modify `src/config-loader.js`:

```js
import { mergePhaseOptions, selectPhase, validateMilestones } from './phase-config.js';

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
```

Keep existing `loadConfig()` and `mergeOptions()` exports unchanged.

- [ ] **Step 4: Run tests**

Run: `node --test test/config-loader.test.js test/phase-config.test.js`

Expected: PASS.

- [ ] **Step 5: Run full quality gate**

Run: `npm test`

Expected: PASS. This chunk changes shared config loading, so run the repo's only configured quality gate before committing.

- [ ] **Step 6: Commit**

```bash
git add -- src/config-loader.js test/config-loader.test.js
git commit -m "feat: resolve phase-aware CLI config"
```

## Chunk 2: Dependency Lookup and Phase Outputs

### Task 4: Add Phase Report History Lookup

**Files:**
- Create: `src/phase-reports.js`
- Create: `test/phase-reports.test.js`

- [ ] **Step 1: Write failing dependency lookup tests**

Add `test/phase-reports.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  detectDependencyWarnings,
  resolvePhaseOutputPaths
} from '../src/phase-reports.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-phase-reports-'));
}

function writeJson(dir, name, payload, mtime = null) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  if (mtime) fs.utimesSync(file, mtime, mtime);
  return file;
}

test('detectDependencyWarnings accepts met and partially_met dependency reports', async () => {
  const dir = tmpDir();
  writeJson(dir, 'm1.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    repo: 'owner/name',
    phase: { id: 'M1' },
    status: 'partially_met'
  });
  const warnings = await detectDependencyWarnings({
    reportsDir: dir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });
  assert.deepEqual(warnings, []);
  fs.rmSync(dir, { recursive: true });
});

test('detectDependencyWarnings accepts met dependency reports', async () => {
  const dir = tmpDir();
  writeJson(dir, 'm1.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    repo: 'owner/name',
    phase: { id: 'M1' },
    status: 'met'
  });
  const warnings = await detectDependencyWarnings({
    reportsDir: dir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });
  assert.deepEqual(warnings, []);
  fs.rmSync(dir, { recursive: true });
});

test('detectDependencyWarnings warns for missing dependency report', async () => {
  const dir = tmpDir();
  const warnings = await detectDependencyWarnings({
    reportsDir: dir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });
  assert.match(warnings[0], /no prior result/i);
  fs.rmSync(dir, { recursive: true });
});

test('detectDependencyWarnings warns for not_met dependency report', async () => {
  const dir = tmpDir();
  writeJson(dir, 'm1.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    repo: 'owner/name',
    phase: { id: 'M1' },
    status: 'not_met'
  });
  const warnings = await detectDependencyWarnings({
    reportsDir: dir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });
  assert.match(warnings[0], /not met/i);
  fs.rmSync(dir, { recursive: true });
});

test('detectDependencyWarnings uses newest generatedAt and skips old not_met', async () => {
  const dir = tmpDir();
  writeJson(dir, 'old.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    repo: 'owner/name',
    phase: { id: 'M1' },
    status: 'not_met'
  });
  writeJson(dir, 'new.json', {
    generatedAt: '2026-05-02T00:00:00Z',
    repo: 'owner/name',
    phase: { id: 'M1' },
    status: 'met'
  });
  const warnings = await detectDependencyWarnings({
    reportsDir: dir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });
  assert.deepEqual(warnings, []);
  fs.rmSync(dir, { recursive: true });
});

test('detectDependencyWarnings ignores reports from other repos', async () => {
  const dir = tmpDir();
  writeJson(dir, 'other-repo.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    repo: 'other/name',
    phase: { id: 'M1' },
    status: 'met'
  });
  const warnings = await detectDependencyWarnings({
    reportsDir: dir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });
  assert.equal(warnings.some((warning) => /no prior result/i.test(warning)), true);
  fs.rmSync(dir, { recursive: true });
});

test('detectDependencyWarnings ignores old non-phase JSON without generatedAt noise', async () => {
  const dir = tmpDir();
  writeJson(dir, 'old.json', {
    repo: 'owner/name',
    milestone: 'old single milestone report',
    status: 'met'
  });
  const warnings = await detectDependencyWarnings({
    reportsDir: dir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });
  assert.equal(warnings.some((warning) => /generatedAt/i.test(warning)), false);
  assert.equal(warnings.some((warning) => /no prior result/i.test(warning)), true);
  fs.rmSync(dir, { recursive: true });
});

test('detectDependencyWarnings warns and falls back to file mtime for missing generatedAt', async () => {
  const dir = tmpDir();
  writeJson(dir, 'mtime.json', {
    repo: 'owner/name',
    phase: { id: 'M1' },
    status: 'met'
  }, new Date('2026-05-03T00:00:00Z'));
  const warnings = await detectDependencyWarnings({
    reportsDir: dir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });
  assert.equal(warnings.some((warning) => /generatedAt/i.test(warning)), true);
  fs.rmSync(dir, { recursive: true });
});

test('detectDependencyWarnings warns and skips invalid JSON', async () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'bad.json'), '{bad json');
  const warnings = await detectDependencyWarnings({
    reportsDir: dir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: [] }
  });
  assert.equal(warnings.some((warning) => /invalid JSON/i.test(warning)), true);
  fs.rmSync(dir, { recursive: true });
});

test('detectDependencyWarnings uses lexical path order when timestamps tie', async () => {
  const dir = tmpDir();
  writeJson(dir, 'a-met.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    repo: 'owner/name',
    phase: { id: 'M1' },
    status: 'met'
  });
  writeJson(dir, 'b-not-met.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    repo: 'owner/name',
    phase: { id: 'M1' },
    status: 'not_met'
  });
  const warnings = await detectDependencyWarnings({
    reportsDir: dir,
    repo: 'owner/name',
    phase: { id: 'M2', dependsOn: ['M1'] }
  });
  assert.deepEqual(warnings, []);
  fs.rmSync(dir, { recursive: true });
});

test('resolvePhaseOutputPaths creates reportsDir defaults and keeps explicit paths', () => {
  const paths = resolvePhaseOutputPaths({
    cwd: '/repo',
    reportsDir: 'reports',
    repo: 'owner/name',
    phaseId: 'M2',
    timestamp: '20260514_103012',
    out: '/tmp/custom.md'
  });
  assert.equal(paths.out, '/tmp/custom.md');
  assert.equal(paths.htmlOut, path.resolve('/repo/reports/owner_name-M2-20260514_103012.html'));
  assert.equal(paths.jsonOut, path.resolve('/repo/reports/owner_name-M2-20260514_103012.json'));
  assert.equal(paths.phaseJsonOut, path.resolve('/repo/reports/owner_name-M2-20260514_103012.json'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/phase-reports.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement report history and output helpers**

Create `src/phase-reports.js`:

```js
/**
 * __ai_context__
 * 模組角色：Milestone phase 報告歷史與輸出路徑工具
 * 系統位置：cli/config-loader → [本模組] → milestone-check
 * 核心職責：
 *   1. 掃描 reportsDir 中的 phase JSON report
 *   2. 依 dependsOn 產生 warning，不阻擋執行
 *   3. 為 phase mode 產生穩定輸出路徑
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ACCEPTABLE_DEPENDENCY_STATUSES = new Set(['met', 'partially_met']);

function safeReportSlug(value) {
  return String(value || 'unknown').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
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
  const pad = (n) => String(n).padStart(2, '0');
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
  const dir = path.resolve(cwd, reportsDir || 'reports');
  const base = `${safeReportSlug(repo)}-${safeReportSlug(phaseId)}-${timestamp}`;
  const defaultMarkdown = path.join(dir, `${base}.md`);
  const defaultJson = path.join(dir, `${base}.json`);
  const defaultHtml = path.join(dir, `${base}.html`);

  return {
    reportsDir: dir,
    out: out ? path.resolve(cwd, out) : defaultMarkdown,
    jsonOut: jsonOut ? path.resolve(cwd, jsonOut) : defaultJson,
    htmlOut: htmlOut ? path.resolve(cwd, htmlOut) : defaultHtml,
    phaseJsonOut: defaultJson
  };
}

async function readJsonCandidate(filePath, warnings) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return null;
  }

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const payload = JSON.parse(raw);
    return { file: filePath, payload, mtimeMs: stat.mtimeMs };
  } catch {
    warnings.push(`Skipping invalid JSON report: ${filePath}`);
    return null;
  }
}

function withCandidateTime(candidate, warnings) {
  let time = parseGeneratedAt(candidate.payload.generatedAt);
  if (time === null) {
    warnings.push(`Report ${candidate.file} has missing or invalid generatedAt; using file mtime.`);
    time = candidate.mtimeMs;
  }
  return { ...candidate, time };
}

export async function detectDependencyWarnings({ reportsDir = 'reports', repo, phase }) {
  const warnings = [];
  const dependencies = phase?.dependsOn || [];
  let entries = [];

  try {
    entries = await fs.readdir(reportsDir, { withFileTypes: true });
  } catch {
    if (dependencies.length) {
      return dependencies.map((depId) => `Phase ${phase.id} depends on ${depId}, but reportsDir does not exist or cannot be read: ${reportsDir}`);
    }
    return [];
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== '.json') continue;
    const candidate = await readJsonCandidate(path.join(reportsDir, entry.name), warnings);
    if (candidate) candidates.push(candidate);
  }

  for (const depId of dependencies) {
    const matches = candidates
      .filter((candidate) => candidate.payload?.repo === repo && candidate.payload?.phase?.id === depId)
      .map((candidate) => withCandidateTime(candidate, warnings))
      .sort(compareCandidates);
    const latest = matches[0];
    if (!latest) {
      warnings.push(`Phase ${phase.id} depends on ${depId}, but no prior result was found in reportsDir.`);
      continue;
    }
    if (!ACCEPTABLE_DEPENDENCY_STATUSES.has(latest.payload?.status)) {
      warnings.push(`Phase ${phase.id} depends on ${depId}, but latest result is not met: ${latest.payload?.status || 'unknown'}.`);
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
 *    - dependency warning 不阻擋 phase 執行。
 * 2. 潛在邊界情況：
 *    - reportsDir 不存在時，只在有 dependsOn 時回報 dependency warning。
 *    - generatedAt 缺失時用 mtime，並留下 warning。
 * 3. 模組依賴：
 *    - node:fs/promises, node:path。
 */
```

- [ ] **Step 4: Run tests**

Run: `node --test test/phase-reports.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/phase-reports.js test/phase-reports.test.js
git commit -m "feat: add phase report dependency lookup"
```

### Task 5: Wire CLI Phase Mode and Output Defaults

**Files:**
- Modify: `src/cli.js`
- Modify: `src/config-loader.js`
- Modify: `src/phase-config.js`
- Modify: `test/config-loader.test.js`

- [ ] **Step 1: Write failing tests for default output behavior at helper level**

Extend `test/config-loader.test.js` to assert that `reportsDir` defaults to `reports` when absent:

```js
test('resolveOptions defaults reportsDir in phase mode', () => {
  const resolved = resolveOptions(
    { phase: 'M1' },
    { repo: 'owner/name', milestones: [{ id: 'M1', milestone: 'one' }] }
  );
  assert.equal(resolved.reportsDir, 'reports');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test test/config-loader.test.js`

Expected: FAIL until `reportsDir` default is applied.

- [ ] **Step 3: Apply `reportsDir` default in phase merge**

In `mergePhaseOptions`, after normal merge:

```js
if (!merged.reportsDir) {
  merged.reportsDir = 'reports';
}
```

- [ ] **Step 4: Update CLI options and resolution flow**

Modify `src/cli.js`:

```js
import { loadConfig, resolveOptions } from './config-loader.js';
import { detectDependencyWarnings, resolvePhaseOutputPaths } from './phase-reports.js';
```

Add options:

```js
.option('--phase <id>', 'Milestone phase id from .gcc-milestone.yaml')
.option('--reports-dir <path>', 'Directory for phase reports and dependency lookup')
```

Change `--out` to remove Commander default:

```js
.option('--out <path>', 'Output markdown report path')
```

Inside `.action`:

```js
const config = loadConfig();
let merged = resolveOptions(options, config);

if (merged.phase) {
  const outputPaths = resolvePhaseOutputPaths({
    repo: merged.repo,
    phaseId: merged.phase.id,
    reportsDir: merged.reportsDir,
    out: merged.out,
    jsonOut: merged.jsonOut,
    htmlOut: merged.htmlOut
  });
  const dependencyWarnings = await detectDependencyWarnings({
    reportsDir: outputPaths.reportsDir,
    repo: merged.repo,
    phase: merged.phase
  });
  merged = {
    ...merged,
    ...outputPaths,
    dependencyWarnings
  };
} else {
  merged = {
    ...merged,
    out: merged.out || './report.md'
  };
}
```

Keep the existing `repo` and `milestone` validation after this resolution step.

Directory creation is intentionally handled in `runMilestoneCheck` when files are written, not in the CLI. Task 6 must create parent directories for Markdown, JSON, and HTML writes before each `fs.writeFile`.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/config-loader.test.js test/phase-config.test.js test/phase-reports.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- src/cli.js src/config-loader.js src/phase-config.js test/config-loader.test.js
git commit -m "feat: wire CLI phase mode"
```

## Chunk 3: Reporting, Docs, and Verification

### Task 6: Add Phase Metadata to Markdown and JSON Reports

**Files:**
- Modify: `src/milestone-check.js`
- Modify: `test/milestone-check.test.js`

- [ ] **Step 1: Write failing unit tests against internal report builders and runtime JSON writes**

Extend `_internal` in `src/milestone-check.js` later to include `buildReport` and `buildJsonReport`. First update the top imports in `test/milestone-check.test.js` so it imports filesystem helpers and both `runMilestoneCheck` and `_internal`:

```js
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runMilestoneCheck, _internal } from '../src/milestone-check.js';
```

Then append:

```js

test('buildJsonReport includes phase metadata and dependency warnings', () => {
  const payload = _internal.buildJsonReport({
    repo: 'owner/name',
    milestone: 'phase milestone',
    phase: { id: 'M2', title: 'Community proof', dependsOn: ['M1'] },
    dependencyWarnings: ['Phase M2 depends on M1, but no prior result was found in reportsDir.'],
    sinceIso: null,
    profile: null,
    providers: ['github-api'],
    score: 50,
    status: 'partially_met',
    activityScore: 20,
    baseScore: 40,
    providerBonus: 10,
    providerBonusBreakdown: { ci: 0, community: 0, npm: 0, url: 0 },
    semanticMode: 'heuristic',
    semanticWarnings: [],
    counts: { commits: 0, pulls: 0, issues: 0, releases: 0 },
    ruleEval: { passRate: 0, passed: 0, total: 0, rules: [] },
    links: { commits: [], pulls: [], issues: [], releases: [] },
    providerErrors: [],
    providerMeta: {},
    communityHealth: {}
  });
  assert.deepEqual(payload.phase, { id: 'M2', title: 'Community proof', dependsOn: ['M1'] });
  assert.deepEqual(payload.dependencyWarnings, ['Phase M2 depends on M1, but no prior result was found in reportsDir.']);
});

test('buildReport renders phase section and dependency warnings', () => {
  const markdown = _internal.buildReport({
    repo: 'owner/name',
    milestone: 'phase milestone',
    phase: { id: 'M2', title: 'Community proof', dependsOn: ['M1'] },
    dependencyWarnings: ['Phase M2 depends on M1, but no prior result was found in reportsDir.'],
    since: null,
    profile: null,
    providers: ['github-api'],
    score: 50,
    status: 'partially_met',
    activityScore: 20,
    baseScore: 40,
    providerBonus: 10,
    providerBonusBreakdown: { ci: 0, community: 0, npm: 0, url: 0 },
    semanticMode: 'heuristic',
    semanticWarnings: [],
    counts: { commits: 0, pulls: 0, issues: 0, releases: 0 },
    links: { commits: [], pulls: [], issues: [], releases: [] },
    ruleEval: { passRate: 0, passed: 0, total: 0, rules: [] },
    providerErrors: [],
    communityHealthMarkdown: ''
  });
  assert.match(markdown, /Phase: M2/);
  assert.match(markdown, /Community proof/);
  assert.match(markdown, /Dependency Warnings/);
});

test('runMilestoneCheck writes phase metadata to explicit JSON and phase JSON outputs', async () => {
  const previousCwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-phase-run-'));
  process.chdir(dir);
  try {
    const result = await runMilestoneCheck({
      repo: 'owner/name',
      milestone: 'phase milestone',
      providers: ',',
      out: path.join(dir, 'custom.md'),
      jsonOut: path.join(dir, 'custom.json'),
      htmlOut: path.join(dir, 'custom.html'),
      phaseJsonOut: path.join(dir, 'reports', 'owner_name-M2-fixed.json'),
      phase: { id: 'M2', title: 'Community proof', dependsOn: ['M1'] },
      dependencyWarnings: ['Phase M2 depends on M1, but no prior result was found in reportsDir.']
    });

    assert.equal(result.jsonReportPath, path.join(dir, 'custom.json'));
    const explicitPayload = JSON.parse(fs.readFileSync(path.join(dir, 'custom.json'), 'utf8'));
    const phasePayload = JSON.parse(fs.readFileSync(path.join(dir, 'reports', 'owner_name-M2-fixed.json'), 'utf8'));
    assert.deepEqual(explicitPayload.phase, { id: 'M2', title: 'Community proof', dependsOn: ['M1'] });
    assert.deepEqual(phasePayload.phase, explicitPayload.phase);
    assert.deepEqual(phasePayload.dependencyWarnings, ['Phase M2 depends on M1, but no prior result was found in reportsDir.']);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test test/milestone-check.test.js`

Expected: FAIL because `_internal.buildJsonReport` and `_internal.buildReport` are missing, and `runMilestoneCheck` does not yet write `phaseJsonOut`.

- [ ] **Step 3: Extend report builders**

Modify `buildReport` parameters and output:

```js
function formatPhaseSection(phase, dependencyWarnings = []) {
  if (!phase) return '';
  const dependsOn = phase.dependsOn?.length ? phase.dependsOn.join(', ') : '(none)';
  const warningSection = dependencyWarnings.length
    ? `\n## Dependency Warnings\n${dependencyWarnings.map((warning) => `- ⚠️ ${warning}`).join('\n')}\n`
    : '';
  return `- Phase: ${phase.id}${phase.title ? ` (${phase.title})` : ''}\n` +
    `- Phase Dependencies: ${dependsOn}\n` +
    warningSection;
}
```

Add `phase` and `dependencyWarnings` to `buildJsonReport`:

```js
phase: phase || null,
dependencyWarnings: dependencyWarnings || [],
```

Pass `phase` and `dependencyWarnings` from `runMilestoneCheck` into both `buildReport({...})` and `buildJsonReport({...})`; otherwise the builder tests can pass while runtime reports still omit phase metadata.

Add `buildReport` and `buildJsonReport` to `_internal`.

- [ ] **Step 4: Make `runMilestoneCheck` write phase JSON**

Extend `runMilestoneCheck` parameters:

```js
phase,
dependencyWarnings = [],
phaseJsonOut
```

When writing JSON, create the parent directory inside the loop and use a `Set` to deduplicate explicit `jsonOut` and `phaseJsonOut` when they resolve to the same path:

```js
const jsonOutputPaths = new Set();
if (jsonOut) jsonOutputPaths.add(path.resolve(process.cwd(), jsonOut));
if (phaseJsonOut) jsonOutputPaths.add(path.resolve(process.cwd(), phaseJsonOut));
for (const outputPath of jsonOutputPaths) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
}
jsonReportPath = jsonOut ? path.resolve(process.cwd(), jsonOut) : (phaseJsonOut ? path.resolve(process.cwd(), phaseJsonOut) : null);
```

Also create directories before writing Markdown and HTML. Be explicit at all three write sites:

```js
// before writing Markdown
await fs.mkdir(path.dirname(reportPath), { recursive: true });

// before writing HTML
await fs.mkdir(path.dirname(htmlReportPath), { recursive: true });

// before each JSON write inside the JSON output loop
await fs.mkdir(path.dirname(outputPath), { recursive: true });
```

- [ ] **Step 5: Run tests**

Run: `node --test test/milestone-check.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- src/milestone-check.js test/milestone-check.test.js
git commit -m "feat: include phase metadata in reports"
```

### Task 7: Add Phase Rendering to HTML Report

**Files:**
- Modify: `src/html-report.js`
- Modify: `test/html-report.test.js`

- [ ] **Step 1: Write failing HTML tests**

Append to `test/html-report.test.js`:

```js
test('renderHtmlReport includes phase metadata when present', () => {
    const html = renderHtmlReport(makePayload({
        phase: { id: 'M2', title: 'Community proof', dependsOn: ['M1'] },
        dependencyWarnings: []
    }));
    assert.ok(html.includes('Phase'), 'should render phase label');
    assert.ok(html.includes('M2'), 'should render phase id');
    assert.ok(html.includes('Community proof'), 'should render phase title');
    assert.ok(html.includes('M1'), 'should render dependency');
});

test('renderHtmlReport includes dependency warnings when present', () => {
    const html = renderHtmlReport(makePayload({
        phase: { id: 'M2', title: 'Community proof', dependsOn: ['M1'] },
        dependencyWarnings: ['Phase M2 depends on M1, but no prior result was found in reportsDir.']
    }));
    assert.ok(html.includes('Dependency Warnings'), 'should render warnings title');
    assert.ok(html.includes('no prior result'), 'should render warning text');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test test/html-report.test.js`

Expected: FAIL because phase rendering is missing.

- [ ] **Step 3: Implement phase rendering**

Add helper:

```js
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
```

Render after the top metadata card:

```js
${renderPhaseInfo(payload)}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/html-report.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/html-report.js test/html-report.test.js
git commit -m "feat: render phase metadata in HTML reports"
```

### Task 8: Update Documentation and Roadmap State

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `TODO.md`
- Modify: `WORKLOG.md`

- [ ] **Step 1: Update README with phase mode usage**

Add a section near CLI options:

```md
## Phase-based milestones

`.gcc-milestone.yaml` can define milestone phases:

```yaml
repo: owner/name
profile: gcc-allocation
reportsDir: reports
milestones:
  - id: M1
    title: Foundation
    milestone: "Set up repo and publish submission template"
  - id: M2
    title: Community proof
    milestone: "Reach active community discussions"
    dependsOn: M1
```

Run one phase:

```bash
node src/cli.js --phase M2
```

Phase mode is opt-in. Without `--phase`, the CLI keeps the old single `--milestone` behavior. Dependency checks scan `reportsDir` for prior phase JSON reports. Missing or `not_met` dependencies produce warnings but do not block the run.

When phase mode is active, missing output paths default to timestamped files in `reportsDir`:

```text
reports/owner_name-M2-20260514_103012.md
reports/owner_name-M2-20260514_103012.json
reports/owner_name-M2-20260514_103012.html
```

Explicit `--out`, `--json-out`, and `--html-out` still win for the user-requested output path. Phase mode still writes a phase-aware JSON report to `reportsDir` for future dependency lookup. If `--json-out` points somewhere else, both JSON files are written.
```

Also add `--phase` and `--reports-dir` to the options list.

- [ ] **Step 2: Update AGENTS.md**

Add config notes:

```md
- Phase mode is opt-in via `--phase <id>`.
- `.gcc-milestone.yaml` may define `milestones`; phase config can override execution keys, but `repo` and output-routing keys are top-level/CLI-only.
- Config keys use Commander camelCase (`rulesFile`, `jsonOut`, `htmlOut`, `reportsDir`).
- Phase dependency lookup reads phase-aware JSON reports from `reportsDir`; warnings do not block execution.
```

- [ ] **Step 3: Update TODO.md**

Only mark this line complete:

```md
- [x] 支援 milestone 分期定義（M1 → M2 → M3）
```

Do not mark cross-phase progress report or timeline complete.

- [ ] **Step 4: Update WORKLOG.md**

Add a dated entry:

```md
## 2026-05-14 Milestone Phase Definition

### 概要
新增 `.gcc-milestone.yaml` phase schema 與 `--phase` 單期執行模式，保留舊的單一 milestone CLI 行為。

### 決策
- `.gcc-milestone.yaml` 是 phase source of truth。
- `--phase` 為 opt-in；第一版不做 aggregate、timeline、`--all-phases`。
- 合併順序為 CLI > phase > top-level。
- `dependsOn` 只 warning，不阻擋。
- phase mode 永遠輸出 phase-aware JSON 到 `reportsDir`。
```

- [ ] **Step 5: Commit**

```bash
git add -- README.md AGENTS.md TODO.md WORKLOG.md
git commit -m "docs: document milestone phase mode"
```

### Task 9: Full Verification

**Files:**
- No source edits unless verification exposes a bug.

- [ ] **Step 1: Run focused test files**

Run:

```bash
node --test \
  test/phase-config.test.js \
  test/phase-reports.test.js \
  test/config-loader.test.js \
  test/milestone-check.test.js \
  test/html-report.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run package dry-run**

Run:

```bash
npm_config_cache=/tmp/gcc-milestone-agent-npm-cache npm run pack:check
```

Expected: PASS. If this fails because of npm cache ownership, rerun with the same `/tmp` cache path.

- [ ] **Step 4: Skip live manual smoke by design**

Do not run a live-network CLI smoke test for this plan. The provider layer normally reaches GitHub or other external services, so a shell smoke test would be brittle in sandboxed or offline environments. The required verification for this implementation is the focused `node --test` set above plus `npm test`; the runtime no-network path is covered by the `runMilestoneCheck` unit test that uses an empty provider list.

- [ ] **Step 5: Check working tree**

Run: `git status --short`

Expected: only intentionally modified files, no generated reports staged unless explicitly required.

- [ ] **Step 6: Final commit if verification required fixes**

If verification forced any fixes:

```bash
git add -- <changed files>
git commit -m "fix: stabilize milestone phase mode"
```
