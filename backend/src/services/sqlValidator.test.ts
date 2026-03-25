import { describe, it, expect } from 'vitest';

import { extractTableReferences, validateReadOnlySql, type ValidateSqlOptions } from './sqlValidator.js';

describe('sqlValidator', () => {
  const defaultOptions: ValidateSqlOptions = {
    defaultLimit: 1000,
    maxRows: 10000
  };

  describe('validateReadOnlySql', () => {
    describe('valid SELECT statements', () => {
      it('allows simple SELECT statement', () => {
        const result = validateReadOnlySql('SELECT * FROM dataset_records', defaultOptions);
        expect(result.normalizedSql).toContain('SELECT * FROM dataset_records');
        expect(result.limitAppended).toBe(true);
      });

      it('allows SELECT with existing LIMIT', () => {
        const result = validateReadOnlySql('SELECT * FROM dataset_records LIMIT 10', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM dataset_records LIMIT 10');
        expect(result.limitAppended).toBe(false);
      });

      it('allows trailing semicolon for single statements', () => {
        const result = validateReadOnlySql('SELECT * FROM dataset_records LIMIT 10;', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM dataset_records LIMIT 10');
        expect(result.limitAppended).toBe(false);
      });

      it('allows CTE/WITH statements', () => {
        const sql = 'WITH cte AS (SELECT * FROM dataset_records) SELECT * FROM cte';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('WITH cte AS');
        expect(result.limitAppended).toBe(true);
      });

      it('allows SELECT with JOIN', () => {
        const sql = 'SELECT d.*, p.name FROM dataset_records d JOIN projects p ON d.id = p.dataset_id';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('JOIN projects');
      });

      it('allows SELECT with WHERE clause', () => {
        const sql = 'SELECT * FROM dataset_records WHERE active = true';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('WHERE active');
      });

      it('allows SELECT with ORDER BY', () => {
        const sql = 'SELECT * FROM dataset_records ORDER BY created_at DESC';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('ORDER BY');
      });

      it('allows SELECT with GROUP BY and HAVING', () => {
        const sql = 'SELECT status, COUNT(*) FROM orders GROUP BY status HAVING COUNT(*) > 5';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('GROUP BY status');
      });

      it('trims whitespace', () => {
        const result = validateReadOnlySql('  SELECT * FROM dataset_records  ', defaultOptions);
        expect(result.normalizedSql).not.toMatch(/^\s+/);
      });
    });

    describe('LIMIT handling', () => {
      it('appends LIMIT when not present', () => {
        const result = validateReadOnlySql('SELECT * FROM dataset_records', defaultOptions);
        expect(result.normalizedSql).toContain('LIMIT 1000');
        expect(result.limitAppended).toBe(true);
      });

      it('uses custom defaultLimit from options', () => {
        const options: ValidateSqlOptions = { defaultLimit: 500, maxRows: 10000 };
        const result = validateReadOnlySql('SELECT * FROM dataset_records', options);
        expect(result.normalizedSql).toContain('LIMIT 500');
      });

      it('does not append LIMIT when already present (lowercase)', () => {
        const result = validateReadOnlySql('SELECT * FROM dataset_records limit 50', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM dataset_records limit 50');
        expect(result.limitAppended).toBe(false);
      });

      it('does not append LIMIT when already present (uppercase)', () => {
        const result = validateReadOnlySql('SELECT * FROM dataset_records LIMIT 50', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM dataset_records LIMIT 50');
        expect(result.limitAppended).toBe(false);
      });
    });

    describe('comment handling', () => {
      it('allows queries with line comments', () => {
        const sql = '-- This is a comment\nSELECT * FROM dataset_records';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('SELECT * FROM dataset_records');
      });

      it('allows queries with block comments', () => {
        const sql = '/* This is a block comment */ SELECT * FROM dataset_records';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('SELECT * FROM dataset_records');
      });

      it('rejects query with only comments', () => {
        const sql = '-- This is only a comment';
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('SQL statement required');
      });
    });

    describe('invalid statements', () => {
      it('rejects empty SQL', () => {
        expect(() => validateReadOnlySql('', defaultOptions)).toThrow('SQL statement required');
      });

      it('rejects whitespace-only SQL', () => {
        expect(() => validateReadOnlySql('   ', defaultOptions)).toThrow('SQL statement required');
      });

      it('rejects INSERT statements', () => {
        expect(() => validateReadOnlySql('INSERT INTO users VALUES (1)', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects UPDATE statements', () => {
        expect(() => validateReadOnlySql('UPDATE users SET name = "foo"', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects DELETE statements', () => {
        expect(() => validateReadOnlySql('DELETE FROM users', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects DROP statements', () => {
        expect(() => validateReadOnlySql('DROP TABLE users', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects CREATE statements', () => {
        expect(() => validateReadOnlySql('CREATE TABLE test (id INT)', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects ALTER statements', () => {
        expect(() => validateReadOnlySql('ALTER TABLE users ADD COLUMN age INT', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects TRUNCATE statements', () => {
        expect(() => validateReadOnlySql('TRUNCATE TABLE users', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });
    });

    describe('SQL injection prevention', () => {
      it('rejects SELECT with embedded INSERT', () => {
        const sql = 'SELECT * FROM dataset_records WHERE 1=1; INSERT INTO users VALUES (1)';
        // Keyword check happens before semicolon check
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: INSERT');
      });

      it('rejects SELECT with embedded DELETE', () => {
        const sql = 'SELECT * FROM (DELETE FROM users RETURNING *)';
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: DELETE');
      });

      it('rejects SELECT with embedded UPDATE', () => {
        const sql = 'SELECT * FROM dataset_records; UPDATE users SET admin = true';
        // Keyword check happens before semicolon check
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: UPDATE');
      });

      it('rejects SELECT with subquery containing DROP', () => {
        const sql = "SELECT * FROM dataset_records WHERE id IN (SELECT 1; DROP TABLE users)";
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: DROP');
      });

      it('rejects multiple statements separated by semicolon', () => {
        const sql = 'SELECT 1; SELECT 2';
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('Multiple statements are not allowed');
      });

      it('rejects GRANT statements', () => {
        expect(() => validateReadOnlySql('GRANT ALL ON users TO public', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects REVOKE statements', () => {
        expect(() => validateReadOnlySql('REVOKE ALL ON users FROM public', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });
    });

    describe('case insensitivity', () => {
      it('allows lowercase select', () => {
        const result = validateReadOnlySql('select * from dataset_records', defaultOptions);
        expect(result.normalizedSql).toContain('select * from dataset_records');
      });

      it('allows mixed case SELECT', () => {
        const result = validateReadOnlySql('SeLeCt * FrOm dataset_records', defaultOptions);
        expect(result.normalizedSql).toContain('SeLeCt * FrOm dataset_records');
      });

      it('detects lowercase dangerous keywords', () => {
        expect(() => validateReadOnlySql('SELECT * FROM dataset_records; delete from dataset_records', defaultOptions))
          .toThrow();
      });
    });

    describe('blocked table access', () => {
      it('rejects SELECT from users table', () => {
        expect(() => validateReadOnlySql('SELECT * FROM users', defaultOptions))
          .toThrow("Access denied: queries against table 'users' are not permitted");
      });

      it('rejects SELECT of specific columns from users', () => {
        expect(() => validateReadOnlySql('SELECT email, password_hash FROM users', defaultOptions))
          .toThrow("Access denied: queries against table 'users' are not permitted");
      });

      it('rejects SELECT from refresh_tokens', () => {
        expect(() => validateReadOnlySql('SELECT * FROM refresh_tokens', defaultOptions))
          .toThrow("Access denied: queries against table 'refresh_tokens' are not permitted");
      });

      it('rejects SELECT from pg_tables', () => {
        expect(() => validateReadOnlySql('SELECT * FROM pg_tables', defaultOptions))
          .toThrow("Access denied: queries against table 'pg_tables' are not permitted");
      });

      it('rejects SELECT from information_schema.tables', () => {
        expect(() => validateReadOnlySql('SELECT * FROM information_schema.tables', defaultOptions))
          .toThrow("Access denied: queries against table 'information_schema.tables' are not permitted");
      });

      it('allows SELECT from a non-blocked dataset table', () => {
        const result = validateReadOnlySql('SELECT * FROM my_dataset_table', defaultOptions);
        expect(result.normalizedSql).toContain('my_dataset_table');
      });

      it('rejects CTE referencing a blocked table', () => {
        expect(() => validateReadOnlySql(
          'WITH cte AS (SELECT * FROM users) SELECT * FROM cte',
          defaultOptions
        )).toThrow("Access denied: queries against table 'users' are not permitted");
      });

      it('rejects JOIN with a blocked table', () => {
        expect(() => validateReadOnlySql(
          'SELECT d.* FROM my_dataset d JOIN users u ON d.user_id = u.id',
          defaultOptions
        )).toThrow("Access denied: queries against table 'users' are not permitted");
      });

      it('allows blocked table name when in allowedTables', () => {
        const opts = { ...defaultOptions, allowedTables: new Set(['users']) };
        const result = validateReadOnlySql('SELECT * FROM users', opts);
        expect(result.normalizedSql).toContain('users');
      });
    });
  });

  describe('extractTableReferences', () => {
    it('extracts simple FROM reference', () => {
      expect(extractTableReferences('SELECT * FROM my_table')).toEqual(['my_table']);
    });

    it('extracts JOIN references', () => {
      const tables = extractTableReferences('SELECT * FROM a JOIN b ON a.id = b.id');
      expect(tables).toContain('a');
      expect(tables).toContain('b');
    });

    it('extracts schema-qualified references', () => {
      expect(extractTableReferences('SELECT * FROM information_schema.tables'))
        .toEqual(['information_schema.tables']);
    });

    it('extracts quoted identifiers', () => {
      expect(extractTableReferences('SELECT * FROM "MyTable"')).toEqual(['mytable']);
    });
  });
});
