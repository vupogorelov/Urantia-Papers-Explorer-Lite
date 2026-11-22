// @ts-check
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';
import { parseBook } from './lib/parse-book.js';
import { parseRu } from './lib/parse-ru.js';

const lite = fileURLToPath(new URL('..', import.meta.url));
const englishSource = resolve(lite, 'book/sources/UB-USGNY-EN-RUS-001-2017.md');
const russianSource = resolve(lite, 'book/sources/UF-RUS-001-1997-1.5.md');
const args = process.argv.slice(2);
const sourceArg = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--ru');
const ruValue = args[args.indexOf('--ru') + 1];
const source = sourceArg ? resolve(sourceArg) : englishSource;
const ruPath = ruValue ? resolve(ruValue) : russianSource;

const [sourceText, ruText] = await Promise.all([readFile(source, 'utf8'), readFile(ruPath, 'utf8')]);
const book = parseBook(sourceText);
const ru = parseRu(ruText);

if (book.parts.length !== 4) book.issues.push({ line: 0, level: 'error', message: `Expected 4 parts, found ${book.parts.length}` });
if (book.papers.length !== 197) book.issues.push({ line: 0, level: 'error', message: `Expected 197 papers, found ${book.papers.length}` });

const errors = book.issues.filter((i) => i.level === 'error');
const problems = [];
const SECTION_IN_FILE = { '139:9': '139:10' };

for (const [key, rows] of Map.groupBy(book.paragraphs, (p) => `${p.paperId}:${p.sectionNum}`)) {
  const fileKey = SECTION_IN_FILE[key] ?? key;
  const entries = ru.sections.get(fileKey) ?? [];
  const labelled = entries.filter((e) => e.label);
  const use = labelled.length === rows.length ? labelled : entries.length === rows.length ? entries : null;
  if (!use) {
    problems.push(`${key}: ${rows.length} paragraphs in the book, ${labelled.length} labelled in the RU file`);
    continue;
  }
  rows.forEach((p, i) => {
    const entry = use[i];
    p.htmlRu = entry.html;
    p.plainRu = entry.plain;
    p.pageRef = entry.page ?? p.pageRef;
  });
}

const empty = book.paragraphs.filter((p) => !p.plainRu.trim()).map((p) => p.ref);
const ruIssues = ru.issues;
if (errors.length || problems.length || empty.length || ruIssues.length) {
  console.error('Content validation failed');
  for (const i of errors) console.error(`[error] line ${i.line}: ${i.message}`);
  for (const p of problems) console.error(`[ru mismatch] ${p}`);
  for (const p of empty.slice(0, 20)) console.error(`[empty ru] ${p}`);
  for (const i of ruIssues.slice(0, 20)) console.error(`[ru issue] line ${i.line}: ${i.message}`);
  process.exit(1);
}

const plainTitle = (title) => title.replace(/\s*([–—])\s*<br\s*\/?\s*>\s*/g, ' $1 ').replace(/\s*<br\s*\/?\s*>\s*/g, '. ');
for (const paper of book.papers) {
  const titleRu = ru.papers.get(paper.id);
  if (titleRu) paper.titleRu = plainTitle(titleRu);
}
for (const section of book.sections) {
  const key = `${section.paperId}:${section.num}`;
  const titleRu = ru.titles.get(SECTION_IN_FILE[key] ?? key);
  if (titleRu) section.titleRu = plainTitle(titleRu);
}

const out = resolve(lite, 'book/generated');
const assets = resolve(lite, 'android/app/src/main/assets/book');
await rm(out, { recursive: true, force: true });
await rm(assets, { recursive: true, force: true });
await mkdir(resolve(out, 'papers'), { recursive: true });
await mkdir(resolve(assets, 'papers'), { recursive: true });

const manifest = {
  format: 'upexplorer-book',
  formatVersion: 1,
  language: ['ru', 'en'],
  ruSource: basename(ruPath),
  enSource: basename(source),
  sources: {
    ruSha256: createHash('sha256').update(ruText).digest('hex'),
    enSha256: createHash('sha256').update(sourceText).digest('hex'),
  },
  counts: {
    parts: book.parts.length,
    papers: book.papers.length,
    sections: book.sections.length,
    paragraphs: book.paragraphs.length,
  },
};

const toc = {
  parts: book.parts,
  papers: book.papers.map((paper) => ({
    ...paper,
    paragraphCount: book.paragraphs.filter((paragraph) => paragraph.paperId === paper.id).length,
  })),
  sections: book.sections,
};

for (const paper of book.papers) {
  const paragraphs = book.paragraphs.filter((p) => p.paperId === paper.id);
  const sections = book.sections.filter((s) => s.paperId === paper.id);
  const paperJson = { paper, sections, paragraphs };
  const file = `paper-${paper.id}.json`;
  await writeFile(resolve(out, 'papers', file), JSON.stringify(paperJson, { ensureAscii: false }));
  await writeFile(resolve(assets, 'papers', file), JSON.stringify(paperJson, { ensureAscii: false }));
}

const tocText = JSON.stringify(toc, { ensureAscii: false });
const manifestText = JSON.stringify(manifest, { ensureAscii: false, indent: 2 }) + '\n';
await writeFile(resolve(out, 'toc.json'), tocText);
await writeFile(resolve(assets, 'toc.json'), tocText);
await writeFile(resolve(out, 'manifest.json'), manifestText);
await writeFile(resolve(assets, 'manifest.json'), manifestText);

console.log(`Built Lite book: ${manifest.counts.parts} parts, ${manifest.counts.papers} papers, ${manifest.counts.sections} sections, ${manifest.counts.paragraphs} paragraphs`);
console.log(`Generated: ${out}`);
console.log(`Android assets: ${assets}`);
console.log(`Warnings: ${book.issues.filter((i) => i.level === 'warning').length}`);
