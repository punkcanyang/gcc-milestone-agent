# GCC Milestone Agent（中文详细版）

## 项目定位

GCC Milestone Agent 是一个面向资助流程的里程碑验收工具。目标是把“证据收集 + 规则评估 + 报告产出”流程自动化，同时保留人工最终决策（human-in-the-loop）。

## 解决的问题

在公共品资助项目里，验收通常要手动翻仓库、查 issue、看 release，流程重复且标准不一致。这个工具把分散证据组织成结构化报告，降低评审成本并提升透明度。

## 工作流程

1. 透過多種 Provider 收集驗證資料（支援 GitHub, 智能合約, 外部網頁爬蟲, Twitter Vision AI, Discord 群組資料等）
2. 加载规则（里程碑文本拆解 / YAML 文件 / 预置 profile）
3. 执行规则匹配 + 语义判断（支援 Heuristic 啟發式與 LLM 語義引擎）
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

## 多期里程碑支持与时间轴 (Timeline)

可以在配置文件（默认 `.gcc-milestone.yaml`）中定义 milestones 数组。当传入 `--phase <id>` 选项时：
1. **依赖检查**：系统自动验证依赖的前置 Phase 是否已经生成通过的报告，未通过时输出警告。
2. **自动汇总**：自动扫描 `reportsDir` 内的历史报告，并根据 `milestones` 配置的顺序聚合成完整的时间轴，未运行阶段显示为 `pending`。
3. **可视化渲染**：时间轴会以表格形式输出在 Markdown 报告中，并以精美的横向响应式时间轴在 HTML 中展示，当前执行的阶段还包含呼吸灯（pulsing aura）动画效果。

## 参数说明

- `--repo <owner/name>`：目标仓库（必填）
- `--milestone <text>`：里程碑描述（必填）
- `--config <path>`：可选的配置文件路径（默认 `.gcc-milestone.yaml`）
- `--phase <id>`：单期里程碑阶段 id
- `--reports-dir <path>`：历史报告存放与读取路径
- `--since <date>`：时间窗口过滤（可选）
- `--profile <name>`：预置规则集（当前支持 `gcc-allocation`）
- `--rules-file <path>`：YAML 规则文件（可选）
- `--providers <list>`：指定要執行的資料收集提供者（預設為 `github-api`）
- `--contract-address <address>`：要驗證的智能合約地址（配合 `etherscan-api`）
- `--article-urls <urls>`：要爬取的文章或外部文件網址列表（配合 `article-crawler`）
- `--discord-invite <code_or_url>`：Discord 群組邀請碼，用以驗證社群指標（配合 `discord-api`）
- `--semantic-mode <mode>`：語義判定模式，可選 `heuristic` 或 `llm`
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
