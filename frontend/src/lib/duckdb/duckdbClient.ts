/**
 * DuckDB Service - Client-side SQL query engine
 *
 * Provides a singleton service for executing SQL queries against uploaded datasets
 * using DuckDB-WASM. Handles initialization, table management, query execution,
 * and resource cleanup.
 *
 * Key features:
 * - Lazy initialization (WASM loaded on first query)
 * - Automatic CSV table registration
 * - Query result streaming with Apache Arrow
 * - Memory management and cleanup
 * - User-friendly error messages
 *
 * Status: Experimental (not wired into the UI). See DECISIONS.md for current
 * query engine direction.
 *
 * @example
 * ```typescript
 * const duckdb = DuckDBService.getInstance();
 * await duckdb.loadTable('file123', csvFile);
 * const result = await duckdb.executeQuery('SELECT * FROM my_data LIMIT 10');
 * ```
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import type {
  TableMetadata,
  ColumnSchema,
  QueryResult,
  QueryError,
  DuckDBConfig,
  ServiceStats
} from './types';

/**
 * Type definitions for DuckDB/Arrow library types
 * These are defined locally to avoid apache-arrow package.json exports issue
 */
interface ArrowField {
  name: string;
  nullable: boolean;
  type: { typeId: number };
}

interface ArrowSchema {
  fields: ArrowField[];
}

interface DuckDBArrowTable extends Iterable<Record<string, unknown>> {
  schema: ArrowSchema;
  toArray(): Record<string, unknown>[];
}

interface DuckDBDescribeRow {
  column_name: string;
  column_type: string;
  null: string;
}

/**
 * Default configuration for DuckDB service
 */
const DEFAULT_CONFIG: Required<DuckDBConfig> = {
  maxResultRows: 10000,
  queryTimeout: 30000, // 30 seconds
  enableLogging: import.meta.env.DEV, // Enable in development
  workerUrl: '' // Not used - worker files loaded from public folder
};

/**
 * DuckDB Service - Singleton class managing DuckDB-WASM instance
 */
export class DuckDBService {
  private static instance: DuckDBService | null = null;
  
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private loadedTables: Map<string, TableMetadata> = new Map();
  private config: Required<DuckDBConfig>;
  
  // Performance tracking
  private queriesExecuted: number = 0;
  private totalQueryTime: number = 0;
  
  /**
   * Private constructor (singleton pattern)
   */
  private constructor(config: Partial<DuckDBConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get singleton instance of DuckDBService
   */
  static getInstance(config?: Partial<DuckDBConfig>): DuckDBService {
    if (!DuckDBService.instance) {
      DuckDBService.instance = new DuckDBService(config);
    }
    return DuckDBService.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static async resetInstance(): Promise<void> {
    if (DuckDBService.instance) {
      await DuckDBService.instance.dispose();
      DuckDBService.instance = null;
    }
  }

  /**
   * Initialize DuckDB-WASM (lazy loading)
   * Only called on first query execution
   */
  private async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Use files from public folder - served as static assets by Vite at root /
        // These are pre-built IIFE worker bundles, not ES modules
        const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
          mvp: {
            mainModule: '/duckdb-mvp.wasm',
            mainWorker: '/duckdb-browser-mvp.worker.js',
          },
          eh: {
            mainModule: '/duckdb-eh.wasm',
            mainWorker: '/duckdb-browser-eh.worker.js',
          },
        };

        // Select appropriate bundle based on browser capabilities
        const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
        
        if (!bundle.mainWorker) {
          throw new Error('No suitable DuckDB worker bundle found');
        }

        // Create logger for debugging
        const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);

        // Create worker - files in public folder are pre-built as IIFE format
        const worker = new Worker(bundle.mainWorker);
        
        // Create async DuckDB instance
        this.db = new duckdb.AsyncDuckDB(logger, worker);
        
        // Instantiate with the WASM module
        await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        
        // Create a connection for queries
        this.conn = await this.db.connect();
        
