import { describe, expect, it } from 'vitest';

import { quoteSqlIdentifier, withSqlIdentifierHint } from '../sqlIdentifiers';

describe('sqlIdentifiers', () => {
  describe('quoteSqlIdentifier', () => {
    it('returns safe identifiers without quotes', () => {
      expect(quoteSqlIdentifier('employees_table')).toBe('employees_table');
    });

    it('quotes identifiers with spaces and special characters', () => {
      expect(quoteSqlIdentifier('First Name')).toBe('"First Name"');
      expect(quoteSqlIdentifier('Revenue ($)')).toBe('"Revenue ($)"');
    });

    it('escapes double quotes inside identifiers', () => {
      expect(quoteSqlIdentifier('Employee "Level"')).toBe('"Employee ""Level"""');
    });
  });

  describe('withSqlIdentifierHint', () => {
    it('adds quoted-identifier hint for likely SQL identifier errors', () => {
      const message = withSqlIdentifierHint(
        'column "First" does not exist',
        'sql',
        'mu_extract_employees'
      );

      expect(message).toContain('column "First" does not exist');
      expect(message).toContain('SELECT "First Name" FROM mu_extract_employees LIMIT 100');
    });

    it('does not add hint for non-SQL mode', () => {
      const message = withSqlIdentifierHint('column "First" does not exist', 'english');
      expect(message).toBe('column "First" does not exist');
    });
  });
});
