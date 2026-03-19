# gcc-milestone-agent (Node CLI)

MVP+ CLI for GCC hackathon submission: verify grant milestone progress using GitHub evidence + rule checks, then output markdown/JSON/HTML reports.

中文说明：
- 简明版：`README.zh-CN.quick.md`
- 详细版：`README.zh-CN.full.md`

## Quick start

```bash
cd projects/gcc-milestone-agent
npm install

# Basic run (markdown)
node src/cli.js \
  --repo gcc-foundation/gcc-openclaw-grants \
  --milestone "submission template, issue discussion, open source workflow" \
  --since 2026-03-01 \
  --out ./demo-report.md

# Advanced run (markdown + json + custom rules)
node src/cli.js \
  --repo gcc-foundation/gcc-openclaw-grants \
  --milestone "submission template, issue discussion, open source workflow" \
  --since 2026-03-01 \
  --out ./demo-report.md \
  --json-out ./demo-report.json \
  --rules-file ./templates/rules.example.yaml

# GCC profile run
node src/cli.js \
  --repo gcc-foundation/gcc-openclaw-grants \
  --milestone "GCC allocation verification" \
  --profile gcc-allocation \
  --since 2026-03-01 \
  --out ./demo-gcc-report.md \
  --json-out ./demo-gcc-report.json

# Multi-source run (all providers)
node src/cli.js \
  --repo gcc-foundation/gcc-openclaw-grants \
  --milestone "GCC allocation verification" \
  --profile gcc-allocation \
  --providers github-api,github-actions,github-community,npm-registry,url-checker \
  --since 2026-03-01 \
  --out ./demo-full-report.md \
  --json-out ./demo-full-report.json
```

## CLI options

- `--repo <owner/name>` required
- `--milestone <text>` required
- `--since <ISO date>` optional
- `--out <path>` markdown report path (default `./report.md`)
- `--json-out <path>` optional JSON report path
- `--html-out <path>` optional HTML report path
- `--rules-file <path>` optional YAML rules file
- `--profile <name>` built-in rule profile (`gcc-allocation`)
- `--providers <list>` comma-separated evidence providers (default: `github-api`)

## Available providers

| Provider | What it collects |
|----------|------------------|
| `github-api` | Commits, PRs, issues, releases |
| `github-actions` | CI/CD workflow runs, success rate |
| `github-community` | Stars, forks, contributors |
| `npm-registry` | npm package publish status |
| `url-checker` | README external URL reachability |

## Environment

Optional (recommended for higher GitHub API rate limits):

```bash
export GITHUB_TOKEN=your_github_pat
# or
export GH_TOKEN=your_github_pat
```

## Quality checks

```bash
npm test
npm run demo
npm run demo:gcc
npm run demo:html
```

## Current status

- ✅ CLI scaffolding complete
- ✅ GitHub REST collector connected (commits/PR/issues/releases)
- ✅ Rule engine v1 (milestone parsing + YAML external rules)
- ✅ Markdown + JSON + HTML triple output
- ✅ Retry handling for GitHub transient failures (5xx/429)
- ✅ Unit tests (Node test runner)
- ✅ Provider architecture (multi-source evidence collection)
- ✅ GitHub Actions, Community, npm, URL checker providers
- ✅ Source-filtered rule matching (`rules[].source`)
- ✅ GitHub API pagination (follow `Link` header, capped by max pages)
- ✅ Provider bonus scoring (CI/community/npm/URL signals)
- ✅ Per-rule explainability snippets (quoted evidence text)
- ✅ Interactive HTML report filters (by semantic verdict/source)
- ✅ Reviewer dashboard view (KPI + verdict distribution)
- ⚠️ Rule matching is keyword-based; semantic reasoning is next step

## Next milestones

1. Semantic rule reasoning with confidence scores
2. LLM-based semantic rule judgment (optional)
