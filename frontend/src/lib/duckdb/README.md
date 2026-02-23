# DuckDB Query Engine

Status: Experimental. The app currently uses the backend Postgres query engine; this module is not wired into the UI yet.

## Quick Start

### Basic Usage

```typescript
import { getDuckDB } from '@/lib/duckdb';

// Get singleton instance
const duckdb = getDuckDB();

// Load a CSV file
await duckdb.loadTable('file-id-123', csvFile);

// Execute a query
const result = await duckdb.executeQuery(`
  SELECT * 
  FROM my_dataset 
  WHERE revenue > 1000 
  LIMIT 100
`);

// Use the results
console.log(`Returned ${result.rowCount} rows`);
result.rows.forEach(row => console.log(row));
```

### Query Result Format

```typescript
interface QueryResult {
  rows: Record<string, unknown>[];  // Array of row objects
  columns: ColumnSchema[];          // Column metadata
  rowCount: number;                 // Rows in this result
  totalRows: number;                // Total (may differ if LIMIT used)
  executionTimeMs: number;          // Query execution time
  truncated: boolean;               // True if result was limited
}
```

### Table Management

```typescript
// List all loaded tables
const tables = duckdb.getLoadedTables();
tables.forEach(table => {
  console.log(`${table.tableName}: ${table.rowCount} rows, ${table.columnCount} cols`);
});

// Get table metadata
const metadata = duckdb.getTableByFileId('file-id-123');

// Drop a table
await duckdb.dropTable('my_dataset');
```

### Error Handling

```typescript
try {
  const result = await duckdb.executeQuery('SELECT * FROM nonexistent');
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
    
    // Check for specific error properties
    if ('suggestion' in error) {
      console.log('Suggestion:', error.suggestion);
    }
  }
}
```

## Supported SQL Features

### ✅ Fully Supported

- **SELECT statements**: column selection, aliases, expressions
- **WHERE clauses**: complex conditions, boolean logic
- **ORDER BY**: ascending/descending, multiple columns
- **LIMIT/OFFSET**: result set pagination
- **Aggregations**: COUNT, SUM, AVG, MIN, MAX
- **GROUP BY**: with HAVING clauses
- **JOINs**: INNER, LEFT, RIGHT, FULL OUTER, CROSS
- **Subqueries**: scalar, correlated, CTEs (WITH clauses)
- **Window functions**: ROW_NUMBER, RANK, LAG, LEAD, etc.
- **String functions**: CONCAT, SUBSTRING, UPPER, LOWER, TRIM
- **Date functions**: DATE_PART, DATE_DIFF, CURRENT_DATE
- **Math functions**: ROUND, CEIL, FLOOR, ABS, POWER
- **Conditional**: CASE, COALESCE, NULLIF

### ❌ Not Supported

- **UDFs** (user-defined functions)
- **External file reads** (security restriction)
- **Most extensions** (require Node.js/native)

## Configuration

### Custom Config

```typescript
import { DuckDBService } from '@/lib/duckdb';

const duckdb = DuckDBService.getInstance({
  maxResultRows: 5000,        // Max rows per query (default: 10000)
  queryTimeout: 60000,        // Timeout in ms (default: 30000)
  enableLogging: true,        // Console logging (default: import.meta.env.DEV)
});
```

### Vite Configuration

Already configured in `vite.config.ts`:

```typescript
optimizeDeps: {
  exclude: ['@duckdb/duckdb-wasm'],
  esbuildOptions: {
    target: 'esnext',
  },
},
worker: {
  format: 'es',
},
assetsInclude: ['**/*.wasm'],
```

## Performance Tips

### Dataset Size Guidelines

| Size | Performance | Recommendation |
|------|-------------|----------------|
| <1MB | Excellent (<100ms) | ✅ Use client-side |
| 1-10MB | Good (<500ms) | ✅ Use client-side |
| 10-50MB | Acceptable (1-3s) | ⚠️ Consider backend |
| >50MB | Slow (>5s) | ❌ Use backend API |

### Query Optimization

```sql
-- ✅ Good: Use LIMIT for exploration
SELECT * FROM large_table LIMIT 100;

-- ✅ Good: Filter early
SELECT * FROM data WHERE date > '2024-01-01' LIMIT 1000;

-- ⚠️ Caution: Large aggregations
SELECT category, COUNT(*) FROM data GROUP BY category;

-- ❌ Avoid: Unbounded SELECT * on large tables
SELECT * FROM massive_table;  -- Will auto-add LIMIT 10000
```

### Memory Management

```typescript
// Check service stats
const stats = duckdb.getStats();
console.log(`Tables loaded: ${stats.tablesLoaded}`);
console.log(`Memory used: ${stats.totalMemoryBytes / 1024 / 1024} MB`);

// Cleanup when done
await duckdb.dropTable('temporary_table');
```

## Troubleshooting

### "Failed to initialize query engine"

