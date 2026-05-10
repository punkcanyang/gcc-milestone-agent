# TODO - gcc-milestone-agent

> 最後更新：2026-05-10

---

## v0.4.0 — Community Growth Monitor 🔍

### 社區健康度自動化檢查（Browser-based）
- [x] 設計 Community Health Check 架構（community-health.js 模組）
- [x] Discord / Telegram 社群活躍度快照（成員數、訊息頻率）
- [x] Twitter/X 帳號指標抓取（follower、engagement rate）
- [x] 論壇/Discourse 活躍度檢查（github-discussions provider）
- [x] 整合到報告：Community Growth 章節（Markdown + HTML，含趨勢對比）

### 擴展 Provider — 社區增長數據源
- [x] 新增 `discord-community` provider（discord-api provider）
- [x] 新增 `twitter-social` provider（追蹤項目 Twitter 帳號指標）
- [x] 新增 `forum-activity` provider（github-discussions provider）
- [x] 社區指標歷史快照存儲（JSON，支持趨勢對比）

### 瀏覽器自動化基礎設施
- [x] 引入 Playwright / Puppeteer 作為 browser automation 依賴
- [x] 設計 browser-task runner（可配置的瀏覽器檢查任務）
- [x] 反偵測策略（user-agent、頭部隨機化、速率限制）
- [x] 截圖證據存檔（作為驗收報告的可視化附件）

---

## v0.5.0 — Grant Lifecycle 📋

### 多期驗收支持
- [ ] 支援 milestone 分期定義（M1 → M2 → M3）
- [ ] 跨期進度對比報告
- [ ] 時間軸視圖（Timeline visualization in HTML report）

### 多項目批量驗收
- [ ] 批量模式 CLI（從 YAML/JSON 批量讀取多個 repo+milestone 配置）
- [ ] 聚合儀表板（所有被審核項目的概覽報告）

---

## v0.6.0 — Frontend & Dashboard 🧭

> 2026-04-29 補記：正式前端與產品級儀表板尚未安排，需要排進規劃並執行。這裡的 scope 不等同於 v0.3.0 已完成的 HTML report 內嵌 reviewer dashboard。

### 前端產品入口
- [ ] 決定前端形態（Web dashboard、Tauri desktop app，或兩者分階段）
- [ ] 比較 Web 與 Tauri 的取捨：部署方式、本機檔案/CLI 存取、更新成本、審核員使用情境
- [ ] 規劃核心使用流程：建立驗收任務、匯入 repo/milestone、選擇 profile、啟動檢查、查看報告
- [ ] 設計任務列表與單一驗收詳情頁
- [ ] 定義 CLI / Node API 與前端之間的資料契約（run config、execution state、report result）
- [ ] 建立第一版可操作的前端骨架

### 本機資料儲存與存取通道
- [ ] 評估是否使用本機資料庫（例如 SQLite）保存任務、執行紀錄、歷史報告與 dashboard 快照
- [ ] 若使用 SQLite / local DB，必須設計單一資料存取通道（例如 local service、Tauri command/IPC、或受控 Node API）
- [ ] 避免 Web / Tauri / CLI 多個程序各自直接讀寫同一份 DB 檔案
- [ ] 定義資料存取通道的鎖定、序列化、交易邊界與錯誤回報規則
- [ ] 補多程序存取測試，驗證同時啟動前端與 CLI 時不會產生 DB lock 或讀取不一致

### 產品級儀表板
- [ ] 規劃 dashboard 資訊架構：項目總覽、milestone 狀態、風險項、通過率、待人工複核項
- [ ] 支援跨項目 / 跨期篩選與排序
- [ ] 支援歷史報告讀取與趨勢比較
- [ ] 加入證據 drill-down：從 dashboard 指標回到原始 evidence / rule match
- [ ] 補 dashboard 測試與 demo fixture

### 執行順序
- [ ] Phase 1：盤點現有 report JSON shape，整理可直接供 UI 使用的資料模型與本機儲存策略
- [ ] Phase 2：完成 wireframe / route map / component map
- [ ] Phase 3：實作前端 MVP，先接本機 sample report
- [ ] Phase 4：接上真實 CLI 執行流程與多項目 dashboard
- [ ] Phase 5：補文件、測試與範例操作流程

---

## 工程改善 🔧

- [ ] 發布為 npm package
- [ ] E2E 測試（完整 CLI 流程 → 報告驗證）
- [x] 配置檔 `.gcc-milestone.yaml` 支持（項目根目錄配置預設參數）
- [ ] 日誌分級（verbose / quiet 模式）
- [ ] GitHub App 整合（作為 PR check 自動運行）

---

> 已完成項目歸檔於 [DONE.md](./DONE.md)
