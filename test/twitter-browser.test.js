import test from 'node:test';
import assert from 'node:assert';
import twitterBrowserProvider from '../src/providers/twitter-browser.js';
import { EVIDENCE_TYPES, PROVIDER_SOURCES } from '../src/providers/types.js';
import * as llm from '../src/llm-semantic.js';

test('twitterBrowserProvider has correct structure', () => {
    assert.equal(twitterBrowserProvider.name, PROVIDER_SOURCES.TWITTER_BROWSER);
    assert.ok(twitterBrowserProvider.types.includes(EVIDENCE_TYPES.SOCIAL_METRIC));
    assert.equal(typeof twitterBrowserProvider.collect, 'function');
});

test('twitterBrowserProvider returns empty if no twitterHandle provided', async () => {
    const result = await twitterBrowserProvider.collect({ options: {} });
    assert.deepEqual(result, { items: [], counts: {}, links: {} });
});

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('requestLlmVisionExtraction parses valid numbers and ignores text', async () => {
    const tempFile = path.join(os.tmpdir(), 'dummy-vision-test.png');
    fs.writeFileSync(tempFile, 'dummy base64 content');

    const mockFetch = async () => ({
        ok: true,
        json: async () => ({
            choices: [{ message: { content: '12,345 Followers' } }]
        })
    });

    const result = await llm.requestLlmVisionExtraction('dummy-key', tempFile, 'prompt', mockFetch);
    assert.equal(result, '12345');

    fs.unlinkSync(tempFile);
});

test('requestLlmVisionExtraction returns unknown when match fails', async () => {
    const tempFile = path.join(os.tmpdir(), 'dummy-vision-test2.png');
    fs.writeFileSync(tempFile, 'dummy base64 content');

    const mockFetch = async () => ({
        ok: true,
        json: async () => ({
            choices: [{ message: { content: 'unknown' } }]
        })
    });

    const result = await llm.requestLlmVisionExtraction('dummy-key', tempFile, 'prompt', mockFetch);
    assert.equal(result, 'unknown');

    fs.unlinkSync(tempFile);
});
