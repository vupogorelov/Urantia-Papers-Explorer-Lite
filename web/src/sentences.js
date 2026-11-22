export function splitSentences(text) {
  const out = [];
  const re = /[.!?…]+[»"”')\]]*(\s+)(?=[«"„“(\-–—]?\s*[\p{Lu}\d])/gu;
  let start = 0;
  for (const match of text.matchAll(re)) {
    const end = match.index + match[0].length - match[1].length;
    out.push([start, end]);
    start = end + match[1].length;
  }
  if (start < text.length) out.push([start, text.length]);
  return out.filter(([from, to]) => text.slice(from, to).trim());
}
