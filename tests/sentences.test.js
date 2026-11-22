import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSentences } from '../web/src/sentences.js';

test('splits Russian sentences without losing punctuation', () => {
  const text = 'Первое предложение. Второе предложение! Третье?';
  assert.deepEqual(splitSentences(text).map(([from, to]) => text.slice(from, to)), [
    'Первое предложение.',
    'Второе предложение!',
    'Третье?',
  ]);
});

test('keeps abbreviations followed by lowercase text in one sentence', () => {
  const text = 'См. т. е. пример. Дальше.';
  assert.deepEqual(splitSentences(text).map(([from, to]) => text.slice(from, to)), [
    'См. т. е. пример.',
    'Дальше.',
  ]);
});

test('recognizes English sentence boundaries after closing quotes', () => {
  const text = 'He said, “Read this.” Then he left.';
  assert.deepEqual(splitSentences(text).map(([from, to]) => text.slice(from, to)), [
    'He said, “Read this.”',
    'Then he left.',
  ]);
});

test('returns no empty sentence for whitespace-only text', () => {
  assert.deepEqual(splitSentences(' \n  '), []);
});
