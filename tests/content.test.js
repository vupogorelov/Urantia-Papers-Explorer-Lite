import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('generated Lite book has the complete 197-paper manifest', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'book/generated/manifest.json'), 'utf8'));
  assert.equal(manifest.format, 'upexplorer-book');
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.enSource, 'UB-USGNY-EN-RUS-001-2017.md');
  assert.equal(manifest.ruSource, 'UF-RUS-001-1997-1.5.md');
  assert.match(manifest.sources.enSha256, /^[\da-f]{64}$/);
  assert.match(manifest.sources.ruSha256, /^[\da-f]{64}$/);
  assert.deepEqual(manifest.counts, { parts: 4, papers: 197, sections: 1626, paragraphs: 14586 });

  const files = await readdir(resolve(root, 'book/generated/papers'));
  assert.equal(files.length, 197);

  const toc = JSON.parse(await readFile(resolve(root, 'book/generated/toc.json'), 'utf8'));
  assert.equal(toc.papers.length, 197);
  assert.equal(toc.papers.reduce((sum, paper) => sum + paper.paragraphCount, 0), manifest.counts.paragraphs);
});

test('every generated paper has RU and EN text and unique paragraph references', async () => {
  const files = await readdir(resolve(root, 'book/generated/papers'));
  const refs = new Set();

  for (const file of files) {
    const paper = JSON.parse(await readFile(resolve(root, 'book/generated/papers', file), 'utf8'));
    assert.ok(paper.paragraphs.length > 0, file);
    for (const paragraph of paper.paragraphs) {
      assert.match(paragraph.ref, /^\d+:\d+\.\d+$/);
      assert.ok(paragraph.plainRu.trim(), paragraph.ref);
      assert.ok(paragraph.plainEn.trim(), paragraph.ref);
      assert.ok(!refs.has(paragraph.ref), `duplicate ${paragraph.ref}`);
      refs.add(paragraph.ref);
    }
  }

  assert.equal(refs.size, 14586);
});
