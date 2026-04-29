/**
 * __ai_context__
 * 模組角色：Discord Community Evidence Provider
 * 系統位置：providers/index.js → [本模組] → types.js
 * 核心職責：
 *   1. 透過 Discord 官方公開的 Invite API 取得伺服器資訊
 *   2. 解析總成員數與在線人數
 *   3. 產出 SOCIAL_METRIC 證據
 * 設計說明：無需 Bot Token，只需使用者提供伺服器邀請碼或邀請連結
 */

import { EVIDENCE_TYPES, PROVIDER_SOURCES, fetchWithRetry } from './types.js';

/**
 * @type {import('./types.js').ProviderDefinition}
 */
const discordApiProvider = {
    name: PROVIDER_SOURCES.DISCORD_API,
    types: [EVIDENCE_TYPES.SOCIAL_METRIC],

    async collect(ctx) {
        let inviteInput = ctx.options?.discordInvite;
        if (!inviteInput) {
            return { items: [], counts: {}, links: {} };
        }

        // WHY: 允許使用者輸入完整網址 (如 https://discord.gg/abc) 或單純的邀請碼 (abc)
        let inviteCode = inviteInput;
        try {
            if (inviteInput.includes('discord.gg/') || inviteInput.includes('discord.com/invite/')) {
                const url = new URL(inviteInput.startsWith('http') ? inviteInput : `https://${inviteInput}`);
                inviteCode = url.pathname.split('/').pop();
            }
        } catch (e) {
            // 解析失敗則直接將原本的字串當作 code
        }

        if (!inviteCode) {
            return { items: [], counts: {}, links: {} };
        }

        const items = [];
        const links = { discord: [] };

        try {
            // WHY: 呼叫 Discord 公開邀請 API 並加上 with_counts 參數取得人數資訊
            const apiUrl = `https://discord.com/api/v9/invites/${inviteCode}?with_counts=true`;
            const res = await fetchWithRetry(apiUrl);

            if (!res || res.message === 'Unknown Invite' || res.code === 10006) {
                console.warn(`[discord-api] Invalid or expired invite code: ${inviteCode}`);
                return { items: [], counts: {}, links: {} };
            }

            const guildName = res.guild?.name || 'Unknown Server';
            const memberCount = res.approximate_member_count || 0;
            const onlineCount = res.approximate_presence_count || 0;
            const description = res.guild?.description || res.channel?.name || '';

            const inviteUrl = `https://discord.gg/${inviteCode}`;
            links.discord.push(inviteUrl);

            items.push({
                type: EVIDENCE_TYPES.SOCIAL_METRIC,
                source: PROVIDER_SOURCES.DISCORD_API,
                title: `Discord Server: ${guildName}`,
                body: `Discord community metrics for ${guildName}:\nTotal Members: ${memberCount}\nOnline Members: ${onlineCount}\nDescription: ${description}`,
                url: inviteUrl,
                metadata: {
                    guildId: res.guild?.id,
                    guildName,
                    memberCount,
                    onlineCount,
                    inviteCode
                }
            });

            return {
                items,
                counts: {
                    social_metrics: 1
                },
                links,
                metadata: {
                    discordServers: 1
                }
            };
        } catch (error) {
            console.warn(`[discord-api] Failed to fetch Discord invite data: ${error.message}`);
            // 若為 404，API fetchWithRetry 可能會拋出錯誤
            return { items: [], counts: {}, links: {} };
        }
    }
};

export default discordApiProvider;

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - `ctx.options.discordInvite` 提供的是邀請連結或邀請代碼。
 *    - Discord Invite API (`/api/v9/invites/...`) 保持公開不需驗證，這目前是 Discord client 渲染邀請預覽的核心機制。
 * 2. 潛在邊界情況：
 *    - 邀請碼失效、過期，或是伺服器關閉邀請，會回傳 404 (Unknown Invite)。此時靜默忽略不報錯。
 *    - 如果使用者輸入奇怪的字串，抓出來的可能不是群組而是錯誤代碼。
 * 3. 模組依賴：
 *    - fetchWithRetry (處理基本的網路錯誤)
 */
