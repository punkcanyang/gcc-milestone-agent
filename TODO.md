# TODO - gcc-milestone-agent

> 最後更新：2026-07-13

---

## 全程式碼審閱待辦（2026-07-13）

> 審閱基線：CLI `npm test` 166/166 通過，line coverage 84.30%；前端 build 與 `cargo check` 通過；`cargo test` 為 0 tests；Clippy 有 5 個錯誤；依賴稽核發現 CLI 1 個 moderate、前端 1 high／3 moderate／1 low 漏洞。

### P0 — 發布阻擋與結果可信度

- [ ] **[P0-01] 讓正式版 Tauri 桌面程式能在乾淨環境執行 CLI 與 PDF 匯出**
  - 問題：`verifier.rs` 依賴 resource directory 內的 `src/cli.js`，但 `tauri.conf.json` 沒有打包 CLI、profiles、Node runtime、npm dependencies 或 Playwright Chromium。
  - 處理：將驗證引擎製作為 Tauri sidecar，明確封裝 profiles 與必要 browser assets，不依賴使用者預先安裝 Node/npm。
  - 驗證：在未安裝 Node、npm、Playwright 的乾淨 macOS／Windows 環境完成驗證、HTML 與 PDF 輸出。

- [ ] **[P0-02] 修正內建 profile 與預設 providers 不相容**
  - 問題：`gcc-allocation` 的 GCC-A6～A10 指定 `github-actions`、`github-community`、`npm-registry`、`url-checker`、`github-discussions`，但桌面端與 CLI 預設只執行 `github-api`。
  - 處理：由 profile 自動推導必要 providers；若必要來源不可用，執行前明確阻止並列出缺少項目，不把「沒有收集」判成「規則失敗」。
  - 驗證：新增 profile/provider contract tests；預設執行必須涵蓋所有指定來源，或回傳可操作的錯誤。

- [ ] **[P0-03] 防止規則通過率 0% 仍被判定為 `met`**
  - 問題：目前 activity 最高 60 分，加上 provider bonus 最高 20 分，rule pass rate 為 0% 時仍可能得到 80 分。
  - 處理：`met` 同時要求總分與最低 rule pass rate；profile schema 增加 `required`、`weight` 與否決條件。
  - 驗證：新增「0% 規則通過率永遠不能 `met`」及 required rule failure 測試。

- [ ] **[P0-04] 將 SQLite 還原改為驗證後的原子操作**
  - 問題：現況先覆蓋正式 DB 再驗證，損壞備份可能破壞原資料，失敗時連線可能停在空白記憶體 DB。
  - 處理：先以唯讀連線執行 `integrity_check`、schema/version 驗證，再複製至暫存檔並原子替換；任何失敗都保持原 DB 不變。
  - 驗證：以損壞檔、錯誤 schema、無權限路徑測試，確認原 DB hash 與資料均未改變。

### P1 — 高優先缺陷與安全風險

- [ ] **[P1-01] 接通 Settings 與實際驗證流程**
  - `reports_dir` 必須真正控制報告位置；`github_token` 必須安全傳給 CLI 子程序；實作或移除未使用的 `output_dir`。
  - Store action 不得吞掉儲存錯誤，UI 只能在後端成功後顯示成功訊息。

- [ ] **[P1-02] 修正 Community Health 寫入 SQLite 的欄位路徑**
  - 現況讀取 `communityHealth.stars/forks/contributors`，實際資料位於 `communityHealth.github.*`。
  - 建立共享 report schema，新增 JSON → Rust → SQLite 整合測試。

- [ ] **[P1-03] 限制 Tauri 報告讀取與 PDF 匯出的檔案範圍**
  - IPC 僅接受 report ID，由 Rust 在 reports directory 內解析並 canonicalize；驗證 `report_id` slug，拒絕目錄穿越與任意本機讀檔。
  - 啟用 CSP，縮小 Tauri capabilities 與 shell 權限。

- [ ] **[P1-04] 防止 URL Checker 與 Article Crawler 造成 SSRF**
  - DNS 解析後拒絕 loopback、private、link-local、localhost 與雲端 metadata 位址；每次 redirect 都重新驗證。
  - 支援明確 allowlist；失敗的 crawl 不得作為正面 EvidenceItem 參與規則匹配。

- [ ] **[P1-05] 移除 Pipeline 對無效 DAG 的退回執行**
  - 無效 `depends_on` JSON、未知節點或循環依賴必須直接停止並回報具體節點，不得改用資料庫順序繼續執行。
  - 將 DAG 驗證放進 Rust 建立／更新專案流程，前端只負責顯示錯誤。

- [ ] **[P1-06] 修正 Playwright browser 競態、context 洩漏與附件路徑**
  - 使用 singleton launch promise，避免並行建立多個 Chromium；每次任務必須關閉 context；加入並行上限。
  - 截圖輸出位置應跟隨實際 report directory，HTML/PDF 中的相對路徑必須可用。

- [ ] **[P1-07] 為所有網路與子程序工作加入 timeout、取消與資源上限**
  - 共用 `AbortSignal`、provider deadline、CLI 全域 timeout；桌面端提供取消命令並終止 Node/Chromium 子程序樹。
  - stdout/stderr 與前端 logs 改為有上限的 ring buffer，避免長時間執行持續增加記憶體。

- [ ] **[P1-08] 避免報告檔名碰撞與部分寫入**
  - 檔名加入毫秒與 UUID，採 exclusive-create；Markdown、JSON、HTML 先寫暫存檔再原子 rename。
  - 成功狀態回傳前確認三種輸出檔案均存在且可解析。