**Cause:** WASM bundle failed to load  
**Solution:**
1. Check network tab for WASM/worker 404s
2. Verify Vite config is correct
3. Clear browser cache
4. Check console for detailed error

### "Table 'X' not found"

**Cause:** CSV wasn't loaded or wrong table name  
**Solution:**
```typescript
// List available tables
const tables = duckdb.getLoadedTables();
console.log('Available tables:', tables.map(t => t.tableName));

// Use exact table name from list
await duckdb.executeQuery(`SELECT * FROM ${tables[0].tableName}`);
```

### "Query timeout exceeded"

**Cause:** Query took >30 seconds  
**Solution:**
- Add LIMIT clause to reduce result size
- Filter data with WHERE clause
- Increase timeout in config
- Consider moving query to backend

### "Out of memory"

**Cause:** Dataset or result too large for browser  
**Solution:**
- Use LIMIT clause
- Filter rows with WHERE
- Reduce selected columns
- Split into smaller queries
- Use backend for large datasets

## Architecture

### Component Flow

```
User writes SQL in QueryPanel
    ↓
DataViewerTab.handleExecuteQuery()
    ↓
DuckDBService.executeQuery()
    ↓
DuckDB WASM (worker thread)
    ↓
Arrow IPC result conversion
    ↓
DataPreview format
    ↓
DataStore.createArtifact()
    ↓
DataTable renders results
```

### Singleton Pattern

```typescript
// ✅ Correct: Use singleton
const duckdb = getDuckDB();

// ❌ Wrong: Don't create new instances
const duckdb = new DuckDBService(); // Private constructor!
```

### Lazy Initialization

```typescript
// First query triggers WASM load (~1-2s)
await duckdb.executeQuery('SELECT 1');

// Subsequent queries are fast (<100ms)
await duckdb.executeQuery('SELECT * FROM data');
```

## Testing

### Manual Testing

```typescript
// In browser console:
const duckdb = getDuckDB();

// Test basic query
await duckdb.executeQuery('SELECT 1 as test');

// Test table operations
const tables = duckdb.getLoadedTables();
console.log(tables);

// Test error handling
try {
  await duckdb.executeQuery('INVALID SQL');
} catch (e) {
  console.log(e.message);
}
```

### Unit Testing (Future)

```typescript
import { resetDuckDB } from '@/lib/duckdb';

beforeEach(async () => {
  await resetDuckDB(); // Clean slate for each test
});

test('loads CSV and executes query', async () => {
  const duckdb = getDuckDB();
  await duckdb.loadTable('test', mockCSV);
  const result = await duckdb.executeQuery('SELECT * FROM test LIMIT 1');
  expect(result.rowCount).toBe(1);
});
```

## Examples

### Basic Queries

```sql
-- Select all rows
SELECT * FROM sales_data LIMIT 100;

-- Filter by condition
SELECT * FROM sales_data WHERE revenue > 10000;

-- Aggregation
SELECT category, SUM(revenue) as total
FROM sales_data
GROUP BY category
ORDER BY total DESC;

-- Join two tables
SELECT 
  a.customer_name,
  SUM(b.amount) as total_sales
FROM customers a
JOIN orders b ON a.id = b.customer_id
GROUP BY a.customer_name;
```

### Advanced Queries

```sql
-- Window function
SELECT 
  *,
  ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC) as rank
FROM sales_data;

-- CTE (Common Table Expression)
WITH top_sellers AS (
  SELECT product_id, SUM(quantity) as total_qty
  FROM sales_data
  GROUP BY product_id
  ORDER BY total_qty DESC
  LIMIT 10
)
SELECT * FROM top_sellers;

-- Date operations
SELECT 
  DATE_PART('year', order_date) as year,
  DATE_PART('month', order_date) as month,
  COUNT(*) as order_count
FROM sales_data
GROUP BY year, month
ORDER BY year, month;
```

## Resources

- [DuckDB SQL Reference](https://duckdb.org/docs/sql/introduction)
- [DuckDB-WASM Documentation](https://duckdb.org/docs/api/wasm/overview)
- [Apache Arrow IPC Format](https://arrow.apache.org/docs/format/Columnar.html)
- [ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the active query engine design
- [DECISIONS.md](../../../../DECISIONS.md) for current query engine decisions

## Support

### Filing Issues

When reporting bugs, include:
1. SQL query that failed
2. Dataset size and structure
3. Browser and OS version
4. Console error messages
5. DuckDB service stats (`duckdb.getStats()`)

### Common Questions

**Q: Can I use DuckDB with JSON files?**  
A: Not yet. Currently only CSV files are supported. JSON support coming soon.

**Q: How do I export query results?**  
A: Use the export button in DataTable (coming soon) or convert `result.rows` to CSV/JSON.

**Q: Can I save queries for later?**  
A: Query artifacts persist within session. Backend persistence coming in Phase 2.

**Q: Does this work offline?**  
A: Yes! Once WASM is loaded, all queries run client-side without network.

**Q: What about security?**  
A: All queries run in isolated WASM sandbox. No file system or network access.
