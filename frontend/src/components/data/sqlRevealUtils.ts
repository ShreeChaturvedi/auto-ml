import type { SqlTokenType } from './sqlTokenize';

export const TOKEN_CLASS_BY_TYPE: Record<SqlTokenType, string> = {
  keyword: 'sql-tk-kw',
  function: 'sql-tk-fn',
  string: 'sql-tk-str',
  number: 'sql-tk-num',
  operator: 'sql-tk-op',
  punctuation: 'sql-tk-punc',
  identifier: 'sql-tk-id',
  whitespace: ''
};

export const GENERATION_STATUS_STEPS = [
  'Interpreting intent and target metrics',
  'Mapping schema entities and relationships',
  'Synthesizing read-only SQL draft',
  'Running safety and syntax validation',
] as const;

export const GENERATION_SKELETON_WIDTHS = [92, 74, 86, 62, 79, 68] as const;

export function tokenClassName(type: SqlTokenType): string {
  return TOKEN_CLASS_BY_TYPE[type] ?? '';
}

/** Inline color map for dimmed placeholder tokens (alpha-channel dimming). */
export const TOKEN_INLINE_COLORS: Record<SqlTokenType, string> = {
  keyword:     'hsl(var(--syn-keyword) / 0.6)',
  function:    'hsl(var(--syn-function) / 0.6)',
  string:      'hsl(var(--syn-string) / 0.6)',
  number:      'hsl(var(--syn-number) / 0.6)',
  operator:    'hsl(var(--syn-operator) / 0.45)',
  punctuation: 'hsl(var(--syn-punctuation) / 0.45)',
  identifier:  'hsl(var(--syn-identifier) / 0.45)',
  whitespace:  'transparent',
};
