# WORKLOG - gcc-milestone-agent

## 2026-05-24 Milestone Report PDF Export Support (里程碑报告 PDF 格式物理导出/方案一)

### 概要
完成了里程碑验证报告的 A4 格式 PDF 一键导出功能。该功能在前端 ReportViewer 页面提供一键“Export PDF”原生另存为交互，并在后端利用已安装的 Playwright Chromium 引擎，以无损矢量方式静默渲染并导出 HTML 报告为高排版保真的 PDF。

### 变更清单
- **新增 HTML-to-PDF 后台工具脚本 (`src/html-to-pdf.js`)**：
  - 编写了基于 Playwright Chromium headless 虚拟打印的轻量转换逻辑。
  - 支持 A4 页面格式、20mm 上下左右页边距、以及强制 `printBackground: true`（保证报告背景配色的高保真还原）。
- **优化 HTML 渲染模板的打印 CSS 样式 (`src/html-report.js`)**：
  - 补充了 `@media print` 媒体查询，对打印状态进行了排版调优。
  - 在规则评估过滤表单容器中加入了 `print-hidden` 类，在 PDF 导出时自动静默隐藏交互式过滤选择框。
  - 对普通卡片及规则卡片（`.card`, `.rule-card`）配置了 `page-break-inside: avoid`，解决了 PDF 分页时文字或表格边框拦腰折断的问题。
- **扩展 Rust 后端 API 通道 (`verifier.rs` & `lib.rs`)**：
  - 在 `verifier.rs` 中实现了 `export_pdf_report` Tauri 指令。接收前端的 `report_id`（文件名）和物理保存路径，定位到 reports 目录下的 `.html` 报告文件，并在后台用异步子进程拉起 `node src/html-to-pdf.js <html_path> <dest_path>` 触发转换。
  - 在主入口 `lib.rs` 的 `invoke_handler` 列表中挂载注册了该新命令。
- **改造 React 前端与 Dialog 交互 (`api.ts` & `ReportViewer.tsx`)**：
  - 在 `api.ts` 中完成了对 `export_pdf_report` 的 TypeScript 异步请求接口封装。
  - 在 `ReportViewer.tsx` 详情页右上角新设了 “Export PDF” 按钮（使用 Lucide `Download` 图标），支持防高频重入的 Loading 状态。
  - 点击时，调用 Tauri Dialog 插件的 `save` 对话框，获取用户指定的物理保存路径，从而触发后台 PDF 导出，完毕后弹出“PDF 报告导出成功”的全局提示。
- **编译与单元测试质量关口**：
  - 后端执行 `cargo check` 正常，前端执行 `npm run build` 打包通过。
  - 核心 CLI 单元测试 `npm test` 所有 164 个用例全部顺利通过。

---

## 2026-05-21 Rust Backend Modular Refactoring (Rust 后端代码解耦重构/方案 A)

### 概要
为贯彻 "Modular Context Windows"（模块化上下文窗口）架构设计标准，将原本多达 1114 行的单体文件 `frontend/src-tauri/src/lib.rs` 进行了物理模块化解耦重构。将数据模型、数据库交互、规则集管理、异步进程校验和全局配置读取分别拆分至独立子模块中，极大地改善了代码的可读性，并使得后续 AI 代理的上下文检索和局部代码修改更加轻量、省 Token 且高内聚。

### 变更清单
- **数据库子模块化 (`src/db.rs`)**：
  - 迁移 `Project`、`MilestonePhase`、`ProjectWithPhases` 和 `VerificationRun` 核心数据结构的声明。
  - 迁移全局 Mutex 数据库状态持有者 `DbState` 以及表的创建逻辑 `init_db`。
  - 迁移项目 CRUD 相关的 7 个 Tauri Commands（包括原子事务写入、级联删除、备份与释放物理文件锁以进行还原的数据库重置机制）。
- **规则集子模块化 (`src/commands/profile.rs`)**：
  - 迁移 `ProfileRule` 和 `ProfileSummary` 规则定义。
  - 迁移 `list_profiles`、`save_profile`、`delete_profile` 等命令。
  - 将内置规则集路径定位查找函数 `find_builtin_profile_path` 缩减为 profile 模块内私有，提升代码内聚。
- **校验流与报告管理子模块化 (`src/commands/verifier.rs`)**：
  - 迁移 `run_verification` 指令，负责用异步管道拉起 CLI 校验子进程，并流式向前端分发实时日志。
  - 迁移校验报告的扫描列表、读取与删除的 IPC 命令（如 `list_reports` 等）。
  - 将 CLI 执行文件物理定位查找函数 `find_cli_path` 收窄为该模块内私有。
- **应用全局配置子模块化 (`src/commands/config.rs`)**：
  - 迁移 `AppConfig` 数据结构以及 `get_app_config` / `save_app_config` 命令。
- **子模块导出与主入口精简 (`src/commands/mod.rs` & `src/lib.rs`)**：
  - 新建 `src/commands/mod.rs` 管理并公开所有子模块。
  - `src/lib.rs` 瘦身至 80 行以内，仅负责引导 Tauri 基础生命周期、在 setup 中初始化数据库以及集中挂载注册解耦后的 20 个 Tauri IPC 命令路由。
- **AI-First 规范全面覆盖**：
  - 在每个新增和重构的 Rust 源文件头部插入 `__ai_context__` 上下文说明，并在文件尾部追加 `[For Future AI]` 关键假设与边界设计说明。
