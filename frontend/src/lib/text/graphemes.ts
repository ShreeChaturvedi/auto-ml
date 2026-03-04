let segmenter: Intl.Segmenter | null = null;

function getSegmenter(): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter === 'undefined') {
    return null;
  }

  if (!segmenter) {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  }

  return segmenter;
}

export function splitGraphemes(text: string): string[] {
  const activeSegmenter = getSegmenter();
  if (!activeSegmenter) {
    return Array.from(text);
  }

  return Array.from(activeSegmenter.segment(text), ({ segment }) => segment);
}