        this.isInitialized = true;
        console.log('✅ DuckDB initialized successfully');
      } catch (error) {
        console.error('Failed to initialize DuckDB:', error);
        this.db = null;
        this.conn = null;
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Load a CSV file into a DuckDB table
   * 
   * @param fileId - Unique identifier for the file
   * @param file - File object containing CSV data
   * @returns Table name that can be used in queries
   */
  async loadTable(fileId: string, file: File): Promise<string> {
    await this.ensureInitialized();

    const startTime = performance.now();
    const tableName = this.sanitizeTableName(file.name);

    try {
      this.log(`Loading table '${tableName}' from file: ${file.name}`);

      // Check if table already exists
      if (this.loadedTables.has(fileId)) {
        const existing = this.loadedTables.get(fileId)!;
        this.log(`Table '${existing.tableName}' already loaded, skipping`);
        return existing.tableName;
      }

      // Read file as ArrayBuffer
      const buffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      // Register file in DuckDB virtual filesystem
      await this.db!.registerFileBuffer(file.name, uint8Array);

      // Create table from CSV using DuckDB's CSV reader
      const createTableSQL = `
        CREATE TABLE ${tableName} AS 
        SELECT * FROM read_csv_auto('${file.name}', 
          header=true, 
          sample_size=10000,
          auto_detect=true
        )
      `;
      
      await this.conn!.query(createTableSQL);

      // Get table metadata
      const metadata = await this.getTableMetadata(fileId, tableName, file);
      this.loadedTables.set(fileId, metadata);

      const loadTime = performance.now() - startTime;
      this.log(`Table '${tableName}' loaded in ${loadTime.toFixed(0)}ms (${metadata.rowCount} rows, ${metadata.columnCount} columns)`);

      return tableName;

    } catch (error) {
      this.error(`Failed to load table from ${file.name}`, error);
      throw this.createQueryError(`Failed to load dataset: ${file.name}`, error);
    }
  }

  /**
   * Execute a SQL query against loaded tables
   * 
   * @param sql - SQL query string
   * @returns Query results with metadata
   */
  async executeQuery(sql: string): Promise<QueryResult> {
    await this.ensureInitialized();

    const startTime = performance.now();
    this.queriesExecuted++;

    try {
      this.log(`Executing query: ${sql.substring(0, 100)}...`);

      // Wrap query with automatic LIMIT if not present
      const wrappedSQL = this.ensureQueryLimit(sql);

      // Execute query with timeout
      const result = await this.executeWithTimeout(wrappedSQL);

      // Convert Arrow table to QueryResult format
      const queryResult = await this.arrowToQueryResult(result, sql);

      const executionTime = performance.now() - startTime;
      queryResult.executionTimeMs = executionTime;
      this.totalQueryTime += executionTime;

      this.log(`Query executed in ${executionTime.toFixed(0)}ms (${queryResult.rowCount} rows returned)`);

      return queryResult;

    } catch (error) {
      this.error('Query execution failed', error);
      throw this.createQueryError('Query execution failed', error);
    }
  }

  /**
   * Execute query with timeout protection
   */
  private async executeWithTimeout(sql: string): Promise<DuckDBArrowTable> {
    return Promise.race([
      this.conn!.query(sql),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Query timeout exceeded')),
          this.config.queryTimeout
        )
      )
    ]);
  }

  /**
   * Ensure query has a reasonable LIMIT to prevent memory issues
   */
  private ensureQueryLimit(sql: string): string {
    const upperSQL = sql.toUpperCase();
    
    // Don't modify if already has LIMIT
    if (upperSQL.includes('LIMIT')) {
      return sql;
    }

    // Add automatic LIMIT for SELECT queries
    if (upperSQL.trim().startsWith('SELECT')) {
      return `${sql.trim()}\nLIMIT ${this.config.maxResultRows}`;
    }

    return sql;
  }

  /**
   * Convert Arrow table to QueryResult format
   */
  private async arrowToQueryResult(
    arrowTable: DuckDBArrowTable,
    originalSQL: string
  ): Promise<QueryResult> {
    // Get schema information
    const schema = arrowTable.schema;
    const columns: ColumnSchema[] = schema.fields.map((field: ArrowField) => ({
      name: field.name,
      type: this.arrowTypeToDuckDBType(field.type),
      nullable: field.nullable
    }));

    // Convert to array of row objects
    const rows: Record<string, unknown>[] = [];
    for (const row of arrowTable) {
      const rowObj: Record<string, unknown> = {};
      for (const field of schema.fields) {
        rowObj[field.name] = row[field.name];
      }
      rows.push(rowObj);
    }

    const rowCount = rows.length;
    const truncated = rowCount >= this.config.maxResultRows;

    // Try to get total row count (for queries with LIMIT)
    let totalRows = rowCount;
    if (truncated) {
      try {
        const countSQL = `SELECT COUNT(*) as total FROM (${originalSQL}) as subquery`;
        const countResult = await this.conn!.query(countSQL);
        const countRow = countResult.toArray()[0];
        totalRows = Number(countRow.total);
      } catch {
        // If count fails, assume truncated count
        totalRows = rowCount;
      }
    }

    return {
      rows,
      columns,
      rowCount,
      totalRows,
      executionTimeMs: 0, // Will be set by caller
      truncated
    };
  }

  /**
   * Convert Arrow type to DuckDB type string
   */
  private arrowTypeToDuckDBType(arrowType: { typeId: number }): string {
    const typeId = arrowType.typeId;
    
    // Map Arrow type IDs to DuckDB types
    const typeMap: Record<number, string> = {
      2: 'INTEGER',      // Int32
      3: 'BIGINT',       // Int64
      9: 'DOUBLE',       // Float64
      13: 'VARCHAR',     // Utf8
      14: 'BOOLEAN',     // Bool
      15: 'DATE',        // Date32
      16: 'TIMESTAMP',   // Timestamp
    };

    return typeMap[typeId] || 'VARCHAR';
  }

  /**
   * Get metadata for a loaded table
   */
  private async getTableMetadata(
    fileId: string,
    tableName: string,
    file: File
  ): Promise<TableMetadata> {
    // Get table statistics
    const statsSQL = `
      SELECT 
        COUNT(*) as row_count,
        COUNT(*) as column_count
      FROM ${tableName}
      LIMIT 1
    `;
    
    const statsResult = await this.conn!.query(statsSQL);
    const stats = statsResult.toArray()[0];

    // Get column information
    const columnsSQL = `DESCRIBE ${tableName}`;
    const columnsResult = await this.conn!.query(columnsSQL);
    const columnsArray = columnsResult.toArray();

    const columns: ColumnSchema[] = columnsArray.map((col: DuckDBDescribeRow) => ({
      name: col.column_name,
      type: col.column_type,
      nullable: col.null === 'YES'
    }));

    return {
      tableName,
      fileId,
      fileName: file.name,
      rowCount: Number(stats.row_count),
      columnCount: columns.length,
      columns,
      loadedAt: new Date(),
      sizeBytes: file.size
    };
  }

  /**
   * Get schema for a specific table
   */
  async getTableSchema(tableName: string): Promise<ColumnSchema[]> {
    await this.ensureInitialized();

    try {
      const sql = `DESCRIBE ${tableName}`;
      const result = await this.conn!.query(sql);
      const rows = result.toArray();

      return rows.map((row: DuckDBDescribeRow) => ({
        name: row.column_name,
        type: row.column_type,
        nullable: row.null === 'YES'
      }));
    } catch (error) {
      this.error(`Failed to get schema for table: ${tableName}`, error);
      throw this.createQueryError(`Table '${tableName}' not found`, error);
    }
  }

  /**
   * Drop a table from DuckDB
   */
  async dropTable(tableName: string): Promise<void> {
    await this.ensureInitialized();

    try {
      await this.conn!.query(`DROP TABLE IF EXISTS ${tableName}`);
      
      // Remove from tracking
      for (const [fileId, metadata] of this.loadedTables.entries()) {
        if (metadata.tableName === tableName) {
          this.loadedTables.delete(fileId);
          break;
        }
      }

      this.log(`Table '${tableName}' dropped`);
    } catch (error) {
      this.error(`Failed to drop table: ${tableName}`, error);
      throw this.createQueryError(`Failed to drop table: ${tableName}`, error);
    }
  }

  /**
   * Get list of all loaded tables
   */
  getLoadedTables(): TableMetadata[] {
    return Array.from(this.loadedTables.values());
  }

  /**
   * Get metadata for a specific file
   */
  getTableByFileId(fileId: string): TableMetadata | undefined {
    return this.loadedTables.get(fileId);
  }

  /**
   * Get service statistics
   */
  getStats(): ServiceStats {
    return {
      isInitialized: this.isInitialized,
      tablesLoaded: this.loadedTables.size,
      totalMemoryBytes: this.calculateTotalMemory(),
      queriesExecuted: this.queriesExecuted,
      averageQueryTimeMs: this.queriesExecuted > 0 
        ? this.totalQueryTime / this.queriesExecuted 
        : 0
    };
  }

  /**
   * Calculate total memory used by loaded tables
   */
  private calculateTotalMemory(): number {
    let total = 0;
    for (const metadata of this.loadedTables.values()) {
      total += metadata.sizeBytes;
    }
    return total;
  }

  /**
   * Sanitize filename to create valid SQL table name
   * 
   * Rules:
   * - Replace special characters with underscores
   * - Remove file extension
   * - Ensure starts with letter
   * - Limit length to 63 characters (PostgreSQL limit)
   */
  sanitizeTableName(filename: string): string {
    // Remove file extension
    let name = filename.replace(/\.[^/.]+$/, '');
    
    // Replace special characters with underscores
    name = name.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Ensure starts with letter
    if (!/^[a-zA-Z]/.test(name)) {
      name = 'table_' + name;
    }
    
    // Limit length
    name = name.substring(0, 63);
    
    // Ensure uniqueness by appending timestamp if needed
    let uniqueName = name;
    let counter = 1;
    while (Array.from(this.loadedTables.values()).some(t => t.tableName === uniqueName)) {
      uniqueName = `${name}_${counter}`;
      counter++;
    }
    
    return uniqueName;
  }

  /**
   * Ensure DuckDB is initialized (lazy loading)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Create a structured QueryError with helpful information
   */
  private createQueryError(message: string, originalError: unknown): QueryError {
    const error = new Error(message) as QueryError;
    error.originalError = originalError;

    // Try to extract line/column info from DuckDB errors
    if (originalError instanceof Error) {
      const match = originalError.message.match(/LINE (\d+):(\d+)/);
      if (match) {
        error.line = parseInt(match[1]);
        error.column = parseInt(match[2]);
      }

      // Add helpful suggestions based on error type
      if (originalError.message.includes('Table') && originalError.message.includes('not found')) {
        const tables = Array.from(this.loadedTables.values()).map(t => t.tableName);
        error.suggestion = tables.length > 0
          ? `Available tables: ${tables.join(', ')}`
          : 'No tables loaded. Please upload a dataset first.';
      }
    }

    return error;
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      this.log('Disposing DuckDB resources...');

      // Close connection
      if (this.conn) {
        await this.conn.close();
        this.conn = null;
      }

      // Terminate worker
      if (this.db) {
        await this.db.terminate();
        this.db = null;
      }

      this.loadedTables.clear();
      this.isInitialized = false;

      this.log('DuckDB resources disposed');
    } catch (error) {
      this.error('Error during disposal', error);
    }
  }

  /**
   * Logging helpers
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.config.enableLogging) {
      console.log(`[DuckDB] ${message}`, ...args);
    }
  }

  private error(message: string, ...args: unknown[]): void {
    console.error(`[DuckDB] ${message}`, ...args);
  }
}

/**
 * Export singleton instance getter
 */
export const getDuckDB = () => DuckDBService.getInstance();

/**
 * Export for cleanup in tests/dev tools
 */
export const resetDuckDB = () => DuckDBService.resetInstance();