- **构建与测试验证**：
  - `cargo check` 编译顺利通过（修复了多行注释嵌套 `/*` 带来的编译器报错）。
  - 前端执行 `npm run build`（tsc & vite build）完成打包，各 IPC 命令调用映射完全对应。
  - 核心 CLI 单元测试 `npm test` 所有 164 个用例全部 100% 成功通过。

---

## 2026-05-21 TODO & DONE Document Consolidation (路线图与归档整理)

### 概要
对项目的 `TODO.md` 与 `DONE.md` 文件进行了全面整理。将已全部完成的 `v0.5.0` (多期验收与批量模式)、`v0.6.0` (桌面 UI 及 SQLite 存取通道)、`v0.6.1` (实时进度及备份维护) 的所有已实现子项进行勾选，并将它们归档至 `DONE.md`。在 `TODO.md` 中补充了未来的桌面端深度增强、离线 PDF 报告、规则引擎优化及 CI 自动化流水线集成等新 roadmap 规划。

### 变更清单
- **TODO 整理**：重构并精简了根目录下的 `TODO.md`，清理了历史已实现的繁杂条目，补充了后续的桌面端 UI 交互设计、多链/多语言支持以及 CI 自动化集成的代办事项。
- **DONE 归档**：在 `DONE.md` 中完整归档了 `v0.5.0`、`v0.6.0` 与 `v0.6.1` 所实现的所有功能子项（包括 DAG 拓扑执行、物理锁安全释放、实时日志控制台等）。

---

## 2026-05-21 Live Logs, Phase Pipelines & SQLite Backup/Restore (v0.6.1 桌面端功能增强)

### 概要
完成了桌面 UI 客户端的 v0.6.1 版本三合一功能增强开发与验证。本次更新包含多进程实时进度与日志广播、基于拓扑排序的多阶段里程碑流水线链式触发、本地 SQLite 数据库安全备份与防损坏覆盖还原。通过流式推送、前置熔断、连接重置三大核心机制保障了客户端的交互实时性、执行安全度及数据可靠性。

### 变更清单
- **多进程实时日志流推送 (Rust + React)**：
  - Rust 端：将 `run_verification` 中的 `std::process::Command` 重构为异步 `tokio::process::Command`，启动后台任务通过 `BufReader` 异步按行读取 `stdout` 与 `stderr` 并通过 Tauri Event `verification-log` 广播到前端。
  - 前端 Zustand：监听全局日志事件，将日志流推送入全局 `verificationLogs` 数组。
  - 前端 UI：新增 `VerificationConsole.tsx` 日志控制台抽屉组件，实现日志等级与组件标识（如 `[github-api]`）动态高亮着色，支持自动滚屏、清空与一键复制。
- **依赖感知的多阶段流水线链式触发 (React Dashboard)**：
  - 算法实现：前端使用 DAG 拓扑排序算法，根据 phases 定义中的 `depends_on` 属性计算安全执行序列。
  - 执行与熔断：在 `runProjectPipeline` 中串行触发阶段校验，并前置解析校验所生成的 JSON 报告，如果得分小于 70 或状态为 `not_met`，则执行优雅熔断，终止后续依赖阶段的运行。
  - 界面增强：项目卡片增加“运行完整流水线”操作，阶段节点增加 Loading 等待动画和根据最新结果实时更新分值与颜色的效果。
- **SQLite 数据库安全备份与恢复 (Rust + React Settings)**：
  - Rust 安全防锁死机制：在 `restore_database` 覆盖还原数据库前，首先将活动连接重定向到 `:memory:` 临时内存库中，确保完全释放 SQLite 物理文件锁，防止数据损坏，拷贝覆盖后再重新初始化并打开数据库，注入 Tauri 管理的 `DbState`。
  - 前端 UI 集成：在 Settings 页面中引入“系统数据维护”板块，调用 Tauri Dialog 插件触发原生保存/打开对话框，实现文件路径交互并触发备份和回滚恢复。
- **项目测试与质量验证**：
  - 在 `frontend/src-tauri` 运行 `cargo check`，Rust 后端编译成功，没有编译错误。
  - 在 `frontend` 运行 `npm run build`，Vite + React 前端构建打包通过，TypeScript 类型无误。
  - 在根目录下运行 `npm test`，核心 CLI 系统的 164 个测试用例 100% 通过。

---

## 2026-05-20 SQLite-Backed Project & Multi-Phase Database Integration (方案 A / v0.6.0 前端底层)

### 概要
完成了桌面 UI 本地 SQLite 存储通道与多项目多阶段里程碑的无缝打通。这实现了“单一存取通道原则”，保证 CLI 部分保持纯净的文件系统读写，而所有数据库读写、项目增删改查以及执行历史沉淀均统一封装在 Rust / Tauri 状态和命令中。前端通过 Zustand Store 精准联动，提供极富现代美学与高保真图表的仪表盘界面。

### 变更清单
- **Rust / Tauri 数据库建模与初始化**：
  - 在 `frontend/src-tauri/src/lib.rs` 定义了 `Project`、`MilestonePhase`、`VerificationRun` 核心领域模型，并封装了 `DbState` 用 Mutex 包装的 Connection，以进行跨线程的安全多路复用。
  - 编写并实现了 `init_db`，在 App Setup 阶段自动从用户的 AppData 目录加载 `milestones.db` 库并开启 `foreign_keys`，同时以事务形式创建 `projects`、`milestone_phases`、`verification_runs` 级联删除数据表。
