#!/usr/bin/env node
import { Command } from 'commander';
import { runMilestoneCheck } from './milestone-check.js';
import { closeBrowser } from './providers/browser-runner.js';
import { loadConfig, resolveOptions } from './config-loader.js';
import { detectDependencyWarnings, resolvePhaseOutputPaths } from './phase-reports.js';

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
  .action(async (options) => {
    try {
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
    } finally {
      await closeBrowser();
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error('[milestone-agent] failed:', err.message);
  process.exit(1);
});
