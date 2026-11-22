export function parseBookLocation(value) {
  const match = String(value).trim().match(/^(\d+)(?::(\d+)(?:\.(\d+))?)?$/);
  if (!match) return null;

  const [, paper, section, paragraph] = match;
  return {
    paperId: Number(paper),
    sectionNum: section === undefined ? null : Number(section),
    paragraphNum: paragraph === undefined ? null : Number(paragraph),
  };
}

export function resolveParagraph(paragraphs, location) {
  if (location.paragraphNum !== null) {
    return paragraphs.find((paragraph) =>
      paragraph.sectionNum === location.sectionNum && paragraph.num === location.paragraphNum,
    ) ?? null;
  }

  if (location.sectionNum !== null) {
    return paragraphs.find((paragraph) => paragraph.sectionNum === location.sectionNum) ?? null;
  }

  return paragraphs[0] ?? null;
}