- **IPC 通道命令设计 (Tauri Commands)**：
  - 实现并导出了 `create_project`、`list_projects`、`delete_project`、`save_run_result`、`get_project_runs`。
  - 在 `save_run_result` 中，实现了读取 CLI 的 JSON 报告文件（含 `EvidenceCounts`、得分、通过率等）并直接沉淀入 `verification_runs` 数据表中。
  - 将所有新命令注册进 `tauri::generate_handler!` 并在 App 的 `run` 函数中与 `setup` 逻辑安全绑定。
- **React 端 TS 模型与 API 通道**：
  - 在 `frontend/src/lib/types.ts` 定义了对应的 `Project`、`MilestonePhase`、`ProjectWithPhases` 和 `VerificationRun` 类型。
  - 在 `frontend/src/lib/api.ts` 封装了所有底层 Tauri IPC command 调用的异步函数。
- **Zustand Store 扩展与自动持久化**：
  - 重构并扩展了 `frontend/src/lib/store.ts` 中的全局 Zustand Store，定义了项目 CRUD Action 和 runs 状态管理。
  - 扩展了 `runVerification` 方法：当传入 `projectId` 和 `phaseId` 时，校验如果运行成功，会自动读取并保存指标至本地 SQLite，实现了无缝且全自动的防错数据沉淀流程。
- **页面交互优化**：
  - 重构了 `Dashboard.tsx` 页面，开发了包括“新建列管项目”折叠表单、阶段动态列表管理，并且实现了包含多阶段横向时间轴（Timeline）可视化的列管项目看板卡片，支持一键点击对特定阶段触发校验。
  - 接入了真实的 SQLite 汇总历史数据，实现了 Recharts 折线图（得分变化趋势）和饼图（状态达成分布）的高保真图表渲染。
  - 重构了 `NewVerification.tsx` 页面，提供“关联列管项目”与“手动自由验证”的双重交互选择。当选择列管项目和阶段时，会自动从数据库中预填 Repository 名字、相应的 Milestone 描述文本和 rules_profile。
- **测试与编译**：
  - 在 `frontend/src-tauri` 下成功执行 `cargo check`，Rust 模块在 Bundled C SQLite 构建模式下全部通过，零警告零报错。

---

## 2026-05-20 Cross-Phase Progress Comparison Report (方案 1)

### 概要
完成了「跨期进度对比报告」（方案 1）的完整开发。该功能能够自动解析历史阶段报告中的各项核心指标，计算其差值（Delta），并在 Markdown 及 HTML 报告中以高可读性的对比表格直观呈现。

### 变更清单
- **数据源与差异计算**：
  - 在 `src/phase-reports.js` 的 `loadPhaseTimelineData` 内部扩展了历史指标信息的提取，包含 `rulePassRate`、`evidenceCounts` 及 `communityHealth` 数据。
  - 在 `loadPhaseTimelineData` 的返回节点中，对于已运行的阶段通过循环前置节点计算出其与上一个已运行阶段的各项差值（如分数差、提交数差、Stars数差等），存储在 `deltas` 属性中。
- **Markdown 报告增强**：
  - 在 `src/milestone-check.js` 中新增 `formatComparisonSection`，利用简洁明了的 ASCII 字符画表格展示阶段核心指标对比及差异（如分数变化 `-20` 等）。
- **HTML 报告与对比展示**：
  - 在 `src/html-report.js` 中新增 `renderComparison` 方法，渲染出一个响应式的进度对比表格 `.comp-table`，并对增量数值应用色差处理（正增量标记为绿色并带有 `+` 符号，负增量标记为红色，零或无数据则以灰色样式区分）。
  - 对表格各行输出增加严格的 HTML 特殊字符转义防护，防止潜在的 XSS 安全隐患。
- **测试与验证**：
  - 在 `test/phase-reports.test.js` 中新增了 timeline `deltas` 差值计算与指标加载的单元测试。
  - 在 `test/html-report.test.js` 中新增了 `renderComparison` 表格元素渲染及 XSS 防御的单元测试，同时测试了在历史阶段不足 2 个时自动隐藏对比板块的边界逻辑。
  - 运行 `npm test`，全部 164 个测试用例均 100% 通过。

---

## 2026-05-20 CLI Batch Verification Mode & Aggregation Dashboard (方案 A)

### 概要
完成了 CLI 批量验证模式（Batch Mode）与多项目聚合仪表盘（Aggregation Dashboard）的完整开发。支持通过 `--batch <path>` 读取 YAML 配置进行多项目串行校验、容错机制（单个项目失败不中断整体流程）、输出报告相对化以及生成极具现代感与响应式交互的 `index.html` 汇总仪表盘。

### 变更清单
- **仪表盘 HTML 渲染**：
  - 在 `src/html-report.js` 中实现并导出了 `renderBatchDashboardHtml` 函数，生成具备现代暗黑渐变背景、KPI 指标卡片、动态搜索过滤以及错误原因详情展示的 HTML Aggregation Dashboard。
- **CLI 批量执行引擎**：
  - 修改 `src/cli.js`，引入 `--batch <path>` 选项。
  - 实现基于 YAML 的批量配置解析，支持参数的全局继承与覆盖。
  - 采用 `for...of` 串行机制以防 Playwright 浏览器实例并发限制，并包装了 `try...catch` 以在项目失败时将其状态记录为 `failed`，保留其错误信息并不中断整个批量校验。
  - 在所有项目校验完毕后的 `finally` 块中调用 `closeBrowser()` 释放浏览器资源。
  - 生成 `reportsDir/index.html` 仪表盘，且将各子项目的 HTML 和 Markdown 报告路径替换为基于 reports 目录的相对路径，以确保网页中可直接跳转。
