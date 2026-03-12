# GCC Milestone Agent（中文详细版）

## 项目定位

GCC Milestone Agent 是一个面向资助流程的里程碑验收工具。目标是把“证据收集 + 规则评估 + 报告产出”流程自动化，同时保留人工最终决策（human-in-the-loop）。

## 解决的问题

在公共品资助项目里，验收通常要手动翻仓库、查 issue、看 release，流程重复且标准不一致。这个工具把分散证据组织成结构化报告，降低评审成本并提升透明度。

## 工作流程

1. 拉取 GitHub 证据（commits / PR / issues / releases）
2. 加载规则（里程碑文本拆解 / YAML 文件 / 预置 profile）
3. 执行规则匹配 + 语义判断
4. 输出报告（Markdown / JSON / HTML）

## 快速开始

```bash
npm install

# 基础运行
node src/cli.js \
  --repo gcc-foundation/gcc-openclaw-grants \
  --milestone "submission template, issue discussion, open source workflow" \
  --since 2026-03-01 \
  --out ./report.md

# GCC 预置规则
node src/cli.js \
  --repo gcc-foundation/gcc-openclaw-grants \
  --milestone "GCC allocation verification" \
  --profile gcc-allocation \
  --since 2026-03-01 \
  --out ./demo-gcc-report.md \
  --json-out ./demo-gcc-report.json \
  --html-out ./demo-gcc-report.html
```

## 参数说明

- `--repo <owner/name>`：目标仓库（必填）
- `--milestone <text>`：里程碑描述（必填）
- `--since <date>`：时间窗口过滤（可选）
- `--profile <name>`：预置规则集（当前支持 `gcc-allocation`）
- `--rules-file <path>`：YAML 规则文件（可选）
- `--out <path>`：Markdown 输出路径
- `--json-out <path>`：JSON 输出路径
- `--html-out <path>`：HTML 输出路径

## 输出解释

- **Score**：总分（综合 activity + 规则通过率）
- **Activity Score**：活跃度分（基于证据数量）
- **Rule Pass Rate**：规则通过率
- **Semantic Verdict**：语义结论（met / partially_met / not_met）
- **Confidence**：语义置信度
- **Rationale**：结论理由
- **Cited URLs**：关键证据链接

## 质量保证

```bash
npm test
npm run demo:gcc
npm run demo:html
```

## 说明

该工具是决策支持系统，不直接执行拨款动作。任何资金分配应由人工审核后决定。
