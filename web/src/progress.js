/** @typedef {{ id: number, paragraphCount?: number }} PaperProgressEntry */

/**
 * Maps the book-wide progress slider value (0–1000) to a local paragraph offset.
 * @param {PaperProgressEntry[]} papers
 * @param {number} value
 * @returns {{ paperId: number, paragraphOffset: number } | null}
 */
export function locateProgress(papers, value) {
  const total = papers.reduce((sum, paper) => sum + (paper.paragraphCount ?? 0), 0);
  if (!total || !Number.isFinite(value)) return null;

  let offset = Math.min(total - 1, Math.max(0, Math.floor((value / 1000) * total)));
  for (const paper of papers) {
    const count = paper.paragraphCount ?? 0;
    if (offset < count) return { paperId: paper.id, paragraphOffset: offset };
    offset -= count;
  }
  return null;
}