- **测试与验证**：
  - 在 `test/html-report.test.js` 中新增对 `renderBatchDashboardHtml` 的 KPI 统计、表格渲染、XSS 转义过滤和 `failed` 状态容错呈现的单元测试。
  - 新增集成测试 `test/batch-mode.test.js`，使用真实 YAML 模拟批量运行，并验证容错退出码 0 以及 `index.html` 仪表盘的生成和内容。
  - 运行 `npm test` 验证，全部 162 个测试用例全数通过。

---

## 2026-05-20 Milestone Phase Dependency Progress (Timeline)

### 概要
实现了多阶段（Phase）里程碑验证结果的时间轴（Timeline）合并与可视化展示。支持按配置顺序排序、历史数据自动去重保留最新、未运行阶段占位等功能，并同时在 Markdown 及 HTML 报告中完成了可视化渲染和单元测试覆盖。

### 变更清单
- **核心数据聚合**：
  - 在 `src/phase-reports.js` 中实现并导出了 `loadPhaseTimelineData`，用于遍历 `reportsDir` 中的历史 json 报告，按配置顺序归纳出完整的里程碑节点，并在运行时注入 `isCurrent` 标记。
  - 修改 `src/milestone-check.js` 以从 `loadPhaseTimelineData` 读取时间轴数据，并将其挂载在顶级 `payload.timeline` 下。
- **Markdown 报告增强**：
  - 修改 `src/milestone-check.js`，在渲染 Markdown 报告时新增 `## Phase Progress Timeline` 表格。
- **HTML 报告与 CSS 特效**：
  - 修改 `src/html-report.js`，新增响应式横向时间轴 UI，支持根据 `status` 着色，为 `current` 状态节点添加呼吸灯动画效果，并对节点 id 和标题进行严格的 XSS 转义防护。
- **测试与验证**：
  - 在 `test/phase-reports.test.js` 新增对 `loadPhaseTimelineData` 内部逻辑（时间轴合并、去重、无 config 排序、当前运行注入）的测试用例。
  - 在 `test/html-report.test.js` 新增对时间轴 HTML 元素渲染、CSS 类应用及 XSS 防护的测试用例。
  - 运行 `npm test` 验证，所有 159 个测试用例全数通过。

---

## 2026-05-20 Code Audit & Fixes

### 概要
完成了对项目核心模块的全面代码审计，并完成了相关严重 Bug 的修复与 AI-First 开发规范的补齐。

### 变更清单
- **编写审计报告**：创建了 `analysis_results.md` 并提交用户。
- **严重 Bug 修复**：
  - 修改 `src/providers/discord-api.js`，将 `memberCount` 和 `onlineCount` 加入返回顶级 `metadata`，修复了 Discord 社区健康度指标数据缺失的问题。
  - 修改 `src/providers/twitter-browser.js`，将 `handle` 加入顶级 `metadata`，修复了 HTML/Markdown 报告中 Twitter 账号名称缺失的问题。
- **AI-First 规范补齐**：
  - 为 `src/cli.js`、`src/config-loader.js`、`src/community-health.js`、`src/snapshot-store.js`、`src/providers/telegram-group.js` 补齐了 `__ai_context__` 模块顶层文档与 `[For Future AI]` 结尾注释块。
- **单元测试验证**：
  - 运行 `npm test`，全部 155 个单元测试项目均成功通过，未发现回归问题。

---

## 2026-05-14 Milestone Phase Definition

### 概要
新增 `.gcc-milestone.yaml` phase schema 與 `--phase` 單期執行模式，保留舊的單一 milestone CLI 行為。

### 決策
- `.gcc-milestone.yaml` 是 phase source of truth。
- `--phase` 為 opt-in；第一版不做 aggregate、timeline、`--all-phases`。
- 合併順序為 CLI > phase > top-level。
- `dependsOn` 只 warning，不阻擋。
- phase mode 永遠輸出 phase-aware JSON 到 `reportsDir`。

## 2026-04-29 前端與產品儀表板待排程補記

### 背景
目前 repo 已有 HTML report 內嵌的 reviewer dashboard，但正式前端與產品級儀表板尚未安排。

### 更新內容
- `TODO.md`
  - 新增 `v0.6.0 — Frontend & Dashboard`
  - 明確標記需要安排、規劃、執行正式前端與 dashboard
  - 補充前端形態可走 Web dashboard 或 Tauri desktop app，後續需比較部署方式、本機檔案/CLI 存取、更新成本與審核員使用情境
  - 補充本機資料儲存約束：若採 SQLite / local DB，Web / Tauri / CLI 必須透過單一資料存取通道，避免多程序各自直接讀寫同一份 DB 檔案
  - 拆成前端產品入口、本機資料儲存與存取通道、產品級儀表板、執行順序四組待辦
- `README.md`
  - 將 formal frontend + product dashboard 放進下一階段 milestone，並標記 Web / Tauri 都是可行方向

---

## 2026-04-29 里程碑資料需求探討與分類矩陣

### 概要
針對「里程碑驗收的種類太多了」的問題，從宏觀角度整理所有的里程碑資料需求，並依照「重要性」、「資料公開性」以及「技術驗證方法」建立分類矩陣。

### 變更清單
- 新增 `milestone_classification.md` 討論文件
  - 將里程碑分為四大類：開發與工程、社區與增長、內容與教育、產品與營運。
  - 分析智能合約部署、外部網址語義驗證、社群指標擷取等潛在需求與可行性。
  - 提出下一步發展選項供審查員討論。

