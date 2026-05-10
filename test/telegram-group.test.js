import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTelegramGroup, parseMemberCount } from '../src/providers/telegram-group.js';

test('normalizeTelegramGroup handles bare username', () => {
  assert.equal(normalizeTelegramGroup('mygroup'), 'mygroup');
});

test('normalizeTelegramGroup handles t.me URL', () => {
  assert.equal(normalizeTelegramGroup('t.me/mygroup'), 'mygroup');
});

test('normalizeTelegramGroup handles full URL', () => {
  assert.equal(normalizeTelegramGroup('https://t.me/mygroup'), 'mygroup');
});

test('normalizeTelegramGroup handles @ prefix', () => {
  assert.equal(normalizeTelegramGroup('@mygroup'), 'mygroup');
});

test('normalizeTelegramGroup rejects too short', () => {
  assert.equal(normalizeTelegramGroup('ab'), null);
});

test('normalizeTelegramGroup rejects empty', () => {
  assert.equal(normalizeTelegramGroup(''), null);
});

test('normalizeTelegramGroup rejects null', () => {
  assert.equal(normalizeTelegramGroup(null), null);
});

test('parseMemberCount extracts count from "2,105 members"', () => {
  assert.equal(parseMemberCount('2,105 members'), 2105);
});

test('parseMemberCount handles spaced numbers', () => {
  assert.equal(parseMemberCount('12 345 members'), 12345);
});

test('parseMemberCount returns null for wrong label', () => {
  assert.equal(parseMemberCount('500 subscribers'), null);
});

test('parseMemberCount returns null for no numbers', () => {
  assert.equal(parseMemberCount('no numbers here'), null);
});