- [ ] **[P1-09] 將 GitHub Token 移出明文 `config.json`**
  - 使用 macOS Keychain、Windows Credential Manager、Linux Secret Service；設定檔只保留 secret reference。

- [ ] **[P1-10] 區分「未達標」與「無法判定」**
  - 所有必要 provider 失敗或 evidence coverage 不足時回傳 `indeterminate`，不得直接當成 `not_met`。
  - 報告加入 evidence coverage、缺少來源與 provider failure 摘要。

### P2 — 工程品質與效能

- [ ] **[P2-01] 建立明確的退回政策**
  - 預設採 strict policy；內建 profile 解析失敗、LLM 失敗、缺少 `generatedAt` 等情況不得靜默改用硬編碼規則、heuristic 或 mtime。
  - 只有使用者明確指定 `--fallback-policy` 時才能採替代判定，並在報告標記原因與影響。

- [ ] **[P2-02] 建立 SQLite schema version 與 migration**
  - 不再只依賴 `CREATE TABLE IF NOT EXISTS`；加入 migration 測試與舊版資料升級測試，作為專案匯入／匯出的前置條件。

- [ ] **[P2-03] 補齊 Rust、React 與跨層測試**
  - Rust 目前 0 tests；新增 DB、profile、report path、restore、IPC contract tests。
  - 優先提高 `article-crawler`、`browser-runner`、Etherscan、GitHub providers 與桌面 pipeline 的覆蓋率。

- [ ] **[P2-04] 擴充 CI 品質閘門**
  - CI 加入前端 build、`cargo test`、`cargo clippy --all-targets -- -D warnings`、npm audit、pack check 與乾淨安裝 smoke test。
  - 修正目前 Clippy 的 5 個 lint 錯誤。

- [ ] **[P2-05] 修正依賴漏洞並建立更新節奏**
  - CLI：升級 `js-yaml`，修正 1 個 moderate 漏洞。
  - 前端：處理 Vite、React Router、esbuild、Babel 共 1 high／3 moderate／1 low；Vite major upgrade 需先跑完整 build/E2E。

- [ ] **[P2-06] 拆分前端 bundle 與大型頁面**
  - 目前主 chunk 約 688.83 kB；對 Dashboard、Profiles、ReportViewer、Recharts 使用 route lazy loading／manual chunks。
  - 驗證首次載入 bundle、啟動時間與頁面切換行為。

- [ ] **[P2-07] 統一版本與文件狀態**
  - 對齊 root package 0.4.0、DONE v0.6.1、frontend/Tauri 0.1.0 與 README 的過期 roadmap。
  - 建立單一版本來源與 release checklist；移除或實作 `config_yaml`、`error_message` 等未完成欄位。

## 建議執行順序

1. **判定可信度與資料安全**：P0-02、P0-03、P0-04、P1-02～P1-05。
2. **桌面正式版可執行性**：P0-01、P1-01、P1-06～P1-09。
3. **工程品質與發布準備**：P1-10、全部 P2。
4. **通過上述驗證後，再開始新功能與正式發布。**

---

## 待辦與未來規劃 🔮

### 桌面端 UI 深度增强
- [x] 支持在客户端界面直接编辑和自定义外部 rules Profile YAML 规则集
- [x] 导出 PDF 格式的里程碑报告，便于离线查阅与共享
- [ ] **專案匯入／匯出（可行性：高）**
  - 前置：完成 P2-02 schema migration。
  - 方案：封裝格式包含 `schemaVersion`、checksum、project/phases/runs 與 reports manifest；匯入時驗證並重映射 ID。

### 规则引擎与语义判断增强
- [x] 修正 `keywordMatched` / `passed` 语义分离，并确保 semantic verdict 覆写后重算 `passRate` 与总分
- [ ] **Ollama／本機模型離線語義評估（可行性：高）**
  - 抽象 `SemanticEvaluator` adapter，支援 OpenAI-compatible endpoint、健康檢查、strict JSON 與模型資訊留存。
- [ ] **中英文混合與多語交付物分析（可行性：中高）**
  - 建立真實標註 benchmark，加入語言偵測、CJK tokenization、多語 embedding 與回歸評估。
- [ ] **更多區塊鏈瀏覽器 Provider（可行性：EVM 高、Solana 中）**
  - 先將 Etherscan 抽成 EVM explorer adapter，再加入 BscScan／PolygonScan；Solscan 使用獨立資料模型與 API adapter。

### 批量与 CI/CD 自动化集成
- [ ] **封裝 GitHub Action（可行性：高）**
  - 前置：完成 P0-02、P0-03 與 P1-10；輸出 artifact、PR comment 與 machine-readable conclusion，限制 token 權限。
- [ ] **Webhook／第三方資助平台整合（可行性：中）**
  - 採獨立服務設計，加入認證、queue、重試、idempotency 與審計紀錄，不直接塞進桌面端程序。

### 工程改善 🔧
- [ ] **發布公共 npm package（可行性：高）**
  - 前置：修正依賴漏洞、統一版本與文件、決定 Playwright 安裝策略；`npm pack --dry-run` 已通過（34 files／67.5 kB）。
- [ ] **完整 E2E 測試（可行性：高且為發布必要條件）**
  - CLI 使用 fixture HTTP server；Tauri 使用測試 DB、mock IPC、sidecar 與安裝包 smoke test。
- [ ] 日志分级控制（引入 `--verbose` / `--quiet` 模式）

---

> 已完成項目歸檔於 [DONE.md](./DONE.md)
