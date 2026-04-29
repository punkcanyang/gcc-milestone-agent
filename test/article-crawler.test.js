import test from 'node:test';
import assert from 'node:assert';
import articleCrawlerProvider from '../src/providers/article-crawler.js';
import { EVIDENCE_TYPES, PROVIDER_SOURCES } from '../src/providers/types.js';

test('EVIDENCE_TYPES includes CONTENT_ARTICLE', () => {
    assert.equal(EVIDENCE_TYPES.CONTENT_ARTICLE, 'content_article');
});

test('PROVIDER_SOURCES includes ARTICLE_CRAWLER', () => {
    assert.equal(PROVIDER_SOURCES.ARTICLE_CRAWLER, 'article-crawler');
});

test('articleCrawlerProvider has correct structure', () => {
    assert.equal(articleCrawlerProvider.name, PROVIDER_SOURCES.ARTICLE_CRAWLER);
    assert.ok(articleCrawlerProvider.types.includes(EVIDENCE_TYPES.CONTENT_ARTICLE));
    assert.equal(typeof articleCrawlerProvider.collect, 'function');
});

test('articleCrawlerProvider returns empty if no articleUrls provided', async () => {
    const result = await articleCrawlerProvider.collect({ options: {} });
    assert.deepEqual(result, { items: [], counts: {}, links: {} });
});
