import test from 'node:test';
import assert from 'node:assert/strict';
import { _internal } from '../src/providers/github-api.js';

test('extractNextLink returns next URL from Link header', () => {
  const header = '<https://api.github.com/repositories/1/commits?page=2>; rel="next", <https://api.github.com/repositories/1/commits?page=4>; rel="last"';
  const next = _internal.extractNextLink(header);
  assert.equal(next, 'https://api.github.com/repositories/1/commits?page=2');
});

test('extractNextLink returns null when next relation is absent', () => {
  const header = '<https://api.github.com/repositories/1/commits?page=4>; rel="last"';
  const next = _internal.extractNextLink(header);
  assert.equal(next, null);
});

test('fetchPaginatedArray follows next link and merges all pages', async () => {
  const pages = new Map([
    ['https://api.github.com/repositories/1/commits?page=1', { data: [{ id: 'c1' }], linkHeader: '<https://api.github.com/repositories/1/commits?page=2>; rel="next"' }],
    ['https://api.github.com/repositories/1/commits?page=2', { data: [{ id: 'c2' }], linkHeader: null }]
  ]);

  const result = await _internal.fetchPaginatedArray(
    'https://api.github.com/repositories/1/commits?page=1',
    async (url) => pages.get(url),
    { maxPages: 10, resourceName: 'commits' }
  );

  assert.deepEqual(result, [{ id: 'c1' }, { id: 'c2' }]);
});

test('fetchPaginatedArray stops at maxPages to avoid unbounded traversal', async () => {
  const requests = [];
  const result = await _internal.fetchPaginatedArray(
    'https://api.github.com/repositories/1/commits?page=1',
    async (url) => {
      requests.push(url);
      return { data: [{ id: `page-${requests.length}` }], linkHeader: '<https://api.github.com/repositories/1/commits?page=next>; rel="next"' };
    },
    { maxPages: 2, resourceName: 'commits' }
  );

  assert.equal(requests.length, 2);
  assert.deepEqual(result, [{ id: 'page-1' }, { id: 'page-2' }]);
});
