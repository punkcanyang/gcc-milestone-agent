# TODO - gcc-milestone-agent

> 最後更新：2026-04-29

---

## v0.4.0 — Community Growth Monitor 🔍

### 社區健康度自動化檢查（Browser-based）
- [ ] 設計 Community Health Check 架構（CLI 子命令 or 獨立模組）
- [ ] Discord / Telegram 社群活躍度快照（成員數、訊息頻率）
- [ ] Twitter/X 帳號指標抓取（follower、engagement rate）
- [ ] 論壇/Discourse 活躍度檢查（主題數、回覆數、活躍用戶）
- [ ] 整合到報告：Community Growth 章節（圖表 + 趨勢對比）

### 擴展 Provider — 社區增長數據源
- [ ] 新增 `discord-community` provider（透過 Discord API 或瀏覽器自動化）
- [x] 新增 `twitter-social` provider（追蹤項目 Twitter 帳號指標）
- [ ] 新增 `forum-activity` provider（Discourse / GitHub Discussions 活躍度）
- [ ] 社區指標歷史快照存儲（JSON / SQLite，支持趨勢對比）

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

## 工程改善 🔧

- [ ] 發布為 npm package
- [ ] E2E 測試（完整 CLI 流程 → 報告驗證）
- [ ] 配置檔 `.gcc-milestone.yaml` 支持（項目根目錄配置預設參數）
- [ ] 日誌分級（verbose / quiet 模式）
- [ ] GitHub App 整合（作為 PR check 自動運行）

---

> 已完成項目歸檔於 [DONE.md](./DONE.md)
