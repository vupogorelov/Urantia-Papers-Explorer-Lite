import test from 'node:test';
import assert from 'node:assert/strict';
import { locateProgress } from '../web/src/progress.js';

const papers = [
  { id: 0, paragraphCount: 3 },
  { id: 1, paragraphCount: 2 },
  { id: 2, paragraphCount: 5 },
];

test('maps slider endpoints and paper boundaries to local paragraph offsets', () => {
  assert.deepEqual(locateProgress(papers, 0), { paperId: 0, paragraphOffset: 0 });
  assert.deepEqual(locateProgress(papers, 300), { paperId: 1, paragraphOffset: 0 });
  assert.deepEqual(locateProgress(papers, 500), { paperId: 2, paragraphOffset: 0 });
  assert.deepEqual(locateProgress(papers, 1000), { paperId: 2, paragraphOffset: 4 });
});

test('clamps slider values and skips papers without paragraphs', () => {
  const withEmptyPaper = [{ id: 1, paragraphCount: 0 }, ...papers];
  assert.deepEqual(locateProgress(withEmptyPaper, -10), { paperId: 0, paragraphOffset: 0 });
  assert.deepEqual(locateProgress(withEmptyPaper, 1200), { paperId: 2, paragraphOffset: 4 });
  assert.equal(locateProgress([{ id: 0, paragraphCount: 0 }], 400), null);
  assert.equal(locateProgress(papers, Number.NaN), null);
});
