// @ts-check
// Parses the USGNY bilingual Markdown (EPUB export) into parts / papers / sections / paragraphs.
// Layout: every Russian paragraph line is immediately followed by its English line, which
// carries the canonical reference: `***5:1.3 (63.1)*** <a id="..."></a>English text`.

/**
 * @typedef {{ id: number, titleRu: string, titleEn: string, subtitleRu: string | null }} Part
 * @typedef {{ id: number, partId: number, titleRu: string, titleEn: string }} Paper
 * @typedef {{ paperId: number, num: number, titleRu: string | null, titleEn: string | null }} Section
 * @typedef {{
 *   ref: string, seq: number, paperId: number, sectionNum: number, num: number, pageRef: string,
 *   htmlRu: string, htmlEn: string, plainRu: string, plainEn: string, line: number
 * }} Paragraph
 * @typedef {{ line: number, level: 'error' | 'warning' | 'info', message: string }} Issue
 * @typedef {{ parts: Part[], papers: Paper[], sections: Section[], paragraphs: Paragraph[], issues: Issue[] }} Book
 */

// The source has no English part titles.
const PART_TITLES_EN = [
  '',
  'The Central and Superuniverses',
  'The Local Universe',
  'The History of Urantia',
  'The Life and Teachings of Jesus',
];
/** @type {Record<string, number>} */
const ROMAN = { I: 1, II: 2, III: 3, IV: 4 };

const PART_TITLE = /^### Часть (I|II|III|IV)\.\s+(.+)$/;
const PART_MARK = /^## Чст (I|II|III|IV) - /;
const PAPER_HEAD = /^### (?:Текст (\d+) -- (.+)|Предисловие)$/;
const EN_HEAD = /^<a id="[^"]*-p(\d{3})s(\d+)"><\/a>\*\*(.+)\*\*$/;
const EN_PARA = /^\*\*\*(\d+):(\d+)\.(\d+) (\(?)(\d+\.\d+)\)\*\*\* (.*)$/;
const ANCHOR = /<a id="[^"]*"><\/a>/g;
const NOISE = [
  /^<a id="[^"]*"><\/a>$/, // standalone anchor
  /^# /, // "# Книга Урантии" before every paper
  /^---$/,
  /^\*\*(Раздел|Sections)\*\*$/,
  /^### Названия Текст$/, // part TOC heading
  /^- \[/, // per-paper section TOC
  /^\[Чст I\]\(/, // part navigation bar
  /^\\$/, // EPUB line-break remnant
  /^(\\\* ?)+$/, // closing "* * * * *"
];
const SECTION_NUMBER = /^[0-9IVXХ]+\.\s+/; // the Russian TOC uses Cyrillic "Х" for 10

/**
 * Converts the inline Markdown used by the source (only `*italic*` and backslash escapes)
 * into minimal HTML plus the plain text. Invariant: textContent(html) === plain, so
 * annotation offsets computed on `plain` map directly onto rendered text nodes.
 * @param {string} md
 * @returns {{ html: string, plain: string, unbalanced: boolean }}
 */
export function convertInline(md) {
  const src = md.replace(ANCHOR, '').trim();
  let html = '';
  let plain = '';
  let italic = false;
  for (let i = 0; i < src.length; i++) {
    let ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      ch = src[++i];
    } else if (ch === '*') {
      html += italic ? '</i>' : '<i>';
      italic = !italic;
      continue;
    }
    plain += ch;
    html += ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;
  }
  if (italic) html += '</i>';
  return { html, plain, unbalanced: italic };
}

/** @param {string} md */
function headingText(md) {
  return convertInline(md.replace(/^\*\*|\*\*$/g, '')).plain;
}

/**
 * @param {string} text
 * @returns {Book}
 */
