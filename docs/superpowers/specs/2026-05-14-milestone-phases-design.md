# Milestone Phase Definition Design

## Context

`gcc-milestone-agent` currently runs one milestone definition at a time. The CLI accepts `--milestone <text>`, config loading reads `.gcc-milestone.yaml`, and `milestone-check.js` receives one merged run config. The v0.5 roadmap adds milestone phase support before cross-phase comparison and timeline reports.

This design adds a config-first phase selector while preserving the existing single-milestone behavior.

## Goals

- Support milestone phase definitions such as `M1`, `M2`, and `M3` in `.gcc-milestone.yaml`.
- Enable `milestone-agent --phase <id>` to run one selected phase.
- Allow phase-level overrides while keeping top-level config defaults.
- Track phase metadata in JSON reports for later dependency and cross-phase work.
- Warn, but do not block, when dependency phase results are missing or not met.
- Keep aggregate reports, `--all-phases`, cross-phase progress comparison, and timeline visualization out of this first implementation.

## Non-Goals

- No multi-phase aggregate execution in this first phase.
- No timeline rendering.
- No cross-phase score aggregation.
- No hard blocking on failed dependencies.
- No change to old `--milestone` behavior unless `--phase` is explicitly provided.

## Config Schema

Phase definitions live in `.gcc-milestone.yaml` under `milestones`.

```yaml
repo: owner/name
profile: gcc-allocation
providers: github-api,github-actions
reportsDir: reports

milestones:
  - id: M1
    title: Foundation
    milestone: "Set up repo, publish submission template"
    providers: github-api

  - id: M2
    title: Community proof
    milestone: "Run community campaign, reach active discussions"
    dependsOn: M1
    providers: github-api,github-discussions,discord-api

  - id: M3
    title: Delivery
    milestone: "Publish release and final report"
    dependsOn: [M1, M2]
```

Phase ids use a slug rule: non-empty ASCII letters, numbers, underscores, and hyphens only. `M1` through `M9` are expected to be common, but the format does not require a fixed `M<number>` pattern. Duplicate phase ids are invalid.

`dependsOn` accepts either a string or an array. It is normalized internally to an array.

Config keys should use JavaScript/Commander camelCase names, such as `rulesFile`, `jsonOut`, `htmlOut`, and `reportsDir`.

## Merge Rules

When `--phase <id>` is used, effective options are merged in this order:

1. top-level `.gcc-milestone.yaml`
2. selected phase object
3. CLI options

CLI values always win. Phase values can override top-level defaults for execution inputs such as `milestone`, `profile`, `providers`, `since`, `rulesFile`, and provider-specific options.

Phase values must not override global identity or output-routing keys. `repo`, `reportsDir`, `out`, `jsonOut`, `htmlOut`, and `milestones` are top-level or CLI-only. This keeps all phases in one config tied to the same repository and report history unless the user explicitly overrides the repository from the CLI.

If `--phase M2 --milestone "..."` is used, the CLI `--milestone` value overrides the selected phase's `milestone` text. This follows the existing CLI override rule and is useful for one-off verification. The report still records `phase.id = "M2"`.

Without `--phase`, the existing merge behavior remains unchanged.

## CLI Behavior

Add:

```bash
milestone-agent --phase M2
milestone-agent --reports-dir reports --phase M2
```

`--phase` is an explicit opt-in to phase mode. If it is absent, the CLI continues to require `--milestone` or top-level `milestone` exactly as it does today.

If `--phase` is present:

- `.gcc-milestone.yaml` must contain `milestones`.
- the selected phase id must exist.
- phase ids and dependencies must validate before evidence collection starts.
- the effective config after merge must contain a non-empty `repo`.
- the effective config after merge must contain a non-empty `milestone`.
- dependency warnings are computed before the selected phase runs.
- output defaults come from `reportsDir` when explicit output paths are not supplied.

## Output Paths

Phase mode uses `reportsDir` as the default output directory. If no explicit `--out`, `--json-out`, or `--html-out` is provided, the CLI writes timestamped Markdown, JSON, and HTML files.

Example:

```text
reports/owner_name-M2-20260514_103012.md
reports/owner_name-M2-20260514_103012.json
reports/owner_name-M2-20260514_103012.html
```

Explicit CLI output paths still win.

Each output path is resolved independently:

