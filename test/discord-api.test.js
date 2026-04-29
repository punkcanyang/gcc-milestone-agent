import test from 'node:test';
import assert from 'node:assert';
import discordApiProvider from '../src/providers/discord-api.js';
import { EVIDENCE_TYPES, PROVIDER_SOURCES } from '../src/providers/types.js';

test('discordApiProvider has correct structure', () => {
    assert.equal(discordApiProvider.name, PROVIDER_SOURCES.DISCORD_API);
    assert.ok(discordApiProvider.types.includes(EVIDENCE_TYPES.SOCIAL_METRIC));
    assert.equal(typeof discordApiProvider.collect, 'function');
});

test('discordApiProvider returns empty if no discordInvite provided', async () => {
    const result = await discordApiProvider.collect({ options: {} });
    assert.deepEqual(result, { items: [], counts: {}, links: {} });
});

test('discordApiProvider strips url to code', async () => {
    // This is hard to test purely because fetchWithRetry is imported from types.js,
    // which uses global fetch. We can intercept global fetch.
    const originalFetch = global.fetch;
    let fetchedUrl = '';
    
    global.fetch = async (url) => {
        fetchedUrl = url;
        return {
            ok: true,
            status: 200,
            json: async () => ({
                approximate_member_count: 100,
                approximate_presence_count: 50,
                guild: { name: 'Test Guild', id: '123' }
            })
        };
    };

    try {
        const result = await discordApiProvider.collect({ options: { discordInvite: 'https://discord.gg/test-code' } });
        assert.ok(fetchedUrl.includes('test-code'));
        assert.equal(result.items.length, 1);
        assert.ok(result.items[0].body.includes('Total Members: 100'));
    } finally {
        global.fetch = originalFetch;
    }
});

test('discordApiProvider returns empty on unknown invite', async () => {
    const originalFetch = global.fetch;
    
    global.fetch = async (url) => {
        return {
            ok: true,
            status: 200,
            json: async () => ({
                message: 'Unknown Invite',
                code: 10006
            })
        };
    };

    try {
        const result = await discordApiProvider.collect({ options: { discordInvite: 'invalid-code' } });
        assert.equal(result.items.length, 0);
    } finally {
        global.fetch = originalFetch;
    }
});
