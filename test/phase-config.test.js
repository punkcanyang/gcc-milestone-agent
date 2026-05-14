import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePhaseId,
  normalizeDependsOn,
  normalizeMilestones
} from '../src/phase-config.js';

test('validatePhaseId accepts slug-like ids', () => {
  assert.equal(validatePhaseId('M1'), 'M1');
  assert.equal(validatePhaseId('phase-1'), 'phase-1');
  assert.equal(validatePhaseId('delivery_alpha'), 'delivery_alpha');
});

test('validatePhaseId rejects empty or unsafe ids', () => {
  assert.throws(() => validatePhaseId(''), /Invalid phase id/);
  assert.throws(() => validatePhaseId('M 1'), /Invalid phase id/);
  assert.throws(() => validatePhaseId('../M1'), /Invalid phase id/);
});

test('normalizeDependsOn accepts string, array, and empty values', () => {
  assert.deepEqual(normalizeDependsOn('M1'), ['M1']);
  assert.deepEqual(normalizeDependsOn(['M1', 'M2']), ['M1', 'M2']);
  assert.deepEqual(normalizeDependsOn(undefined), []);
});

test('normalizeMilestones normalizes dependsOn to arrays', () => {
  const phases = normalizeMilestones([
    { id: 'M1', milestone: 'one' },
    { id: 'M2', milestone: 'two', dependsOn: 'M1' }
  ]);
  assert.deepEqual(phases[1].dependsOn, ['M1']);
});