## 2026-04-29 Discord Community Metrics (Discord API)

### 概要
針對「選項 D：Discord 群組數據抓取」，我們實作了**免 Bot Token** 的優雅解法。透過整合 Discord 官方提供的公開 Invite API，系統只需要一個邀請代碼或網址，即可精準解析出伺服器的「總成員數」與「在線人數」。這大幅度降低了社群維護者的設定門檻，同時確保驗證過程能獲得有效的 `SOCIAL_METRIC` 證據。

### 變更清單
- **核心架構更新**
  - 新增 `--discord-invite` CLI 參數。
  - 註冊 `DISCORD_API` 作為全新 Provider Source。
- **Discord Provider 實作 (`discord-api.js`)**
  - 支援自動將完整的邀請網址 (例如 `https://discord.gg/abc`) 正規化為邀請碼 `abc`。
  - 透過向 `https://discord.com/api/v9/invites/{code}?with_counts=true` 發送請求，安全擷取 `approximate_member_count` 與 `approximate_presence_count`。
  - 適當處理無效或過期邀請碼的 404 情境 (Graceful fallback)。
- **測試與文件**
  - 新增 `test/discord-api.test.js` 測試網址解析與各類 API 回傳狀況。
  - 所有 89 個核心測試案例通過。
  - 建立 `walkthrough.md` 展示無痛社群驗證成果。

---

## 2026-04-29 Twitter Vision Integration (Community Metrics)

### 概要
針對「選項 C：社群指標抓取」，我們升級了 `twitter-browser` Provider。有鑑於 Twitter/X 強烈的反爬蟲機制與 DOM 混淆，我們整合了 **Vision AI (預設 gpt-4o-mini)**。系統會自動利用 Playwright 拍下 Twitter 使用者頁面截圖，並將圖片發送給 LLM 解析出精確的粉絲數 (Followers)，藉此大幅提升社群指標抓取的穩定度與準確性。

### 變更清單
- **LLM 視覺模組 (Vision API)**
  - 更新 `src/llm-semantic.js`，新增 `requestLlmVisionExtraction` 函數。
  - 支援讀取圖片檔案，轉換為 Base64，並呼叫 OpenAI `v1/chat/completions` API 的圖片解析能力。
- **Twitter Provider 升級**
  - 變更 `page.goto` 的等待策略（由 `networkidle` 改為 `load` 加固定等待），避免 Twitter 網頁 WebSocket 造成的超時。
  - 擷取截圖後，若存在 `OPENAI_API_KEY`，自動調用 Vision API 提取數字。
  - 具備 Graceful Fallback 機制，若無 Key 或 API 失敗，會退回原先的 DOM 解析模式。
- **測試與文件**
  - 新增 `test/twitter-browser.test.js` 測試 Vision 函數。
  - 更新 `walkthrough.md` 展示社群指標的驗證情境。

---

## 2026-04-29 Article Content Semantic Verification (Article Crawler)

### 概要
針對「選項 B：文章內容語義驗證」，實作了 `article-crawler` Provider。此模組能透過 CLI 接收指定文章網址，並使用 Playwright 自動載入網頁、去除雜訊標籤，提取純文字與截圖，以供 LLM 進行深度語義分析。

### 變更清單
- **核心架構**
  - 新增 CLI 參數 `--article-urls`。
  - `types.js` 擴充 `CONTENT_ARTICLE` 證據類型與 `ARTICLE_CRAWLER` 來源。
- **Provider 實作**
  - 新增 `src/providers/article-crawler.js`。
  - 整合 `browser-runner.js`，動態解析如 Mirror / Notion 等依賴 JS 渲染的頁面。
  - 提取 `document.body.innerText`，去除 `script`, `style`, `nav`, `footer` 等雜訊，並設定 3000 字節流上限，避免超出 LLM Token 限制。
  - 抓取頁面截圖，附加至 HTML 報告的 Visual Evidence 區塊。
- **測試**
  - 新增 `test/article-crawler.test.js` 單元測試。
  - 執行 E2E 測試確認純文字成功提取並可與里程碑規則成功配對。

---

## 2026-04-29 Smart Contract Deployment Validation (Etherscan API)

### 概要
針對「選項 A：智能合約部署驗證」，實作了 `etherscan-api` Provider，允許從 EVM 兼容的區塊鏈瀏覽器中抓取智能合約的開源驗證狀態與部署者資訊。

### 變更清單
- **核心架構**
  - 新增 CLI 參數 `--contract-address` 與 `--etherscan-url` 以支援多鏈環境（預設 Ethereum Mainnet）。
  - `types.js` 新增 `SMART_CONTRACT` evidence type 與 `ETHERSCAN_API` provider source。
- **Provider 實作**
  - 新增 `src/providers/etherscan-api.js`，呼叫 Etherscan API：
    - `getsourcecode` 驗證合約是否已開源並取得名稱、編譯器版本。
    - `getcontractcreation` 取得部署者 (creator) 與部署交易哈希 (txHash)。
  - 若提供 `ETHERSCAN_API_KEY` 環境變數，自動帶入以防止 Rate Limit。
- **測試**
  - 新增 `test/etherscan-api.test.js`，總計 77 個測試項目全數通過。
  - 以 Tether (USDT) 智能合約進行了端對端測試，成功產出報告並正確匹配里程碑關鍵字。

---

## 2026-04-29 Community Growth Monitor Phase 1 & 2 (PoC)

### 概要
實作 `github-discussions` 提供者以收集社區活躍度指標，並建立 Browser Automation 基礎設施的概念驗證 (PoC)，用以應對需要截圖或反爬蟲較嚴格的平台（如 Twitter/X）。

