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

# Optional LLM semantic mode
OPENAI_API_KEY=your_openai_key node src/cli.js \
  --repo gcc-foundation/gcc-openclaw-grants \
  --milestone "GCC allocation verification" \
  --profile gcc-allocation \
  --semantic-mode llm \
  --llm-model gpt-5-mini \
  --since 2026-03-01 \
  --out ./demo-llm-report.md
# GCC Milestone Verification run (Multi-source Web3 Edition)
node src/cli.js \
  --repo SomeOrg/SomeWeb3Repo \
  --milestone "Deploy smart contract, write documentation, reach 1000 members" \
  --contract-address "0x1234567890abcdef" \
  --article-urls "https://mirror.xyz/my-post" \
  --discord-invite "discord-developers" \
  --twitter-handle "vitalikbuterin" \
  --providers github-api,etherscan-api,article-crawler,discord-api,twitter-browser \
  --out ./demo-web3-report.md
```

## CLI options

- `--repo <owner/name>` required
- `--milestone <text>` required
- `--config <path>` optional YAML config path (default `.gcc-milestone.yaml`)
- `--phase <id>` optional milestone phase id from `.gcc-milestone.yaml`
- `--since <ISO date>` optional
- `--out <path>` markdown report path (default `./report.md`)
- `--json-out <path>` optional JSON report path
- `--html-out <path>` optional HTML report path
- `--reports-dir <path>` directory for phase reports and dependency lookup (default `reports` in phase mode)
- `--rules-file <path>` optional YAML rules file
- `--profile <name>` built-in rule profile (`gcc-allocation`)
- `--providers <list>` comma-separated evidence providers (default: `github-api`)
- `--contract-address <address>` optional smart contract address to verify
- `--etherscan-url <url>` Etherscan-compatible API URL (default: `https://api.etherscan.io/api`)
- `--article-urls <urls>` comma-separated list of article URLs to crawl and verify
- `--discord-invite <code_or_url>` Discord invite code or URL to check community metrics
- `--semantic-mode <mode>` semantic mode (`heuristic` or `llm`, default `heuristic`)
- `--llm-model <name>` OpenAI model used when `--semantic-mode llm` is set (default `gpt-5-mini`)

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

## Available providers

| Provider | What it collects |
|----------|------------------|
| `github-api` | Commits, PRs, issues, releases |
| `github-actions` | CI/CD workflow runs, success rate |
| `github-community` | Stars, forks, contributors |
| `github-discussions` | GitHub Discussions top participants & threads |
| `npm-registry` | npm package publish status |
| `url-checker` | README external URL reachability |
| `etherscan-api` | Smart contract creation date & open source status |
| `article-crawler` | Playwright-based article full-text extraction (Mirror, Notion, etc.) |
| `discord-api` | Discord server approximate members & online count (No Bot Token required) |
| `twitter-browser` | Twitter profile metrics extraction via Vision AI & Playwright screenshot |

## Environment

Optional (recommended for higher GitHub API rate limits):

```bash
export GITHUB_TOKEN=your_github_pat
# or
export GH_TOKEN=your_github_pat

# optional (for Etherscan contract verification)
export ETHERSCAN_API_KEY=your_etherscan_key

# optional (for --semantic-mode llm & twitter Vision AI extraction)
export OPENAI_API_KEY=your_openai_key
```

Note: Browsing capabilities (Article Crawler, Twitter) require Playwright dependencies:
```bash
npx playwright install chromium
```

## Quality checks

```bash
npm test
npm run pack:check
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
- ✅ Semantic reasoning v2 (semanticCoverage + sourceDiversity confidence signal)
- ✅ Optional LLM semantic judgment mode (`--semantic-mode llm`)
- ✅ JSDoc typing enhancement for core semantic modules
- ✅ Etherscan API smart contract verification
- ✅ Playwright headless browser automation
- ✅ Multi-source semantic evaluation (Articles, Twitter screenshots)
- ✅ Discord Invite API for seamless community metrics
- ✅ Unit/integration tests passing via `npm test`
- ✅ Phase-based milestone definitions via `.gcc-milestone.yaml` and `--phase`
- ⚠️ LLM mode is assistive and still requires human final review

## Next milestones

1. Plan and implement the formal frontend + product dashboard (Web dashboard or Tauri desktop app)
2. Publish as npm package (requires npm auth and final package name check)

## npm publish

```bash
# verify package contents
npm run pack:check

# login once
npm login

# publish
npm run publish:public
```
