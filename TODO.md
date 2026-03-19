# TODO - gcc-milestone-agent

> 最後更新：2026-03-19

## 已完成 ✅

### v0.2.0 — MVP+ CLI
- [x] CLI scaffolding (commander)
- [x] GitHub REST collector (commits/PR/issues/releases)
- [x] Rule engine v1 (milestone 文本解析 + YAML 外部規則)
- [x] Markdown + JSON + HTML 三種報告輸出
- [x] Retry handling (5xx/429 + retry-after)
- [x] Unit tests (Node test runner)
- [x] Profile 機制 (gcc-allocation)
- [x] Semantic evaluator (keyword coverage heuristic)
- [x] 代碼審查修正 (AI-First 文檔、防禦性斷言、常數化、測試補充)

### v0.3.0 — Multi-Source Evidence Providers
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

---

## 未來規劃 📋

### Semantic Reasoning v2

### Dashboard

### 工程改善
- [ ] 發布為 npm package