### 變更清單
- **Phase 1: GitHub Discussions Provider**
  - 新增 `src/providers/github-discussions.js` (透過 GraphQL API 抓取討論數、回答率、參與者)。
  - `types.js` 擴充 `DISCUSSION` evidence type。
  - `gcc-allocation.yaml` 新增 GCC-A10 規則 (活躍社區討論)。
  - 新增單元測試 `test/github-discussions.test.js`。

- **Phase 2: Browser Automation PoC (Playwright)**
  - 引入 `playwright` 依賴。
  - 新增 `src/providers/browser-runner.js` 提供 Headless Browser 管理與截圖功能。
  - 新增 `src/providers/twitter-browser.js` 作為試點，擷取 Twitter follower 數並存檔截圖。
  - `html-report.js` 支援渲染 provider 的截圖附件 (Visual Evidence)。
  - CLI 新增 `--twitter-handle` 參數。

### 驗證
- `npm test`：73 passed, 0 failed

---

## 2026-03-19 npm Publish Readiness

### 概要
完成 npm 發布前置整理（package metadata、files 白名單、pack/publish scripts），並通過 dry-run 打包驗證。

### 變更清單
- `package.json`
  - 新增 `description`、`license`、`engines`、`files`
  - 新增 `pack:check` 與 `publish:public` scripts
  - 移除 `private: true` 以允許發布流程
- `README.md`
  - 補充 `pack:check` 與 npm publish 指引
- 驗證指令
  - `NPM_CONFIG_CACHE=/tmp/gcc-milestone-agent-npm-cache npm run pack:check` 成功

### 狀態
- 已完成「可發布打包準備」
- 尚未執行正式 `npm publish`（需 npm 帳號授權與最終包名可用性確認）

---

## 2026-03-19 JSDoc Typing Enhancement

### 概要
完成工程改善路線中的 JSDoc 類型完善，為語義評估與 LLM 模組補齊結構化類型註解。

### 變更清單
- `src/semantic-evaluator.js`
  - 新增 `RuleLike`、`SemanticHit`、`SemanticVerdict` typedef
  - 為核心函數補齊 `@param/@returns` 註解
- `src/llm-semantic.js`
  - 新增 `LlmSemanticRequest`、`LlmSemanticVerdict`、`LlmEvaluationResult` typedef
  - 為 LLM 調用/覆寫流程函數補齊型別註解
- `src/milestone-check.js`
  - 新增 `SemanticMode` typedef 與 `normalizeSemanticMode` 型別標注
- `README.md`, `TODO.md`
  - 同步標記 JSDoc 類型完善已完成

### 驗證
- `npm test`：64 passed, 0 failed

---

## 2026-03-19 Optional LLM Semantic Mode

### 概要
新增可選 LLM 語義判定模式（`--semantic-mode llm`），在可用時覆寫 heuristic semantic verdict，失敗時自動 fallback。

### 變更清單
- `src/llm-semantic.js`
  - 新增 OpenAI Responses API 調用封裝
  - 新增 `requestLlmSemanticVerdict`、`applyLlmSemanticEvaluation`
  - 支援缺少 API key/解析失敗時警告並回退 heuristic
- `src/milestone-check.js`
  - 新增 `normalizeSemanticMode`
  - `runMilestoneCheck` 支援 `semanticMode/llmModel`
  - 報告新增 `Semantic Mode` 與 `Semantic Warnings`
- `src/cli.js`
  - 新增 `--semantic-mode` 與 `--llm-model` CLI 參數
- `test/llm-semantic.test.js`
  - 新增 LLM 模組單測（解析/回退/覆寫）
- `test/milestone-check.test.js`
  - 新增 semantic-mode 正規化測試
- `README.md`, `TODO.md`
  - 同步標記 LLM-based semantic（optional）已完成

### 驗證
- `npm test`：64 passed, 0 failed

---

## 2026-03-19 Semantic Reasoning v2

### 概要
將語義評估從純 keyword 覆蓋升級為 v2 heuristic：加入 evidence snippet 語義覆蓋率與來源多樣性信號，並更新報告展示。

### 變更清單
- `src/semantic-evaluator.js`
  - 新增 token-based `textCoverage` 與 `semanticCoverage`
  - 置信度新增 `sourceDiversity` 加權信號
  - 單條高語義覆蓋證據可判定為 `met`
  - 回傳欄位新增 `semanticCoverage`、`sourceDiversity`
- `test/semantic-evaluator.test.js`
  - 新增 snippet 語義覆蓋測試
  - 新增來源多樣性影響置信度測試
  - 調整舊測試斷言到 v2 文案
- `src/milestone-check.js`
  - Markdown 規則輸出補充 semanticCoverage/keywordCoverage/sourceDiversity
- `src/html-report.js`
  - 規則卡片補充 semanticCoverage/keywordCoverage/sourceDiversity 顯示
- `README.md`, `TODO.md`
  - 同步標記 Semantic reasoning v2 已完成

### 驗證
- `npm test`：58 passed, 0 failed

---

## 2026-03-19 Reviewer Dashboard View

### 概要
HTML 報告新增 Reviewer Dashboard 區塊，提供分數 KPI 與規則結論分布的可視化摘要。

### 變更清單
- `src/html-report.js`
  - 新增 `renderDashboard`、`meterRow` 等 dashboard 渲染輔助函數
  - 新增 `Reviewer Dashboard` 區塊（`id="dashboardSection"`）
  - 顯示 Overall/Activity/Rule Pass/Provider Bonus 利用率與規則 verdict 分布
