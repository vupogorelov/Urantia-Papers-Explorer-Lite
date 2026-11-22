import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBookLocation, resolveParagraph } from '../web/src/navigation.js';

const paragraphs = [
  { ref: '5:0.1', sectionNum: 0, num: 1 },
  { ref: '5:1.1', sectionNum: 1, num: 1 },
  { ref: '5:1.2', sectionNum: 1, num: 2 },
  { ref: '5:2.1', sectionNum: 2, num: 1 },
];

test('parses paper, section, and paragraph locations', () => {
  assert.deepEqual(parseBookLocation('5'), { paperId: 5, sectionNum: null, paragraphNum: null });
  assert.deepEqual(parseBookLocation('5:1'), { paperId: 5, sectionNum: 1, paragraphNum: null });
  assert.deepEqual(parseBookLocation('5:1.3'), { paperId: 5, sectionNum: 1, paragraphNum: 3 });
  assert.deepEqual(parseBookLocation('0:0.1'), { paperId: 0, sectionNum: 0, paragraphNum: 1 });
});

test('rejects malformed or partial locations', () => {
  for (const value of ['', '5:', '5:1.', '-1', 'five', '5:1.2.3']) {
    assert.equal(parseBookLocation(value), null, value);
  }
});

test('resolves an exact paragraph or the first paragraph of a section or paper', () => {
  assert.equal(resolveParagraph(paragraphs, parseBookLocation('5:1.2')).ref, '5:1.2');
  assert.equal(resolveParagraph(paragraphs, parseBookLocation('5:1')).ref, '5:1.1');
  assert.equal(resolveParagraph(paragraphs, parseBookLocation('5')).ref, '5:0.1');
  assert.equal(resolveParagraph(paragraphs, parseBookLocation('5:9')), null);
});
