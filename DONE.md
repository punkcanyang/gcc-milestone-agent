# DONE - gcc-milestone-agent

> 已完成功能歸檔

## v0.2.0 — MVP+ CLI ✅

- [x] CLI scaffolding (commander)
- [x] GitHub REST collector (commits/PR/issues/releases)
- [x] Rule engine v1 (milestone 文本解析 + YAML 外部規則)
- [x] Markdown + JSON + HTML 三種報告輸出
- [x] Retry handling (5xx/429 + retry-after)
- [x] Unit tests (Node test runner)
- [x] Profile 機制 (gcc-allocation)
- [x] Semantic evaluator (keyword coverage heuristic)
- [x] 代碼審查修正 (AI-First 文檔、防禦性斷言、常數化、測試補充)

## v0.3.0 — Multi-Source Evidence Providers ✅

- [x] Provider 基礎架構 (types.js, registry, collectFromProviders)
- [x] 重構 collectEvidence → github-api.js provider
- [x] GitHub Actions provider (CI/CD workflow runs)
- [x] GitHub Community provider (stars, forks, contributors)
- [x] npm Registry provider (套件發布驗證)
- [x] URL Checker provider (README 外部連結可達性)
- [x] CLI `--providers` 選項
- [x] gcc-allocation profile 新增 4 條規則
- [x] Provider 系統測試
- [x] YAML 規則 `source` 欄位過濾（規則只匹配特定 provider 的證據）
- [x] GitHub Actions CI pipeline
- [x] `scoreEvidence` 整合新 provider 的 bonus 分
- [x] GitHub API 分頁迭代 (follow `Link` header)
- [x] Per-rule explainability snippets (引用證據原文)
- [x] Interactive HTML report with filters
- [x] Optional dashboard view for reviewer demo
- [x] Semantic rule reasoning with confidence scores (替換純 keyword 方式)
- [x] LLM-based 語義判定 (可選)
- [x] TypeScript 遷移或 JSDoc 類型完善

## v0.4.0 — Community Growth Monitor ✅

- [x] 設計 Community Health Check 架構（community-health.js 模組）
- [x] Discord / Telegram 社群活躍度快照（成員數、訊息頻率）
- [x] Twitter/X 帳號指標抓取（follower、engagement rate）
- [x] 論壇/Discourse 活躍度檢查（github-discussions provider）
- [x] 整合到報告：Community Growth 章節（Markdown + HTML，含趨勢對比）
- [x] 新增 `discord-community` provider（discord-api provider）
- [x] 新增 `twitter-social` provider（追蹤項目 Twitter 帳號指標）
- [x] 新增 `forum-activity` provider（github-discussions provider）
- [x] 社區指標歷史快照存儲（JSON，支持趨勢對比）
- [x] 引入 Playwright / Puppeteer 作為 browser automation 依賴
- [x] 設計 browser-task runner（可配置的瀏覽器檢查任務）
- [x] 反偵測策略（user-agent、頭部隨機化、速率限制）
- [x] 截圖證據存檔（作為驗收報告的可視化附件）

## v0.5.0 — Grant Lifecycle (部分完成) 🔄

- [x] 支援 milestone 分期定義（M1 → M2 → M3）
- [x] 时间轴视图（Timeline visualization in HTML report）
- [x] 批量模式 CLI（从 YAML/JSON 批量读取多个 repo+milestone 配置）
- [x] 聚合仪表板（所有被审核项目的概览报告）
