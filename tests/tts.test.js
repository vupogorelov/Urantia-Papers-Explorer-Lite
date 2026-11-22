import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PRONUNCIATIONS } from '../web/src/pronunciation-defaults.js';
import { replaceWithDictionary } from '../web/src/tts.js';

test('bundles all Russian pronunciation corrections from the source project', () => {
  assert.equal(DEFAULT_PRONUNCIATIONS.length, 26);
  assert.ok(DEFAULT_PRONUNCIATIONS.every((rule) => rule.lang === 'ru'));
});

test('applies source corrections at the start of a word and preserves its casing', () => {
  const rule = DEFAULT_PRONUNCIATIONS.find((entry) => entry.word === 'Небадон');
  assert.ok(rule);
  assert.equal(replaceWithDictionary('Небадона и небадон', [rule], 'ru'), 'Неба́дона и неба́дон');
});

test('keeps user dictionary rules limited to whole-word matches', () => {
  const rule = { id: 'custom-1', lang: 'ru', word: 'Небадон', say: 'Неба́дон' };
  assert.equal(replaceWithDictionary('Небадон Небадона', [rule], 'ru'), 'Неба́дон Небадона');
});
