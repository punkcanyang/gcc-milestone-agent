# TODO - gcc-milestone-agent

> 最後更新：2026-05-21

---

## 待办与未来规划 🔮

### 桌面端 UI 深度增强
- [ ] 支持在客户端界面直接编辑和自定义外部 rules Profile YAML 规则集
- [ ] 导出 PDF 格式的里程碑报告，便于离线查阅与共享
- [ ] 增加项目导入/导出功能，支持将特定项目及其历史校验数据以独立包形式迁出/迁入

### 规则引擎与语义判断增强
- [ ] 支持对接外部本地大模型 (Llama/Ollama) 进行离线语义评估
- [ ] 引入对多语言 (如中英文混合) 交付物的高精度提取与匹配分析
- [ ] 支持更多的区块链浏览器 Provider (例如 BscScan, PolygonScan, Solscan)

### 批量与 CI/CD 自动化集成
- [ ] 封装为 GitHub Action，支持在 PR 或 Release 触发时自动运行并评论报告
- [ ] 提供 webhook 触发选项，支持与第三方资助管理平台 (如 Gitcoin, DoraHacks) 联动

### 工程改善 🔧
- [ ] 发布为公共 npm 软件包 (npm package)
- [ ] 编写全面的 E2E 测试（覆盖完整 CLI 流程 -> 本地报告校验验证）
- [ ] 日志分级控制（引入 `--verbose` / `--quiet` 模式）

---

> 已完成項目歸檔於 [DONE.md](./DONE.md)