- `test/html-report.test.js`
  - 新增 dashboard 區塊存在性測試
- `README.md`, `TODO.md`
  - 同步標記 dashboard 功能完成

### 驗證
- `npm test`：56 passed, 0 failed

---

## 2026-03-19 Interactive HTML Filters

### 概要
在 HTML 報告中新增可交互篩選器，支援按規則語義結論與來源過濾 Rule cards。

### 變更清單
- `src/html-report.js`
  - 新增 `ruleVerdictFilter`、`ruleSourceFilter`
  - 新增 `applyRuleFilters()` 前端腳本
  - 規則卡片新增 `data-semantic` 與 `data-source` 標記
- `test/html-report.test.js`
  - 新增 interactive filter controls 測試
- `README.md`, `TODO.md`
  - 同步標記 Interactive HTML filters 已完成

### 驗證
- `npm test`：55 passed, 0 failed

---

## 2026-03-19 Rule Explainability Snippets

### 概要
完成每條規則的可解釋性片段輸出，支援在 Markdown/HTML/JSON 報告中引用命中證據的原文片段。

### 變更清單
- `src/rule-engine.js`
  - 新增 `buildExplainabilitySnippet`
  - `matchRule` 增加 `result.explainability[]`（`source/url/matchedKeywords/snippet`）
- `src/milestone-check.js`
  - Markdown `Rule Evaluation` 新增 explainability 區塊
- `src/html-report.js`
  - 每條規則卡片新增 Explainability 片段展示
- `test/rule-engine.test.js`
  - 新增 explainability 單測
- `README.md`, `TODO.md`
  - 同步已完成項與里程碑列表

### 驗證
- `npm test`：54 passed, 0 failed

---

## 2026-03-19 GitHub API 分頁 + Provider Bonus 評分

### 概要
完成兩個 roadmap 項目：GitHub API 分頁抓取（追蹤 `Link` header）與多資料源 bonus 評分整合。

### 變更清單
- `src/providers/types.js`
  - 新增 `githubFetchWithHeaders`，可同時取得 JSON 與 response headers
- `src/providers/github-api.js`
  - 新增 `extractNextLink`、`fetchPaginatedArray`
  - commits/pulls/issues/releases 改為分頁抓取（最多 `MAX_PAGES = 10`）
  - 匯出 `_internal` 供分頁邏輯單測
- `src/milestone-check.js`
  - 新增 `calculateProviderBonus`
  - `scoreEvidence` 新增 `providerBonus`，輸出 `baseScore`、`providerBonus`
  - Markdown/JSON 報告加入 bonus 與分項明細
- `test/github-api-pagination.test.js`
  - 新增 Link header 解析與分頁迭代單測（4 cases）
- `test/milestone-check.test.js`
  - 新增 provider bonus 計算與總分封頂測試
- `README.md`, `TODO.md`
  - 同步已完成項與下一步里程碑

### 驗證
- `npm test`：53 passed, 0 failed

---

## 2026-03-19 Source Filter + 版本文檔對齊

### 概要
完成 `rules[].source` 規則來源過濾，並對齊版本號與 roadmap 文檔狀態。

### 變更清單
- `src/rule-engine.js`
  - 支援外部規則 `source` 欄位標準化與保留
  - 規則匹配時，若有 `source` 僅匹配對應 provider 證據
- `src/milestone-check.js`
  - Markdown 報告的 Rule Evaluation 加入 `[source: ...]` 標記
- `test/rule-engine.test.js`
  - 新增 `source` 欄位保留測試
  - 新增來源過濾命中/不命中測試
- `test/html-report.test.js`
  - 修正 XSS 斷言，檢查是否輸出原始 `<img>` 標籤
- `package.json`, `package-lock.json`
  - 版本由 `0.2.0` 升級至 `0.3.0`
- `TODO.md`, `README.md`
  - 同步更新已完成項與下一步里程碑

### 驗證
- `npm test`：46 passed, 0 failed

---

## 2026-03-15 代碼審查與全面修正

### 審查概要
對整個項目進行了全面代碼審查，發現 2 個嚴重問題、6 個重要問題、6 個改進建議，並全部修正完畢。

### 修正清單

#### 嚴重問題修正
1. **`resolveProfileRulesFile` 路徑解析** — 改用 `import.meta.url` + `fileURLToPath` 解析內建 profile 路徑
2. **API 回傳 shape 驗證** — 添加 `assert(Array.isArray(...))` 防禦性斷言

#### AI-First 文檔標準
3. 所有 5 個源碼文件添加 `__ai_context__` 模組頂層文檔
4. 所有 5 個源碼文件添加 `[For Future AI]` 結尾註釋塊

#### 程式碼改進
5. 提取評分魔術數字為命名常數（`WEIGHT_*`, `THRESHOLD_*`）
6. 統一 keyword 最小長度為 `MIN_KEYWORD_LENGTH = 2`
7. `githubFetch` sleep 計算加括號增強可讀性
8. `.gitignore` 加入 `report.md`
9. `semantic-evaluator.js` 閾值和置信度公式常數化
10. `html-report.js` 顏色閾值常數化 + `|| []` 防護

#### 測試補充
11. 新增 `test/html-report.test.js`（10 個測試）
12. 擴充 `test/semantic-evaluator.test.js`（8 個測試）

#### 報告改進
13. Markdown 報告增加 Data Truncation Warnings

---

## 2026-03-15 多形態資料源驗證 (v0.3.0)

