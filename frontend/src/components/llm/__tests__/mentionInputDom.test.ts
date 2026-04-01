import { describe, expect, it } from 'vitest';

import {
  buildMentionInputDOM,
  getMentionInputCursorPos,
  serializeMentionInputDOM,
  placeMentionInputCursorAt,
} from '@/components/llm/mentionInputDom';

describe('mentionInputDom', () => {
  it('round-trips rendered mention chips and restores selection offsets across a mention', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    try {
      root.appendChild(
        buildMentionInputDOM(
          'Ask @report.csv now',
          new Set(['report.csv']),
          new Map([['report.csv', 'csv']])
        )
      );

      expect(root.querySelector('[data-mention="report.csv"]')).toBeInTheDocument();
      expect(serializeMentionInputDOM(root)).toBe('Ask @report.csv now');

      const cursorOffset = 'Ask @report.csv'.length;
      placeMentionInputCursorAt(root, cursorOffset);

      expect(getMentionInputCursorPos(root)).toBe(cursorOffset);
    } finally {
      root.remove();
    }
  });

  it('renders a known mention chip for names containing spaces', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    try {
      root.appendChild(
        buildMentionInputDOM(
          'Review @Quarterly Report.csv today',
          new Set(['quarterly report.csv']),
          new Map([['quarterly report.csv', 'csv']])
        )
      );

      expect(root.querySelector('[data-mention="Quarterly Report.csv"]')).toBeInTheDocument();
      expect(serializeMentionInputDOM(root)).toBe('Review @Quarterly Report.csv today');
    } finally {
      root.remove();
    }
  });
});
