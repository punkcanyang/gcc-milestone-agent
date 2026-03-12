import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluateMilestoneRules, loadRulesFromFile } from './rule-engine.js';

const GITHUB_API = 'https://api.github.com';

function normalizeDate(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid --since date: ${input}`);
  }
  return d.toISOString();
}

function parseRepo(repo) {
  const [owner, name] = String(repo).split('/');
  if (!owner || !name) {
    throw new Error(`Invalid --repo format: ${repo}. Expected owner/name`);
  }
  return { owner, name };
}

function scoreEvidence({ commits, pulls, issues, releases, rulePassRate }) {
  const activityRaw = commits * 2 + pulls * 4 + issues * 2 + releases * 5;
  const activityScore = Math.min(100, activityRaw);
  const score = Math.round(activityScore * 0.6 + rulePassRate * 0.4);
  let status = 'not_met';
  if (score >= 70) status = 'met';
  else if (score >= 40) status = 'partially_met';
  return { score, status, activityScore };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubFetch(url, token, retries = 2) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'gcc-milestone-agent'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return res.json();

      const body = await res.text();
      const retriable = res.status >= 500 || res.status === 429;
      if (!retriable || attempt === retries) {
        throw new Error(`GitHub API ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
      }
      const retryAfter = Number(res.headers.get('retry-after') || '0');
      await sleep((retryAfter || 1 + attempt) * 1000);
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep((attempt + 1) * 1000);
    }
  }

  throw new Error('Unexpected githubFetch flow');
}

