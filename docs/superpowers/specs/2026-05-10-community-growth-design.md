# Community Growth Monitor — 设计文档

> 2026-05-10

## 目标

把已有 provider 的社区数据聚合成统一的 Community Health 视图，加历史快照做趋势对比，新建 Telegram provider 扩展数据源。

## 现有数据源（已实现）

| Provider | 字段 | 来源 |
|---|---|---|
| `github-community` | stars, forks, contributors, watchers | REST API |
| `github-discussions` | totalDiscussions, answeredRate, participants | GraphQL |
| `discord-api` | memberCount, onlineCount | 公开 Invite API |
| `twitter-browser` | followerCount | Playwright + Vision AI |

## 新增数据源

### Telegram Provider (`telegram-group.js`)

- CLI: `--telegram-group <username_or_url>`
- 支持输入 `mygroup`、`t.me/mygroup`、`https://t.me/mygroup`
- 方法: HTTP GET `https://t.me/{username}`，解析 HTML 中的 member count
- 回退: 若 HTTP 解析失败，用 Playwright 抓取
- 输出: `SOCIAL_METRIC` evidence item，metadata 含 `memberCount`
- 不支持私有群组（无邀请码可用的公开 API），静默跳过

## 新增模块

### `src/community-health.js`

纯函数模块，从 `providerMeta` 中提取社区数据，输出结构化的 CommunityHealth 对象：

```js
{
  github: { stars, forks, contributors, watchers },
  discord: { serverName, memberCount, onlineCount },
  twitter: { handle, followerCount },
  telegram: { group, memberCount },
  discussions: { totalCount, answeredRate, topParticipants }
}
```

### 快照存储 (`src/snapshot-store.js`)

- 存储目录: `.gcc-milestone/snapshots/{repo}.json`
- 每次运行自动写入一份快照（带 timestamp）
- 快照内容: CommunityHealth + score + status + 基本 counts
- `loadPreviousSnapshot(repo)` 读取最近一份做趋势对比
- JSON 格式，人可读、可 git diff
- 若目录不存在自动创建

## 报告改动

### Markdown 报告

新增 `## Community Health` 段落，在 Rule Evaluation 之前：

```markdown
## Community Health
- **GitHub**: 120 ⭐ · 45 forks · 12 contributors
- **Discord**: MyServer · 1,234 members (56 online)
- **Twitter**: @myproject · 890 followers
- **Discussions**: 34 threads, 78% answered
- **Telegram**: mygroup · 2,100 members

### Trend (vs previous run 2026-05-08)
- ⭐ +15 · 👥 Discord +120 · 🐦 Twitter +45
```

### HTML 报告

新增 Community Health 卡片区块，复用现有 HTML 模板风格。趋势数据以 +/- 数值显示（不做图表，保持轻量）。

## CLI 改动

新增选项：
- `--telegram-group <username_or_url>` — Telegram 群组标识

不需要新选项来启用社区报告——只要用了 `--providers` 包含社区相关 provider，报告自动生成 Community Health 段落。

## 文件清单

| 文件 | 操作 |
|---|---|
| `src/community-health.js` | 新增 |
| `src/snapshot-store.js` | 新增 |
| `src/providers/telegram-group.js` | 新增 |
| `src/providers/index.js` | 改 — 注册 Telegram provider |
| `src/providers/types.js` | 改 — 加 `TELEGRAM_GROUP` 到 PROVIDER_SOURCES |
| `src/milestone-check.js` | 改 — 调用 communityHealth + snapshotStore，报告加段落 |
| `src/html-report.js` | 改 — HTML 加 Community Health 区块 |
| `src/cli.js` | 改 — 加 `--telegram-group` 选项 |
| `test/community-health.test.js` | 新增 |
| `test/snapshot-store.test.js` | 新增 |
| `test/telegram-group.test.js` | 新增 |

## 不做的事

- 不做 SQLite——JSON 够用
- 不做图表（recharts）——趋势用 +/- 文字表示，轻量优先
- 不做 CLI 子命令——社区报告嵌入现有 `runMilestoneCheck` 流程
- 不做私有 Telegram 群组支持
