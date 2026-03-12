# gcc-milestone-agent (Node CLI)

MVP CLI for GCC hackathon submission: generate a milestone verification report with evidence summary and recommendation score.

## Quick start

```bash
cd projects/gcc-milestone-agent
npm install
node src/cli.js --repo gcc-foundation/gcc-openclaw-grants --milestone "Publish hackathon workflow docs" --since 2026-03-01 --out ./demo-report.md
```

## Current status

- ✅ CLI scaffolding complete
- ✅ GitHub REST collector connected (commits/PR/issues/releases)
- ✅ Evidence-link markdown output
- ✅ Rule engine v1 (keyword heuristic from milestone text)
- ⚠️ Semantic milestone matching can be improved further

## Environment

Optional (recommended for higher rate limits):

```bash
export GITHUB_TOKEN=your_github_pat
# or
export GH_TOKEN=your_github_pat
```

## Next milestones

1. Rule-based checker from milestone text
2. Per-rule rationale and pass/fail traces
3. Optional JSON output for downstream automation
