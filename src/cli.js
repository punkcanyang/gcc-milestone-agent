#!/usr/bin/env node
import { Command } from 'commander';
import { runMilestoneCheck } from './milestone-check.js';

const program = new Command();

program
  .name('milestone-agent')
  .description('Milestone proof collector for GCC grant workflows')
  .requiredOption('--repo <owner/name>', 'GitHub repository, e.g. octocat/hello-world')
  .requiredOption('--milestone <text>', 'Milestone definition text')
  .option('--since <date>', 'Only collect evidence after ISO date')
  .option('--out <path>', 'Output markdown report path', './report.md')
  .option('--json-out <path>', 'Optional JSON report output path')
  .option('--rules-file <path>', 'Optional YAML rules file path')
  .action(async (options) => {
    const result = await runMilestoneCheck(options);
    console.log(result.summary);
    console.log(`Report written: ${result.reportPath}`);
    if (result.jsonReportPath) {
      console.log(`JSON report written: ${result.jsonReportPath}`);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error('[milestone-agent] failed:', err.message);
  process.exit(1);
});