async function collectEvidence({ owner, name, sinceIso, token }) {
  const sinceQuery = sinceIso ? `&since=${encodeURIComponent(sinceIso)}` : '';
  const base = `${GITHUB_API}/repos/${owner}/${name}`;

  const [commitsRaw, pullsRaw, issuesRaw, releasesRaw] = await Promise.all([
    githubFetch(`${base}/commits?per_page=100${sinceQuery}`, token),
    githubFetch(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=100`, token),
    githubFetch(`${base}/issues?state=all&sort=updated&direction=desc&per_page=100`, token),
    githubFetch(`${base}/releases?per_page=30`, token)
  ]);

  const sinceTs = sinceIso ? new Date(sinceIso).getTime() : null;
  const inWindow = (dateText) => {
    if (!sinceTs) return true;
    if (!dateText) return false;
    return new Date(dateText).getTime() >= sinceTs;
  };

  const commits = commitsRaw.filter((c) => inWindow(c?.commit?.author?.date));
  const pulls = pullsRaw.filter((p) => inWindow(p?.updated_at));
  const issues = issuesRaw
    .filter((i) => !i.pull_request)
    .filter((i) => inWindow(i?.updated_at));
  const releases = releasesRaw.filter((r) => inWindow(r?.published_at || r?.created_at));

  const evidenceItems = [
    ...commits.map((c) => ({
      type: 'commit',
      title: c?.commit?.message || '',
      body: '',
      url: c.html_url
    })),
    ...pulls.map((p) => ({
      type: 'pull',
      title: p.title || '',
      body: p.body || '',
      url: p.html_url
    })),
    ...issues.map((i) => ({
      type: 'issue',
      title: i.title || '',
      body: i.body || '',
      url: i.html_url
    })),
    ...releases.map((r) => ({
      type: 'release',
      title: r.name || r.tag_name || '',
      body: r.body || '',
      url: r.html_url
    }))
  ];

  return {
    commits,
    pulls,
    issues,
    releases,
    evidenceItems,
    links: {
      commits: commits.slice(0, 5).map((c) => c.html_url),
      pulls: pulls.slice(0, 5).map((p) => p.html_url),
      issues: issues.slice(0, 5).map((i) => i.html_url),
      releases: releases.slice(0, 5).map((r) => r.html_url)
    }
  };
}

function listOrNone(items) {
  if (!items.length) return '- (none)\n';
  return items.map((url) => `- ${url}\n`).join('');
}

function buildRuleSection(ruleEval) {
  if (!ruleEval.rules.length) return '- No parseable rules from milestone text.\n';
  return `${ruleEval.rules.map((r) => {
    const icon = r.result.matched ? '✅' : '❌';
    const samples = r.result.sampleLinks.length
      ? r.result.sampleLinks.map((s) => `  - ${s.url} (matched: ${s.matchedKeywords.join(', ')})`).join('\n')
      : '  - (no matching evidence)';
    return `- ${icon} ${r.id}: ${r.text}\n${samples}`;
  }).join('\n')}\n`;
}

function buildReport({ repo, milestone, since, score, status, activityScore, counts, links, ruleEval }) {
  return `# Milestone Verification Report\n\n` +
    `- Repo: ${repo}\n` +
    `- Milestone: ${milestone}\n` +
    `- Since: ${since ?? 'N/A'}\n` +
    `- Result: **${status}**\n` +
    `- Score: **${score}/100**\n` +
    `- Activity Score: ${activityScore}/100\n` +
    `- Rule Pass Rate: ${ruleEval.passRate}% (${ruleEval.passed}/${ruleEval.total})\n\n` +
    `## Evidence Summary\n` +
    `- Commits counted: ${counts.commits}\n` +
    `- Pull requests counted: ${counts.pulls}\n` +
    `- Issues counted: ${counts.issues}\n` +
    `- Releases counted: ${counts.releases}\n\n` +
    `## Evidence Links (sample)\n` +
    `### Commits\n${listOrNone(links.commits)}` +
    `### Pull Requests\n${listOrNone(links.pulls)}` +
    `### Issues\n${listOrNone(links.issues)}` +
    `### Releases\n${listOrNone(links.releases)}` +
    `\n## Rule Evaluation\n${buildRuleSection(ruleEval)}\n` +
    `## Risk Notes\n` +
    `- Rule engine currently uses keyword heuristics and should be reviewed by humans.\n` +
    `- Keep human final approval (human-in-the-loop) before any fund allocation decision.\n`;
}

function buildJsonReport({ repo, milestone, sinceIso, score, status, activityScore, counts, ruleEval, links }) {
  return {
    generatedAt: new Date().toISOString(),
    repo,
    milestone,
    since: sinceIso,
    status,
    score,
    activityScore,
    rulePassRate: ruleEval.passRate,
    ruleStats: { passed: ruleEval.passed, total: ruleEval.total },
    evidenceCounts: counts,
    evidenceLinks: links,
    rules: ruleEval.rules
  };
}

export async function runMilestoneCheck({ repo, milestone, since, out, jsonOut, rulesFile }) {
  const sinceIso = normalizeDate(since);
  const { owner, name } = parseRepo(repo);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  const evidence = await collectEvidence({ owner, name, sinceIso, token });

  const counts = {
    commits: evidence.commits.length,
    pulls: evidence.pulls.length,
    issues: evidence.issues.length,
    releases: evidence.releases.length
  };

  const rules = rulesFile ? await loadRulesFromFile(rulesFile) : null;
  const ruleEval = evaluateMilestoneRules(milestone, evidence.evidenceItems, rules);
  const { score, status, activityScore } = scoreEvidence({ ...counts, rulePassRate: ruleEval.passRate });

  const report = buildReport({
    repo,
    milestone,
    since: sinceIso,
    score,
    status,
    activityScore,
    counts,
    links: evidence.links,
    ruleEval
  });

  const reportPath = path.resolve(process.cwd(), out);
  await fs.writeFile(reportPath, report, 'utf8');

  let jsonReportPath = null;
  if (jsonOut) {
    const payload = buildJsonReport({
      repo,
      milestone,
      sinceIso,
      score,
      status,
      activityScore,
      counts,
      ruleEval,
      links: evidence.links
    });
    jsonReportPath = path.resolve(process.cwd(), jsonOut);
    await fs.writeFile(jsonReportPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  return {
    summary: `[${status}] ${repo} milestone score ${score}/100 (activity:${activityScore} rules:${ruleEval.passRate}% commits:${counts.commits} prs:${counts.pulls} issues:${counts.issues} releases:${counts.releases})`,
    reportPath,
    jsonReportPath
  };
}

export const _internal = {
  scoreEvidence,
  normalizeDate,
  parseRepo
};
