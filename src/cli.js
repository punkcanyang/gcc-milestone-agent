#!/usr/bin/env node
/**
 * __ai_context__
 * 模組角色：CLI 入口點，負責解析命令行參數並調用核心邏輯
 * 系統位置：[本模組] → milestone-check.js（唯一入口）
 * 核心職責：
 *   1. 定義 CLI 選項（--repo, --milestone, --since, --out 等）
 *   2. 將解析後的選項傳遞給 runMilestoneCheck
 *   3. 輸出執行結果摘要到 stdout
 * 設計說明：使用 commander 庫處理 CLI 參數解析
 */
import { Command } from 'commander';
import { runMilestoneCheck } from './milestone-check.js';
import { closeBrowser } from './providers/browser-runner.js';

const program = new Command();

program
  .name('milestone-agent')
  .description('Milestone proof collector for GCC grant workflows')
  .requiredOption('--repo <owner/name>', 'GitHub repository, e.g. octocat/hello-world')
  .requiredOption('--milestone <text>', 'Milestone definition text')
  .option('--since <date>', 'Only collect evidence after ISO date')
  .option('--out <path>', 'Output markdown report path', './report.md')
  .option('--json-out <path>', 'Optional JSON report output path')
  .option('--html-out <path>', 'Optional HTML report output path')
  .option('--rules-file <path>', 'Optional YAML rules file path')
  .option('--profile <name>', 'Built-in profile name (e.g. gcc-allocation)')
  .option('--providers <list>', 'Comma-separated list of evidence providers (default: github-api)')
  .option('--twitter-handle <handle>', 'Twitter handle to check for social metrics')
  .option('--contract-address <address>', 'Smart contract address to verify')
  .option('--etherscan-url <url>', 'Etherscan-compatible API URL', 'https://api.etherscan.io/api')
  .option('--article-urls <urls>', 'Comma-separated list of article URLs to crawl and verify')
  .option('--discord-invite <code_or_url>', 'Discord invite code or URL to check community metrics')
  .option('--telegram-group <username_or_url>', 'Telegram group username or URL to check community metrics')
  .option('--semantic-mode <mode>', 'Semantic mode: heuristic | llm (default: heuristic)', 'heuristic')
  .option('--llm-model <name>', 'OpenAI model when --semantic-mode llm is used (default: gpt-5-mini)')
  .action(async (options) => {
    try {
      const result = await runMilestoneCheck(options);
      console.log(result.summary);
      console.log(`Report written: ${result.reportPath}`);
      if (result.jsonReportPath) {
        console.log(`JSON report written: ${result.jsonReportPath}`);
      }
      if (result.htmlReportPath) {
        console.log(`HTML report written: ${result.htmlReportPath}`);
      }
    } finally {
      // WHY: 確保瀏覽器實例在 CLI 退出時被關閉，防止資源洩漏
      await closeBrowser();
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error('[milestone-agent] failed:', err.message);
  process.exit(1);
});

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - commander 庫處理所有參數驗證（required options）
 *    - 所有業務邏輯委託給 milestone-check.js
 * 2. 潛在邊界情況：
 *    - process.exit(1) 在 catch 中調用，可能跳過 cleanup
 *    - commander 的 camelCase 選項轉換：--json-out → jsonOut, --rules-file → rulesFile
 * 3. 模組依賴：
 *    - commander（CLI 參數解析）
 *    - milestone-check.js（runMilestoneCheck）
 */