export function parseBook(text) {
  const lines = text.split(/\r?\n/);
  /** @type {Book} */
  const book = { parts: [], papers: [], sections: [], paragraphs: [], issues: [] };
  /** @param {number} line @param {Issue['level']} level @param {string} message */
  const issue = (line, level, message) => book.issues.push({ line, level, message });

  /** @type {Part | null} */ let partInPreamble = null;
  /** @type {string[]} */ let subtitle = [];
  let partId = 0;
  /** @type {Paper | null} */ let paper = null;
  let sectionNum = 0;
  /** @type {{ text: string, line: number }[]} */ let pending = [];
  /** @type {[number, number, number] | null} */ let prevRef = null;

  const closePreamblePart = () => {
    if (partInPreamble) partInPreamble.subtitleRu = subtitle.join('\n') || null;
    partInPreamble = null;
    subtitle = [];
  };
  /** @param {string} where */
  const flushUnexpected = (where) => {
    for (const p of pending) issue(p.line, 'error', `Unpaired line ${where}: ${p.text.slice(0, 80)}`);
    pending = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const line = lines[i].trim();
    if (!line) continue;

    let m;
    if ((m = line.match(PART_MARK))) {
      partId = ROMAN[m[1]];
      continue;
    }

    if (!paper && !PAPER_HEAD.test(line)) {
      // Preamble: only the part titles and their subtitles are of interest.
      if ((m = line.match(PART_TITLE))) {
        closePreamblePart();
        const id = ROMAN[m[1]];
        partInPreamble = { id, titleRu: m[2].trim(), titleEn: PART_TITLES_EN[id], subtitleRu: null };
        book.parts.push(partInPreamble);
      } else if (partInPreamble && (line.startsWith('#') || line.startsWith('<a '))) {
        closePreamblePart();
      } else if (partInPreamble) {
        const s = line.replace(/\s*\\$/, '').trim();
        if (s) subtitle.push(convertInline(s).plain);
      }
      continue;
    }

    if ((m = line.match(PAPER_HEAD))) {
      closePreamblePart();
      flushUnexpected('before paper heading');
      const id = m[1] ? Number(m[1]) : 0;
      if (paper && id !== paper.id + 1) issue(ln, 'warning', `Paper ${id} follows paper ${paper.id}`);
      if (!partId) issue(ln, 'error', `Paper ${id} has no part`);
      paper = { id, partId, titleRu: m[2]?.trim() ?? 'Предисловие', titleEn: '' };
      book.papers.push(paper);
      book.sections.push({ paperId: id, num: 0, titleRu: null, titleEn: null });
      sectionNum = 0;
      continue;
    }
    if (!paper) continue; // unreachable: preamble branch above, keeps the type checker happy

    if ((m = line.match(EN_HEAD))) {
      const [, p, s, enMd] = m;
      if (Number(p) !== paper.id) issue(ln, 'error', `Heading anchor for paper ${Number(p)} inside paper ${paper.id}`);
      const ru = pending.shift();
      flushUnexpected(`before heading ${p}:${s}`);
      if (!ru) issue(ln, 'error', `Heading without Russian counterpart: ${enMd}`);
      const num = Number(s);
      if (num === 0) {
        paper.titleEn = headingText(enMd).replace(/^Paper \d+ -- /, '');
      } else {
        if (num !== sectionNum + 1) issue(ln, 'warning', `Section ${paper.id}:${num} follows ${paper.id}:${sectionNum}`);
        sectionNum = num;
        book.sections.push({
          paperId: paper.id,
          num,
          titleRu: ru ? headingText(ru.text).replace(SECTION_NUMBER, '') : null,
          titleEn: headingText(enMd).replace(SECTION_NUMBER, ''),
        });
      }
      continue;
    }

    if ((m = line.match(EN_PARA))) {
      const [, p, s, n, paren, pageRef, enMd] = m;
      const ref = `${p}:${s}.${n}`;
      /** @type {[number, number, number]} */
      const cur = [Number(p), Number(s), Number(n)];
      if (!paren) issue(ln, 'info', `${ref}: missing "(" before page reference — tolerated`);
      if (cur[0] !== paper.id || cur[1] !== sectionNum) {
        issue(ln, 'error', `${ref} is inside paper ${paper.id} section ${sectionNum}`);
      }
      if (prevRef && !(cur[0] !== prevRef[0] || cur[1] !== prevRef[1] || cur[2] === prevRef[2] + 1)) {
        issue(ln, 'warning', `${ref} follows ${prevRef[0]}:${prevRef[1]}.${prevRef[2]} (order kept as in source)`);
      }
      prevRef = cur;

      const ru = pending.shift();
      flushUnexpected(`before ${ref}`);
      if (!ru) issue(ln, 'error', `${ref} has no Russian paragraph`);
      const ruConv = convertInline(ru?.text ?? '');
      const enConv = convertInline(enMd);
      if (ruConv.unbalanced) issue(ru?.line ?? ln, 'warning', `${ref} RU: unbalanced "*"`);
      if (enConv.unbalanced) issue(ln, 'warning', `${ref} EN: unbalanced "*"`);

      book.paragraphs.push({
        ref,
        seq: book.paragraphs.length + 1,
        paperId: cur[0],
        sectionNum: cur[1],
        num: cur[2],
        pageRef,
        htmlRu: ruConv.html,
        htmlEn: enConv.html,
        plainRu: ruConv.plain,
        plainEn: enConv.plain,
        line: ln,
      });
      continue;
    }

    if (NOISE.some((re) => re.test(line))) continue;
    // A Russian paragraph or heading; consumed by the English line that follows it.
    pending.push({ text: line, line: ln });
  }
  flushUnexpected('at end of file');

  // Integrity checks.
  const seen = new Set();
  for (const p of book.paragraphs) {
    if (seen.has(p.ref)) issue(p.line, 'error', `Duplicate reference ${p.ref}`);
    seen.add(p.ref);
  }
  for (const pp of book.papers) {
    if (!pp.titleEn) issue(0, 'error', `Paper ${pp.id} has no English title`);
  }
  return book;
}
