import { describe, it, expect } from 'vitest';

import { extractTableReferences, validateReadOnlySql, type ValidateSqlOptions } from './sqlValidator.js';

describe('sqlValidator', () => {
  const defaultOptions: ValidateSqlOptions = {
    defaultLimit: 1000,
    maxRows: 10000
  };

  describe('validateReadOnlySql', () => {
    describe('valid SELECT statements', () => {
      it('allows simple SELECT on dataset table', () => {
        const result = validateReadOnlySql('SELECT * FROM sales_data', defaultOptions);
        expect(result.normalizedSql).toContain('SELECT * FROM sales_data');
        expect(result.limitAppended).toBe(true);
      });

      it('allows SELECT with existing LIMIT', () => {
        const result = validateReadOnlySql('SELECT * FROM sales_data LIMIT 10', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM sales_data LIMIT 10');
        expect(result.limitAppended).toBe(false);
      });

      it('allows trailing semicolon for single statements', () => {
        const result = validateReadOnlySql('SELECT * FROM sales_data LIMIT 10;', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM sales_data LIMIT 10');
        expect(result.limitAppended).toBe(false);
      });

      it('allows CTE/WITH statements on dataset tables', () => {
        const sql = 'WITH cte AS (SELECT * FROM sales_data) SELECT * FROM cte';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('WITH cte AS');
        expect(result.limitAppended).toBe(true);
      });

      it('allows SELECT with JOIN on dataset tables', () => {
        const sql = 'SELECT a.*, b.name FROM sales_data a JOIN customer_info b ON a.id = b.customer_id';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('JOIN customer_info');
      });

      it('allows SELECT with WHERE clause', () => {
        const sql = 'SELECT * FROM sales_data WHERE active = true';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('WHERE active');
      });

      it('allows SELECT with ORDER BY', () => {
        const sql = 'SELECT * FROM sales_data ORDER BY created_at DESC';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('ORDER BY');
      });

      it('allows SELECT with GROUP BY and HAVING', () => {
        const sql = 'SELECT status, COUNT(*) FROM orders_dataset GROUP BY status HAVING COUNT(*) > 5';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('GROUP BY status');
      });

      it('trims whitespace', () => {
        const result = validateReadOnlySql('  SELECT * FROM sales_data  ', defaultOptions);
        expect(result.normalizedSql).not.toMatch(/^\s+/);
      });
    });

    describe('LIMIT handling', () => {
      it('appends LIMIT when not present', () => {
        const result = validateReadOnlySql('SELECT * FROM sales_data', defaultOptions);
        expect(result.normalizedSql).toContain('LIMIT 1000');
        expect(result.limitAppended).toBe(true);
      });

      it('uses custom defaultLimit from options', () => {
        const options: ValidateSqlOptions = { defaultLimit: 500, maxRows: 10000 };
        const result = validateReadOnlySql('SELECT * FROM sales_data', options);
        expect(result.normalizedSql).toContain('LIMIT 500');
      });

      it('does not append LIMIT when already present (lowercase)', () => {
        const result = validateReadOnlySql('SELECT * FROM sales_data limit 50', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM sales_data limit 50');
        expect(result.limitAppended).toBe(false);
      });

      it('does not append LIMIT when already present (uppercase)', () => {
        const result = validateReadOnlySql('SELECT * FROM sales_data LIMIT 50', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM sales_data LIMIT 50');
        expect(result.limitAppended).toBe(false);
      });

      it('does not append LIMIT when already present with parentheses', () => {
        const result = validateReadOnlySql('SELECT * FROM sales_data LIMIT (50)', defaultOptions);
        expect(result.normalizedSql).toBe('SELECT * FROM sales_data LIMIT (50)');
        expect(result.limitAppended).toBe(false);
      });
    });

    describe('comment handling', () => {
      it('allows queries with line comments', () => {
        const sql = '-- This is a comment\nSELECT * FROM sales_data';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('SELECT * FROM sales_data');
      });

      it('allows queries with block comments', () => {
        const sql = '/* This is a block comment */ SELECT * FROM sales_data';
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('SELECT * FROM sales_data');
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
        expect(() => validateReadOnlySql('INSERT INTO sales_data VALUES (1)', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects UPDATE statements', () => {
        expect(() => validateReadOnlySql('UPDATE sales_data SET name = "foo"', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects DELETE statements', () => {
        expect(() => validateReadOnlySql('DELETE FROM sales_data', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects DROP statements', () => {
        expect(() => validateReadOnlySql('DROP TABLE sales_data', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects CREATE statements', () => {
        expect(() => validateReadOnlySql('CREATE TABLE test (id INT)', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects ALTER statements', () => {
        expect(() => validateReadOnlySql('ALTER TABLE sales_data ADD COLUMN age INT', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects TRUNCATE statements', () => {
        expect(() => validateReadOnlySql('TRUNCATE TABLE sales_data', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });
    });

    describe('SQL injection prevention', () => {
      it('rejects SELECT with embedded INSERT', () => {
        const sql = 'SELECT * FROM sales_data WHERE 1=1; INSERT INTO sales_data VALUES (1)';
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: INSERT');
      });

      it('rejects SELECT with embedded DELETE', () => {
        const sql = 'SELECT * FROM (DELETE FROM sales_data RETURNING *)';
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: DELETE');
      });

      it('rejects SELECT with embedded UPDATE', () => {
        const sql = 'SELECT * FROM sales_data; UPDATE sales_data SET admin = true';
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: UPDATE');
      });

      it('rejects SELECT with subquery containing DROP', () => {
        const sql = "SELECT * FROM sales_data WHERE id IN (SELECT 1; DROP TABLE sales_data)";
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('disallowed keyword: DROP');
      });

      it('rejects multiple statements separated by semicolon', () => {
        const sql = 'SELECT 1; SELECT 2';
        expect(() => validateReadOnlySql(sql, defaultOptions)).toThrow('Multiple statements are not allowed');
      });

      it('rejects GRANT statements', () => {
        expect(() => validateReadOnlySql('GRANT ALL ON sales_data TO public', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });

      it('rejects REVOKE statements', () => {
        expect(() => validateReadOnlySql('REVOKE ALL ON sales_data FROM public', defaultOptions))
          .toThrow('Only SELECT/CTE statements are allowed');
      });
    });

    describe('case insensitivity', () => {
      it('allows lowercase select', () => {
        const result = validateReadOnlySql('select * from sales_data', defaultOptions);
        expect(result.normalizedSql).toContain('select * from sales_data');
      });

      it('allows mixed case SELECT', () => {
        const result = validateReadOnlySql('SeLeCt * FrOm sales_data', defaultOptions);
        expect(result.normalizedSql).toContain('SeLeCt * FrOm sales_data');
      });

      it('detects lowercase dangerous keywords', () => {
        expect(() => validateReadOnlySql('SELECT * FROM sales_data; delete from sales_data', defaultOptions))
          .toThrow();
      });
    });

    describe('sensitive table blocking', () => {
      it('blocks SELECT from users table', () => {
        expect(() => validateReadOnlySql('SELECT * FROM users', defaultOptions))
          .toThrow('Access to table "users" is not allowed');
      });

      it('blocks SELECT from refresh_tokens table', () => {
        expect(() => validateReadOnlySql('SELECT * FROM refresh_tokens', defaultOptions))
          .toThrow('Access to table "refresh_tokens" is not allowed');
      });

      it('blocks SELECT from password_reset_tokens table', () => {
        expect(() => validateReadOnlySql('SELECT * FROM password_reset_tokens', defaultOptions))
          .toThrow('Access to table "password_reset_tokens" is not allowed');
      });

      it('blocks access to users via JOIN', () => {
        const sql = 'SELECT * FROM sales_data JOIN users ON sales_data.user_id = users.id';
        expect(() => validateReadOnlySql(sql, defaultOptions))
          .toThrow('Access to table "users" is not allowed');
      });

      it('blocks access to notebooks table', () => {
        expect(() => validateReadOnlySql('SELECT * FROM notebooks', defaultOptions))
          .toThrow('Access to table "notebooks" is not allowed');
      });

      it('blocks access to cells table', () => {
        expect(() => validateReadOnlySql('SELECT * FROM cells', defaultOptions))
          .toThrow('Access to table "cells" is not allowed');
      });

      it('blocks pg_catalog tables', () => {
        expect(() => validateReadOnlySql('SELECT * FROM pg_tables', defaultOptions))
          .toThrow('Access to system catalog "pg_tables" is not allowed');
      });

      it('blocks pg_shadow (password hashes)', () => {
        expect(() => validateReadOnlySql('SELECT * FROM pg_shadow', defaultOptions))
          .toThrow('Access to system catalog "pg_shadow" is not allowed');
      });

      it('blocks information_schema tables', () => {
        expect(() => validateReadOnlySql('SELECT * FROM information_schema.tables', defaultOptions))
          .toThrow('Access to system catalog "information_schema.tables" is not allowed');
      });

      it('blocks schema-qualified access to users', () => {
        expect(() => validateReadOnlySql('SELECT * FROM public.users', defaultOptions))
          .toThrow('Access to table "users" is not allowed');
      });

      it('blocks quoted table names', () => {
        expect(() => validateReadOnlySql('SELECT * FROM "users"', defaultOptions))
          .toThrow('Access to table "users" is not allowed');
      });

      it('blocks case-insensitive table references', () => {
        expect(() => validateReadOnlySql('SELECT * FROM USERS', defaultOptions))
          .toThrow('Access to table "users" is not allowed');
      });

      it('does not block table name appearing in string literal', () => {
        const sql = "SELECT * FROM sales_data WHERE name = 'users'";
        const result = validateReadOnlySql(sql, defaultOptions);
        expect(result.normalizedSql).toContain('sales_data');
      });

      it('blocks models table', () => {
        expect(() => validateReadOnlySql('SELECT * FROM models', defaultOptions))
          .toThrow('Access to table "models" is not allowed');
      });

      it('blocks workflow tables', () => {
        expect(() => validateReadOnlySql('SELECT * FROM workflow_runs', defaultOptions))
          .toThrow('Access to table "workflow_runs" is not allowed');
      });

      it('allows blocked table name when in allowedTables', () => {
        const opts = { ...defaultOptions, allowedTables: new Set(['users']) };
        const result = validateReadOnlySql('SELECT * FROM users', opts);
        expect(result.normalizedSql).toContain('users');
      });
    });
  });

  describe('extractTableReferences', () => {
    it('extracts single table from FROM clause', () => {
      expect(extractTableReferences('SELECT * FROM sales_data')).toEqual(['sales_data']);
    });

    it('extracts tables from JOIN', () => {
      const tables = extractTableReferences('SELECT * FROM sales_data JOIN customer_info ON a.id = b.id');
      expect(tables).toContain('sales_data');
      expect(tables).toContain('customer_info');
    });

    it('extracts schema-qualified table names', () => {
      const tables = extractTableReferences('SELECT * FROM public.sales_data');
      expect(tables).toContain('public.sales_data');
    });

    it('extracts quoted identifiers', () => {
      const tables = extractTableReferences('SELECT * FROM "my_table"');
      expect(tables).toContain('my_table');
    });

    it('ignores table names in string literals', () => {
      const tables = extractTableReferences("SELECT * FROM sales_data WHERE name = 'from users'");
      expect(tables).not.toContain('users');
    });

    it('ignores CTE aliases and keeps underlying dataset tables', () => {
      const tables = extractTableReferences(`
        WITH recent_sales AS (
          SELECT * FROM sales_data
        )
        SELECT * FROM recent_sales
      `);

      expect(tables).toEqual(['sales_data']);
    });
  });
});
