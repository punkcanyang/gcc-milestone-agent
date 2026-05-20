#!/usr/bin/env node
/**
 * __ai_context__
 * 模組角色：CLI 命令列入口
 * 系統位置：專案運行入口點
 * 核心職責：
 *   1. 使用 commander 定義命令列參數及選項 (如 --repo、--milestone、--phase 等)
 *   2. 載入本機設定，合併 CLI 參數與設定檔配置
 *   3. 處理單期模式下的輸出路徑解析與依賴期校驗
 *   4. 調用並執行 runMilestoneCheck，並在 finally 清理 Playwright 瀏覽器實例
 */
import { Command } from 'commander';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { runMilestoneCheck } from './milestone-check.js';
import { closeBrowser } from './providers/browser-runner.js';
import { loadConfig, resolveOptions } from './config-loader.js';
import { detectDependencyWarnings, resolvePhaseOutputPaths } from './phase-reports.js';
import { renderBatchDashboardHtml } from './html-report.js';

const program = new Command();

program
  .name('milestone-agent')
  .description('Milestone proof collector for GCC grant workflows')
  .option('--config <path>', 'Config file path (default: .gcc-milestone.yaml)')
  .option('--repo <owner/name>', 'GitHub repository, e.g. octocat/hello-world')
  .option('--milestone <text>', 'Milestone definition text')
  .option('--phase <id>', 'Milestone phase id from .gcc-milestone.yaml')
  .option('--since <date>', 'Only collect evidence after ISO date')
  .option('--out <path>', 'Output markdown report path')
  .option('--json-out <path>', 'Optional JSON report output path')
  .option('--html-out <path>', 'Optional HTML report output path')
  .option('--reports-dir <path>', 'Directory for phase reports and dependency lookup')
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
  .option('--batch <path>', 'Optional batch config file path')
  .action(async (options) => {
    try {
      if (options.batch) {
        const batchPath = path.resolve(process.cwd(), options.batch);
        if (!fsSync.existsSync(batchPath)) {
          console.error(`[milestone-agent] --batch file not found: ${options.batch}`);
          process.exit(1);
        }
        const batchRaw = fsSync.readFileSync(batchPath, 'utf8');
        const batchConfig = yaml.load(batchRaw);
        if (!batchConfig || typeof batchConfig !== 'object' || !Array.isArray(batchConfig.projects)) {
          console.error('[milestone-agent] batch config must define a "projects" array');
          process.exit(1);
        }

        const globalConfig = loadConfig(process.cwd(), options.config);

        const defaultReportsDir = options.reportsDir || batchConfig.reportsDir || 'reports';
        const defaultProviders = options.providers || batchConfig.providers || 'github-api';
        const defaultSince = options.since || batchConfig.since || undefined;
        const defaultSemanticMode = options.semanticMode || batchConfig.semanticMode || 'heuristic';
        const defaultLlmModel = options.llmModel || batchConfig.llmModel || 'gpt-5-mini';
        const defaultProfile = options.profile || batchConfig.profile || undefined;

        const batchResults = [];

        for (const proj of batchConfig.projects) {
          if (!proj.repo) {
            console.warn('[milestone-agent] skipping project without "repo" field');
            continue;
          }

          console.log(`\n========================================`);
          console.log(`[milestone-agent] Evaluating batch project: ${proj.repo}`);
          console.log(`========================================`);

          const projOptions = {
            config: options.config,
            repo: proj.repo,
            milestone: proj.milestone,
            phase: proj.phase,
            since: proj.since || defaultSince,
            reportsDir: proj.reportsDir || defaultReportsDir,
            providers: proj.providers || defaultProviders,
            contractAddress: proj.contractAddress,
            etherscanUrl: proj.etherscanUrl,
            articleUrls: proj.articleUrls,
            discordInvite: proj.discordInvite,
            telegramGroup: proj.telegramGroup,
            semanticMode: proj.semanticMode || defaultSemanticMode,
            llmModel: proj.llmModel || defaultLlmModel,
            profile: proj.profile || defaultProfile,
            out: proj.out,
            jsonOut: proj.jsonOut,
            htmlOut: proj.htmlOut
          };

          const projMilestones = proj.milestones || batchConfig.milestones || globalConfig.milestones;
          const projConfig = {
            ...globalConfig,
            ...batchConfig,
            ...proj,
            milestones: projMilestones
          };

          try {
            let mergedProj = resolveOptions(projOptions, projConfig);
            if (mergedProj.phase) {
              const outputPaths = resolvePhaseOutputPaths({
                repo: mergedProj.repo,
                phaseId: mergedProj.phase.id,
                reportsDir: mergedProj.reportsDir,
                out: mergedProj.out,
                jsonOut: mergedProj.jsonOut,
                htmlOut: mergedProj.htmlOut
              });
              const dependencyWarnings = await detectDependencyWarnings({
                reportsDir: outputPaths.reportsDir,
                repo: mergedProj.repo,
                phase: mergedProj.phase
              });
              mergedProj = {
                ...mergedProj,
                ...outputPaths,
                dependencyWarnings
              };
            } else {
              const slug = mergedProj.repo.replace(/\//g, '_');
              const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
              const base = path.join(mergedProj.reportsDir, `${slug}-${timestamp}`);
              mergedProj.out = mergedProj.out || `${base}.md`;
              mergedProj.jsonOut = mergedProj.jsonOut || `${base}.json`;
              mergedProj.htmlOut = mergedProj.htmlOut || `${base}.html`;
            }

            if (!mergedProj.milestone) {
              throw new Error('milestone description is missing');
            }

            const result = await runMilestoneCheck(mergedProj);
            console.log(result.summary);

            const relReportPath = result.reportPath ? path.relative(defaultReportsDir, result.reportPath) : null;
            const relHtmlReportPath = result.htmlReportPath ? path.relative(defaultReportsDir, result.htmlReportPath) : null;

            batchResults.push({
              repo: proj.repo,
              phaseId: mergedProj.phase?.id || null,
              phaseTitle: mergedProj.phase?.title || null,
              milestoneText: mergedProj.milestone,
              status: result.payload.status,
              score: result.payload.score,
              generatedAt: result.payload.generatedAt,
              reportPath: relReportPath,
              htmlReportPath: relHtmlReportPath
            });
          } catch (err) {
            console.error(`[milestone-agent] Failed evaluating project ${proj.repo}:`, err.message);
            batchResults.push({
              repo: proj.repo,
              phaseId: proj.phase || null,
              phaseTitle: null,
              milestoneText: proj.milestone || '',
              status: 'failed',
              score: 0,
              generatedAt: new Date().toISOString(),
              reportPath: null,
              htmlReportPath: null,
              error: err.message
            });
          }
        }

        const dashboardPayload = {
          projects: batchResults,
          generatedAt: new Date().toISOString()
        };
        const dashboardHtml = renderBatchDashboardHtml(dashboardPayload);
        const indexHtmlPath = path.resolve(defaultReportsDir, 'index.html');
        await fs.mkdir(path.dirname(indexHtmlPath), { recursive: true });
        await fs.writeFile(indexHtmlPath, dashboardHtml, 'utf8');

        console.log(`\n========================================`);
        console.log(`[milestone-agent] Batch evaluation complete!`);
        console.log(`Aggregation Dashboard written: ${indexHtmlPath}`);
        console.log(`========================================`);
      } else {
        const config = loadConfig(process.cwd(), options.config);
        let merged = resolveOptions(options, config);

        if (merged.phase) {
          const outputPaths = resolvePhaseOutputPaths({
            repo: merged.repo,
            phaseId: merged.phase.id,
            reportsDir: merged.reportsDir,
            out: merged.out,
            jsonOut: merged.jsonOut,
            htmlOut: merged.htmlOut
          });
          const dependencyWarnings = await detectDependencyWarnings({
            reportsDir: outputPaths.reportsDir,
            repo: merged.repo,
            phase: merged.phase
          });
          merged = {
            ...merged,
            ...outputPaths,
            dependencyWarnings
          };
        } else {
          merged = {
            ...merged,
            out: merged.out || './report.md'
          };
        }

        if (!merged.repo) {
          console.error('[milestone-agent] --repo is required (via CLI or .gcc-milestone.yaml)');
          process.exit(1);
        }
        if (!merged.milestone) {
          console.error('[milestone-agent] --milestone is required (via CLI or .gcc-milestone.yaml)');
          process.exit(1);
        }

        const result = await runMilestoneCheck(merged);
        console.log(result.summary);
        console.log(`Report written: ${result.reportPath}`);
        if (result.jsonReportPath) {
          console.log(`JSON report written: ${result.jsonReportPath}`);
        }
        if (result.htmlReportPath) {
          console.log(`HTML report written: ${result.htmlReportPath}`);
        }
      }
    } finally {
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
 *    - 作為 node 可執行腳本入口 (#!/usr/bin/env node)。
 *    - 始終在 finally 區塊中執行 `await closeBrowser()` 以防瀏覽器進程洩漏。
 *    - CLI 參數會被 commander 自動處理為 camelCase 變數名（例如 `--json-out` 變為 `options.jsonOut`）。
 * 2. 潛在邊界情況：
 *    - 當 `--repo` 或 `--milestone` 缺失時，將會輸出錯誤訊息並以 code 1 結束處理。
 *    - 當 `--phase` 指定的期號在設定檔中不存在時，由 resolveOptions 內部拋出錯誤，並在 program.parseAsync 的 catch 中捕獲並印出。
 * 3. 模組依賴：
 *    - commander
 *    - config-loader.js (載入配置)
 *    - milestone-check.js (執行里程碑驗證)
 *    - phase-reports.js (單期輸出路徑解析及跨期依賴檢測)
 *    - providers/browser-runner.js (關閉瀏覽器)
 */

