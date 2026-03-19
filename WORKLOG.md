# WORKLOG - gcc-milestone-agent

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
