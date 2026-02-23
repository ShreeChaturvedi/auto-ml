import { describe, it, expect } from 'vitest';

import { validateReadOnlySql, type ValidateSqlOptions } from './sqlValidator.js';

describe('sqlValidator', () => {
  const defaultOptions: ValidateSqlOptions = {
    defaultLimit: 1000,
    maxRows: 10000
  };

  describe('validateReadOnlySql', () => {
    describe('valid SELECT statements', () => {
      it('allows simple SELECT statement', () => {
        const result = validateReadOnlySql('SELECT * FROM users', defaultOptions);
        expect(result.normalizedSql).toContain('SELECT * FROM users');
        expect(result.limitAppended).toBe(true);
      });

      it('allows SELECT with existing LIMIT', () => {
        const result = validateReadOnlySql('SELECT * FROM users LIMIT 10', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM users LIMIT 10');
        expect(result.limitAppended).toBe(false);
      });

      it('allows CTE/WITH statements', () => {
        const sql = 'WITH cte AS (SELECT * FROM users) SELECT * FROM cte';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('WITH cte AS');
        expect(result.limitAppended).toBe(true);
      });

      it('allows SELECT with JOIN', () => {
        const sql = 'SELECT u.*, p.name FROM users u JOIN projects p ON u.id = p.user_id';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('JOIN projects');
      });

      it('allows SELECT with WHERE clause', () => {
        const sql = 'SELECT * FROM users WHERE active = true';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('WHERE active');
      });

      it('allows SELECT with ORDER BY', () => {
        const sql = 'SELECT * FROM users ORDER BY created_at DESC';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('ORDER BY');
      });

      it('allows SELECT with GROUP BY and HAVING', () => {
        const sql = 'SELECT status, COUNT(*) FROM orders GROUP BY status HAVING COUNT(*) > 5';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('GROUP BY status');
      });

      it('trims whitespace', () => {
        const result = validateReadOnlySql('  SELECT * FROM users  ', defaultOptions);
        expect(result.normalizedSql).not.toMatch(/^\s+/);
      });
    });

    describe('LIMIT handling', () => {
      it('appends LIMIT when not present', () => {
        const result = validateReadOnlySql('SELECT * FROM users', defaultOptions);
        expect(result.normalizedSql).toContain('LIMIT 1000');
        expect(result.limitAppended).toBe(true);
      });

      it('uses custom defaultLimit from options', () => {
        const options: ValidateSqlOptions = { defaultLimit: 500, maxRows: 10000 };
        const result = validateReadOnlySql('SELECT * FROM users', options);
        expect(result.normalizedSql).toContain('LIMIT 500');
      });

      it('does not append LIMIT when already present (lowercase)', () => {
        const result = validateReadOnlySql('SELECT * FROM users limit 50', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM users limit 50');
        expect(result.limitAppended).toBe(false);
      });

      it('does not append LIMIT when already present (uppercase)', () => {
        const result = validateReadOnlySql('SELECT * FROM users LIMIT 50', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM users LIMIT 50');
        expect(result.limitAppended).toBe(false);
      });
    });

    describe('comment handling', () => {
      it('allows queries with line comments', () => {
        const sql = '-- This is a comment\nSELECT * FROM users';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('SELECT * FROM users');
      });

      it('allows queries with block comments', () => {
        const sql = '/* This is a block comment */ SELECT * FROM users';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('SELECT * FROM users');
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
        const sql = 'SELECT * FROM users WHERE 1=1; INSERT INTO users VALUES (1)';
        // Keyword check happens before semicolon check
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: INSERT');
      });

      it('rejects SELECT with embedded DELETE', () => {
        const sql = 'SELECT * FROM (DELETE FROM users RETURNING *)';
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: DELETE');
      });

      it('rejects SELECT with embedded UPDATE', () => {
        const sql = 'SELECT * FROM users; UPDATE users SET admin = true';
        // Keyword check happens before semicolon check
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: UPDATE');
      });

      it('rejects SELECT with subquery containing DROP', () => {
        const sql = "SELECT * FROM users WHERE id IN (SELECT 1; DROP TABLE users)";
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
        const result = validateReadOnlySql('select * from users', defaultOptions);
        expect(result.normalizedSql).toContain('select * from users');
      });

      it('allows mixed case SELECT', () => {
        const result = validateReadOnlySql('SeLeCt * FrOm users', defaultOptions);
        expect(result.normalizedSql).toContain('SeLeCt * FrOm users');
      });

      it('detects lowercase dangerous keywords', () => {
        expect(() => validateReadOnlySql('SELECT * FROM users; delete from users', defaultOptions))
          .toThrow();
      });
    });
  });
});