- `--out` controls the Markdown path; if absent, write Markdown to `reportsDir`.
- `--html-out` controls the HTML path; if absent, write HTML to `reportsDir`.
- `--json-out` controls the user-requested JSON path; if absent, write JSON to `reportsDir`.

Phase mode must always produce a phase-aware JSON report in `reportsDir`, even if the user only supplies Markdown or HTML output paths. This keeps dependency lookup reliable. If an explicit `--json-out` is also provided, write both the explicit JSON path and the `reportsDir` phase JSON unless they resolve to the same file.

## JSON Report Metadata

JSON reports gain phase metadata and dependency warnings:

```json
{
  "repo": "owner/name",
  "phase": {
    "id": "M2",
    "title": "Community proof",
    "dependsOn": ["M1"]
  },
  "dependencyWarnings": [
    "Phase M2 depends on M1, but no prior result was found in reportsDir."
  ],
  "milestone": "Run community campaign, reach active discussions"
}
```

Old JSON reports without `phase.id` do not count as dependency results.

## Dependency Lookup

Dependency lookup scans `reportsDir` for `.json` files. It ignores invalid JSON files and records a warning for skipped files.

For each dependency id:

- find reports with the same `repo` and matching `phase.id`
- if multiple reports match, use the newest valid `generatedAt`
- if a matching report has missing or invalid `generatedAt`, fall back to file mtime and include a warning
- if timestamps tie, use lexical path order as the deterministic tie-breaker
- `status: met` and `status: partially_met` are acceptable
- `status: not_met` produces a warning
- no matching report produces a warning

Dependency warnings do not block the selected phase run.

## Validation

Phase mode fails before evidence collection when:

- `--phase` is provided but `milestones` is missing
- selected phase id is absent
- selected phase id has an invalid format
- any phase id has an invalid format
- duplicate phase ids exist
- `dependsOn` references a missing phase id
- a phase depends on itself
- dependencies contain a cycle
- the effective merged config lacks a non-empty `repo`
- the effective merged config lacks a non-empty `milestone`

The error for an unknown phase should list available phase ids.

## Module Boundaries

Phase behavior should stay close to config and CLI setup.

- `config-loader.js`
  - load top-level config
  - validate and normalize phases
  - select a phase
  - merge `CLI > phase > top-level`

- phase helper module or focused helper functions
  - `validatePhaseId`
  - `normalizeDependsOn`
  - `selectPhase`
  - `detectDependencyWarnings`
  - `resolvePhaseOutputPaths`

- `milestone-check.js`
  - receives already-merged run options
  - adds `phase` and `dependencyWarnings` to Markdown, JSON, and HTML payloads
  - does not need to understand the full `.gcc-milestone.yaml` schema

The rule engine should not know about phases.

## Reporting

Markdown and HTML reports should display the selected phase id, title, dependencies, and dependency warnings when phase mode is active. Non-phase reports should remain visually and structurally unchanged except for tolerating missing phase fields.

## Tests

Add focused `node --test` coverage:

- config loading accepts `milestones`
- `--phase` selects the correct phase
- merge order is `CLI > phase > top-level`
- `dependsOn` string and array forms normalize to arrays
- invalid phase ids fail
- duplicate phase ids fail
- missing selected phase fails and lists available ids
- missing dependency id fails
- self-dependency fails
- dependency cycles fail
- selected phase must resolve to a non-empty milestone
- dependency lookup finds same repo and phase id
- multiple matching reports choose the newest `generatedAt`
- missing or invalid `generatedAt` falls back to file mtime with a warning
- tied timestamps use lexical path order deterministically
- `met` and `partially_met` do not warn
- `not_met` warns
- missing dependency result warns
- invalid JSON files in `reportsDir` warn and are skipped
- phase metadata appears in JSON payload
- dependency warnings appear in JSON, Markdown, and HTML reports
- phase mode produces phase-aware JSON in `reportsDir` even when only Markdown or HTML output was requested

## Documentation Updates

- `README.md`: add `.gcc-milestone.yaml` phase example, `--phase`, `--reports-dir`, output defaults, and dependency warning semantics.
- `AGENTS.md`: note phase mode, camelCase config keys, and that old single-milestone behavior remains the default.
- `TODO.md`: mark only "支援 milestone 分期定義（M1 → M2 → M3）" complete after implementation.
- `WORKLOG.md`: record the schema, merge order, dependency warning behavior, and always-on phase JSON decision.
