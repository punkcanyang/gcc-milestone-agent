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
- [x] 截圖證據存檔（作為驗收報告的可视化附件）

## v0.5.0 — Grant Lifecycle ✅

- [x] 支援 milestone 分期定義（M1 → M2 → M3）
- [x] 跨期進度對比報告（Delta 差值計算与色差展示）
- [x] 时间轴视图（Timeline visualization in HTML report & Markdown）
- [x] 批量模式 CLI（从 YAML/JSON 批量读取多个 repo+milestone 配置）
- [x] 仪表盘 HTML 渲染（所有被审核项目的概览报告 index.html）

## v0.6.0 — Frontend & Dashboard ✅

- [x] 建立基于 Vite + React + TypeScript + Tailwind 的前端界面骨架
- [x] 本地数据 SQLite 持久化：设计 projects、milestone_phases、verification_runs 表
- [x] 采用独占 Mutex 线程锁在 Rust 维护 rusqlite Connection，提供单一存取数据通道
- [x] 编写 Tauri Command 并暴露 create_project、list_projects、delete_project、save_run_result、get_project_runs API 接口给 React
- [x] 仪表盘（Dashboard）高保真主视图：卡片列表、横向多阶段里程碑 Timeline、最新状态与得分直接展示
- [x] 仪表盘数据可视化：利用 Recharts 绘制历史得分演进折线图和状态达成分布饼图
- [x] 交互式新建列管项目：支持动态添加阶段、前置依赖配置，提供标准三阶段（M1-M3）快速载入模板
- [x] 新版 NewVerification 适配：实现“关联项目模式”，自动从 SQLite 读取 Repo、Milestone、Profile 进行预填
- [x] 实现历史报告详情查看器（ReportViewer）与 JSON 原生指标阅读

## v0.6.1 — Live Logs, Phase Pipelines & SQLite Backup/Restore ✅

- [x] 重构 Rust `run_verification` 指令，使用 `tokio::process::Command` 替代阻塞式，开启异步子进程并进行 stdio 捕获
- [x] 引入 Tauri Event Bridge 在 Rust 子进程 stdio 循环中向前端实时 emit `verification-log` 日志行事件
- [x] React 全局监听日志事件，并在 Zustand Store 维护 logs 堆栈
- [x] 编写 `VerificationConsole` 交互式终端日志查看器，支持多数据源（`[github-api]`等）以及等级状态（`error` / `success`）高亮着色，支持自动滚屏、清空与复制
- [x] 流水线拓扑依赖计算：前端使用 DAG 拓扑排序算法，根据 phases 的 `depends_on` 列表动态规整串行执行队列
- [x] 流水线执行熔断：在 `runProjectPipeline` 中，前置解析校验所生成的 JSON 报告，当检测到前置依赖分数低于 70 或 status 为 `not_met` 时，优雅阻断，终止后续节点校验
- [x] 仪表盘交互增强：项目卡片添加“运行完整流水线”操作，阶段节点增加 Loading 等待动画和根据最新结果实时更新分值与颜色的效果
- [x] SQLite 安全备份导出：在 Rust 端实现 `backup_database` 并支持用户在 Settings 界面使用 Tauri 原生保存 Dialog 导出文件
- [x] SQLite 防锁死覆盖还原：在 Rust 端 `restore_database` 覆盖前，首先把 Connection 重定向到临时 `:memory:` 内存库，释放物理文件锁以防数据库损坏，拷贝覆盖完毕后再重新 reopen 并挂载至 `DbState` 锁
- [x] Settings 系统数据维护集成：前端集成备份导出与物理文件选择还原，并在还原成功后自动调用 `loadProjects` 刷新 store 缓存

## 工程改善 🔧

- [x] 項目配置文件支持（在项目根目录配置默认校验参数）
