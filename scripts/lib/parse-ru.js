// @ts-check
// Parser of the Russian-only translation (Urantia Foundation, "UF-RUS-001-1997" markdown export).
// Paragraphs: `<a name="U5_1_3"></a>*5:1.3 (62.5)* text…` — one per line; paper titles:
// `## <a name="U5_0_0"></a>Title`; section titles: `### <a name="U5_1_0"></a>1&#8228;&#160;Title`.
// Some anchored lines carry no "*ref (page)*" label: separators ("* * *") and the Foreword's
// "ПРИМЕЧАНИЕ" heading. They are kept as `decor` entries; the importer decides what they match.

const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' });

/** @param {string} s */
function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
/** @param {string} s */
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Markdown-ish inline text → the app's paragraph HTML (`<i>`, `<sup>`) and plain text.
 * Leading indentation is dropped. The plain text equals the HTML's textContent (offsets of notes
 * are counted in it).
 * @param {string} src
 */
export function inline(src) {
  let html = '';
  let plain = '';
  let italic = false;
  const text = src.replace(/^(?:\s|&#160;|&nbsp;)+/, '').replace(/(?:\s|&#160;|&nbsp;)+$/, '');
  for (const m of text.matchAll(/<sup>(.*?)<\/sup>|\*|[^*<]+|</g)) {
    if (m[0] === '*') {
      html += italic ? '</i>' : '<i>';
      italic = !italic;
    } else if (m[1] !== undefined) {
      const t = decode(m[1]);
      html += `<sup>${escapeHtml(t)}</sup>`;
      plain += t;
    } else {
      const t = decode(m[0]);
      html += escapeHtml(t);
      plain += t;
    }
  }
  if (italic) html += '</i>';
  return { html: html.replace(/<i><\/i>/g, ''), plain };
}

/**
 * @typedef {{ anchor: string, label: string | null, page: string | null, html: string, plain: string, line: number }} Entry
 * @param {string} text
 * @returns {{ sections: Map<string, Entry[]>, papers: Map<number, string>, titles: Map<string, string>, issues: { line: number, message: string }[] }}
 * `sections`: "paper:section" → its anchored lines in order (labelled paragraphs and decor lines).
 */
export function parseRu(text) {
  /** @type {Map<string, Entry[]>} */ const sections = new Map();
  /** @type {Map<number, string>} */ const papers = new Map();
  /** @type {Map<string, string>} */ const titles = new Map();
  /** @type {{ line: number, message: string }[]} */ const issues = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    let m = raw.match(/^<a name="U(\d+)_(\d+)_(\d+)"><\/a>(.*)$/);
    if (m && m[3] !== '0') {
      const [, p, s, n, rest] = m;
      const anchor = `${+p}:${+s}.${+n}`;
      const lab = rest.match(/^\*(\d+):(\d+)\.(\d+) \(([^)]*)\)\* ?(.*)$/);
      const entry = lab
        ? { anchor, label: `${+lab[1]}:${+lab[2]}.${+lab[3]}`, page: lab[4], ...inline(lab[5]), line }
        : { anchor, label: null, page: null, ...inline(rest), line };
      if (entry.label && entry.label !== anchor) issues.push({ line, message: `anchor ${anchor} vs label ${entry.label}` });
      const key = `${+p}:${+s}`;
      if (!sections.has(key)) sections.set(key, []);
      /** @type {Entry[]} */ (sections.get(key)).push(entry);
      return;
    }
    m = raw.match(/^## <a name="U(\d+)_0_0"><\/a>(.+)$/);
    if (m) {
      papers.set(+m[1], decode(m[2]).trim());
      return;
    }
    m = raw.match(/^### <a name="U(\d+)_(\d+)_0"><\/a>(.+)$/);
    if (m) {
      // "1&#8228;&#160;Приближение к Богу" → "Приближение к Богу"; "9 и 10&#8228; …" → "9 и 10. …"
      const t = decode(m[3]).replace(/ /g, ' ').trim();
      titles.set(`${+m[1]}:${+m[2]}`, /^\d+\s*[․.]\s/.test(t) ? t.replace(/^\d+\s*[․.]\s*/, '') : t.replace(/․/g, '.'));
    }
  });
  return { sections, papers, titles, issues };
}
