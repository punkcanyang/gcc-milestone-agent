import test from 'node:test';
import assert from 'node:assert';
import etherscanApiProvider from '../src/providers/etherscan-api.js';
import { EVIDENCE_TYPES, PROVIDER_SOURCES } from '../src/providers/types.js';

test('EVIDENCE_TYPES includes SMART_CONTRACT', () => {
    assert.equal(EVIDENCE_TYPES.SMART_CONTRACT, 'smart_contract');
});

test('PROVIDER_SOURCES includes ETHERSCAN_API', () => {
    assert.equal(PROVIDER_SOURCES.ETHERSCAN_API, 'etherscan-api');
});

test('etherscanApiProvider has correct structure', () => {
    assert.equal(etherscanApiProvider.name, PROVIDER_SOURCES.ETHERSCAN_API);
    assert.ok(etherscanApiProvider.types.includes(EVIDENCE_TYPES.SMART_CONTRACT));
    assert.equal(typeof etherscanApiProvider.collect, 'function');
});

test('etherscanApiProvider returns empty if no contractAddress provided', async () => {
    const result = await etherscanApiProvider.collect({ options: {} });
    assert.deepEqual(result, { items: [], counts: {}, links: {} });
});
