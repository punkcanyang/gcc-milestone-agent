# AGENTS.md — gcc-milestone-agent

## Stack

- Node >=18 ESM (`"type": "module"`), CI runs Node 22
- No linter/formatter/typecheck configured — `npm test` is the only quality gate
- Test runner: `node --test` (built-in), tests in `test/*.test.js`
- Dependencies: commander, js-yaml, playwright

## Commands

```bash
npm test                    # all tests
npm run demo                # basic markdown report
npm run demo:gcc            # gcc-allocation profile
npm run demo:html           # html output
npm run pack:check          # dry-run npm pack
npx playwright install chromium  # one-time, for browser providers
```

No way to run a single test file with the built-in runner; use `node --test test/<name>.test.js`.

## Architecture

```
src/cli.js  →  milestone-check.js  →  providers/index.js  →  rule-engine.js  →  html-report.js
                    ↓
           community-health.js  →  snapshot-store.js
```

- **Entry**: `src/cli.js` (commander). Options are auto-camelCased (`--json-out` → `jsonOut`).
- **Core**: `src/milestone-check.js` orchestrates evidence collection, scoring, report generation.
- **Providers**: `src/providers/*.js`. Registry in `index.js`. Each provider exports `{ name, types, collect }`. Adding a provider: import + push to `BUILTIN_PROVIDERS` in `index.js`, add `PROVIDER_SOURCES` and `EVIDENCE_TYPES` entries in `types.js`.
- **Providers run concurrently** — a single provider failure does not block others.
- **Community health**: `src/community-health.js` aggregates metrics from all provider metadata into a unified view. `src/snapshot-store.js` saves/loads JSON snapshots to `.gcc-milestone/snapshots/` for trend comparison.
- **Rule engine**: `src/rule-engine.js` parses milestone text into rules; external rules via YAML (`--rules-file` or `--profile`).
- **Profiles**: built-in rule sets in `profiles/*.yaml` (currently `gcc-allocation` only).
- **Scoring**: activity (weighted commits/PRs/issues/releases, 60%) + rule pass rate (40%) + provider bonus (up to +20). Thresholds: met≥70, partially_met≥40.
- **Browser cleanup**: `closeBrowser()` from `browser-runner.js` must be called on exit to avoid leaking Playwright instances.

## Key conventions

- All source files have Chinese `__ai_context__` doc blocks and `[For Future AI]` sections — read these before refactoring.
- Tests import `_internal` exports for unit-testing private functions.
- `--rules-file` overrides `--profile`, they never merge.
- Provider source names in rules YAML (`source: github-actions`) must match `PROVIDER_SOURCES` values exactly.
- `flattenCounts`/`flattenLinks` only merge the 4 legacy keys (commits, pulls, issues, releases) — new evidence types need explicit handling in `scoreEvidence`.

## Environment

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` / `GH_TOKEN` | Higher API rate limits |
| `ETHERSCAN_API_KEY` | Smart contract verification |
| `OPENAI_API_KEY` | `--semantic-mode llm` + Twitter Vision AI |

## Frontend

`frontend/` is a separate Vite + React + Tauri desktop app. Has its own `package.json`, dependencies, and build. Not part of the CLI package. Use `npm run dev` inside `frontend/` for local development.

## Rules YAML format

```yaml
rules:
  - id: R1
    text: Description of the rule
    keywords: [keyword1, keyword2]
    source: github-api          # optional, filters which provider evidence applies
```

## Gotchas

- Commander auto-camelCases CLI options — `--json-out` is accessed as `options.jsonOut` in JS.
- No test watch mode; re-run `npm test` manually.
- Playwright browsers must be installed separately (`npx playwright install chromium`).
- GitHub API pagination is capped at a max page count; truncation warnings appear in reports when limits are hit.
- Snapshot files in `.gcc-milestone/snapshots/` are gitignored by convention (generated data).
