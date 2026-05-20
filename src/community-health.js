/**
 * Aggregate community metrics from provider metadata into a unified view.
 */

/**
 * __ai_context__
 * 模組角色：社區健康度指標聚合模組
 * 系統位置：milestone-check.js → [本模組]
 * 核心職責：
 *   1. 聚合來自各 Provider 的 metadata (GitHub、Discord、Twitter、Telegram、GitHub Discussions 等) 為統一的社區健康結構
 *   2. 與先前快照對比計算增長趨勢 (deltas)
 *   3. 格式化為 Markdown 格式以嵌入報告
 */

export function buildCommunityHealth(providerMeta = {}) {
  const health = {};

  const gh = providerMeta['github-community'];
  if (gh) {
    health.github = {
      stars: gh.stars || 0,
      forks: gh.forks || 0,
      contributors: gh.contributorCount || 0,
      watchers: gh.watchers || 0
    };
  }

  const discord = providerMeta['discord-api'];
  if (discord) {
    health.discord = {
      memberCount: discord.memberCount || 0,
      onlineCount: discord.onlineCount || 0
    };
  }

  const twitter = providerMeta['twitter-browser'];
  if (twitter) {
    health.twitter = {
      handle: twitter.handle || '',
      followerCount: twitter.followerCount || 'unknown'
    };
  }

  const telegram = providerMeta['telegram-group'];
  if (telegram) {
    health.telegram = {
      memberCount: telegram.memberCount || 0
    };
  }

  const discussions = providerMeta['github-discussions'];
  if (discussions) {
    health.discussions = {
      totalCount: discussions.totalCount || 0,
      answeredRate: discussions.answerRate || 0,
      participantCount: discussions.topParticipants?.length || 0
    };
  }

  return health;
}

export function computeTrend(current, previous) {
  if (!previous) return null;

  const deltas = {};

  if (current.github && previous.github) {
    const s = (current.github.stars || 0) - (previous.github.stars || 0);
    const f = (current.github.forks || 0) - (previous.github.forks || 0);
    const c = (current.github.contributors || 0) - (previous.github.contributors || 0);
    if (s) deltas.stars = s;
    if (f) deltas.forks = f;
    if (c) deltas.contributors = c;
  }

  if (current.discord && previous.discord) {
    if (typeof current.discord.memberCount === 'number' && typeof previous.discord.memberCount === 'number') {
      const d = current.discord.memberCount - previous.discord.memberCount;
      if (d) deltas.discordMembers = d;
    }
  }

  if (current.twitter && previous.twitter) {
    const curFol = Number(current.twitter.followerCount) || 0;
    const prevFol = Number(previous.twitter.followerCount) || 0;
    if (curFol && prevFol) {
      const d = curFol - prevFol;
      if (d) deltas.twitterFollowers = d;
    }
  }

  if (current.telegram && previous.telegram) {
    if (typeof current.telegram.memberCount === 'number' && typeof previous.telegram.memberCount === 'number') {
      const d = current.telegram.memberCount - previous.telegram.memberCount;
      if (d) deltas.telegramMembers = d;
    }
  }

  return Object.keys(deltas).length > 0 ? deltas : null;
}

export function formatCommunityHealthMarkdown(health, trend) {
  const lines = [];

  if (health.github) {
    lines.push(`- **GitHub**: ${health.github.stars} ⭐ · ${health.github.forks} forks · ${health.github.contributors} contributors`);
  }
  if (health.discord) {
    lines.push(`- **Discord**: ${health.discord.memberCount} members (${health.discord.onlineCount} online)`);
  }
  if (health.twitter) {
    lines.push(`- **Twitter**: @${health.twitter.handle} · ${health.twitter.followerCount} followers`);
  }
  if (health.telegram) {
    lines.push(`- **Telegram**: ${health.telegram.memberCount} members`);
  }
  if (health.discussions) {
    lines.push(`- **Discussions**: ${health.discussions.totalCount} threads, ${health.discussions.answeredRate}% answered`);
  }

  if (!lines.length) return '';

  let output = `\n## Community Health\n${lines.join('\n')}\n`;

  if (trend) {
    const trendLines = [];
    if (trend.stars) trendLines.push(`⭐ ${trend.stars > 0 ? '+' : ''}${trend.stars}`);
    if (trend.forks) trendLines.push(`🍴 ${trend.forks > 0 ? '+' : ''}${trend.forks}`);
    if (trend.discordMembers) trendLines.push(`👥 Discord ${trend.discordMembers > 0 ? '+' : ''}${trend.discordMembers}`);
    if (trend.twitterFollowers) trendLines.push(`🐦 Twitter ${trend.twitterFollowers > 0 ? '+' : ''}${trend.twitterFollowers}`);
    if (trend.telegramMembers) trendLines.push(`✈️ Telegram ${trend.telegramMembers > 0 ? '+' : ''}${trend.telegramMembers}`);
    if (trendLines.length) {
      output += `\n### Trend (vs previous)\n${trendLines.join(' · ')}\n`;
    }
  }

  return output;
}

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 各 Provider 的 metadata 結構與本模組中的提取鍵值保持一致。
 *    - 趨勢計算只比較數值型指標（如 star 數、成員數、粉絲數）。
 * 2. 潛在邊界情況：
 *    - 如果某個 Provider 收集失敗或沒有啟用，相應的社區健康欄位將不存在，但計算時有安全防護防範未定義錯誤。
 * 3. 模組依賴：
 *    - 無外部依賴，純數據處理。
 */

