# GCC Milestone Agent（中文简明版）

这是一个给资助项目做里程碑验收的 CLI 工具。

它会自动抓取 GitHub 证据（commits / PR / issues / releases），按规则评估完成度，并生成报告。

## 30 秒上手

```bash
npm install
npm run demo:gcc
```

输出：
- `demo-gcc-report.md`
- `demo-gcc-report.json`
- `demo-gcc-report.html`（若运行 `npm run demo:html`）

## 核心特点

- **多資料來源驗證**：支援 GitHub (代碼/社群/CI)、Etherscan (智能合約)、Discord (社群)、Twitter (Vision AI 分析)、網頁爬蟲 (Mirror/Notion) 等全方位社群指標與產出驗證。
- **單期運行與時間軸進度條**：支援在 `.gcc-milestone.yaml` 中定義多階段里程碑並單期執行。運行時會自動掃描歷史報告，聚合并渲染出直觀的多階段進度時間軸（Timeline），支持在 HTML 報告中展現呼吸燈動畫效果。
- 支持 GCC 预置规则：`--profile gcc-allocation`
- 支持自定义规则：`--rules-file ./templates/rules.example.yaml`
- 三种报告格式：Markdown / JSON / HTML
- 每条规则都有语义结论、置信度、理由和证据链接

## 一句话定位

这是一个 **human-in-the-loop 的验收助手**，不自动拨款，只提供可追溯决策支持。