### 概要
實作 Provider 架構，支援多形態資料源的證據收集和驗證。

### Phase 1：Provider 基礎架構
- 新增 `src/providers/types.js` — 類型定義（EvidenceItem, CollectContext, ProviderResult）、共用工具（fetchWithRetry, githubFetch, makeTimeFilter）
- 新增 `src/providers/github-api.js` — 從 `milestone-check.js` 的 `collectEvidence` 重構而來
- 新增 `src/providers/index.js` — Provider Registry，支援並行收集和 graceful degradation
- 重構 `src/milestone-check.js` — 移除內聯 collect 邏輯，改用 `collectFromProviders`
- CLI 新增 `--providers` 選項

### Phase 2：新增 4 個 Providers
- `src/providers/github-actions.js` — CI/CD workflow runs 狀態和成功率
- `src/providers/github-community.js` — Stars, forks, contributors 社群指標
- `src/providers/npm-registry.js` — npm 套件發布驗證（讀取 package.json → 查詢 npm registry）
- `src/providers/url-checker.js` — README 中外部 URL 可達性檢查（HEAD 請求 + AbortController 超時）

### Phase 3：整合
- 將 4 個新 provider 註冊到 registry
- 擴展 `gcc-allocation.yaml` 加入 GCC-A6~A9 四條新規則
- 報告支援 provider errors 顯示

### Phase 4：文檔與測試
- 新增 `test/providers.test.js`（14 個測試）
- 更新 README（新增 providers 文檔和使用範例）
- 更新 TODO.md（標記 v0.3.0 完成）

### 新增/修改文件一覽
| 文件 | 操作 |
|------|------|
| `src/providers/types.js` | **新增** |
| `src/providers/github-api.js` | **新增** |
| `src/providers/github-actions.js` | **新增** |
| `src/providers/github-community.js` | **新增** |
| `src/providers/npm-registry.js` | **新增** |
| `src/providers/url-checker.js` | **新增** |
| `src/providers/index.js` | **新增** |
| `src/milestone-check.js` | 重構使用 provider 系統 |
| `src/cli.js` | 新增 `--providers` 選項 |
| `profiles/gcc-allocation.yaml` | 新增 4 條規則 |
| `test/providers.test.js` | **新增** |
| `test/milestone-check.test.js` | 更新 |
| `README.md` | 更新 |
| `TODO.md` | 更新 |

---

## 2026-05-21 规则集管理编辑、导入导出与自定义管理 (方案一)

### 概要
完成了规则集 (Rules Profile) 在线可视化编辑、导入导出与自定义管理功能开发。打通了 Tauri 后端 Rust 保存与校验映射、Zustand 全局状态、以及 NewVerification/Dashboard 等前端页面的全面对接。

### 變更清單
- `frontend/src-tauri/src/lib.rs` (修改)
  - 定义了 `ProfileRule` 和 `ProfileSummary` 结构体，支持 Rust / TS 的序列化传递。
  - 实现了 `list_profiles`、`save_profile`（防目录穿越安全限制）、`delete_profile`。
  - 实现了 `rules_to_yaml` 与 `yaml_to_rules` 命令，使前端免依赖解析 YAML。
  - 在 `main` 的 `generate_handler!` 注册以上 5 个新命令。
- `frontend/src/lib/types.ts` (修改)
  - 声明了 `ProfileRule` 和 `ProfileSummary` 接口。
  - 在 `VerificationRequest` 结构中加入 `rules_file` 可选参数。
- `frontend/src/lib/api.ts` (修改)
  - 封装并暴露了 5 个 Tauri IPC 请求函数（`listProfiles`, `saveProfile`, `deleteProfile`, `rulesToYaml`, `yamlToRules`）。
- `frontend/src/lib/store.ts` (修改)
  - Zustand 接入 `profiles` 状态及 `loadProfiles`、`saveProfile`、`deleteProfile` 三个异步操作。
  - 改造项目流水线运行逻辑 `runProjectPipeline`：如果是自定义 Profile 规则，则自动解析出物理绝对路径作为 `rules_file` 参数传给 CLI 运行。
- `frontend/src/pages/Profiles.tsx` (新增)
  - 实现全新的规则集可视化管理后台：支持左侧列表、规则 CRUD、触发词 Badge 管理、数据源下拉选择。
  - 实现了 YAML 源码实时导入导出、一键拷贝及应用到编辑区的 Modal 弹窗。
- `frontend/src/pages/NewVerification.tsx` (修改)
  - 改造手工校验界面，将规则集输入文本框改为 `<select>` 选择器，支持下拉选择内置或自定义规则集，并自动映射物理路径。
- `frontend/src/pages/Dashboard.tsx` (修改)
  - 仪表盘新增 profiles 的加载和全局获取。
  - 改造创建项目时的多阶段配置面板，将阶段的规则 profile 文本输入框改为下拉选择框。
  - 改造单阶段“审计”触发逻辑 `handleQuickCheck`，自定义规则自动匹配对应的绝对路径并传给 `rules_file` 字段。
- `frontend/src/components/Layout.tsx` (修改)
  - 在侧边栏导航列表中挂载 Rules Profile 页面入口。
- `frontend/src/App.tsx` (修改)
  - 将 `/profiles` 路由映射到 `ProfilesPage` 组件。

### 驗證
- 前端打包编译：`npm run build` (tsc & vite build) 顺利通过，未引入任何外部第三方 YAML 解析包。
- 后端编译：`cargo check` 通过。
- 单元测试：`npm test` 164 passed, 0 failed.
