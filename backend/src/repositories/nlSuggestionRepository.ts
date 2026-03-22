import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import type { NlSuggestion, StoredNlSuggestionSet } from '../services/nlSuggestions/types.js';
import { ensureDirectoryForFile } from '../utils/fs.js';

export interface NlSuggestionRepository {
  get(params: {
    projectId: string;
    schemaFingerprint: string;
    modelId: string;
    promptVersion: number;
  }): Promise<StoredNlSuggestionSet | null>;
  put(entry: Omit<StoredNlSuggestionSet, 'suggestionSetId' | 'createdAt' | 'updatedAt'>): Promise<StoredNlSuggestionSet>;
  clear?(): Promise<void>;
}

class FileNlSuggestionRepository implements NlSuggestionRepository {
  constructor(private readonly cachePath: string) {
    ensureDirectoryForFile(cachePath);
    if (!existsSync(cachePath)) {
      writeFileSync(cachePath, JSON.stringify([], null, 2), 'utf8');
    }
  }

  private readAll(): StoredNlSuggestionSet[] {
    try {
      const raw = readFileSync(this.cachePath, 'utf8');
      if (!raw.trim()) return [];
      return JSON.parse(raw) as StoredNlSuggestionSet[];
    } catch (error) {
      appLogger.error('[nlSuggestionRepository] Failed to read cache file', error);
      return [];
    }
  }

  private writeAll(entries: StoredNlSuggestionSet[]) {
    ensureDirectoryForFile(this.cachePath);
    writeFileSync(this.cachePath, JSON.stringify(entries, null, 2), 'utf8');
  }

  async get(params: {
    projectId: string;
    schemaFingerprint: string;
    modelId: string;
    promptVersion: number;
  }): Promise<StoredNlSuggestionSet | null> {
    return this.readAll().find((entry) => (
      entry.projectId === params.projectId
      && entry.schemaFingerprint === params.schemaFingerprint
      && entry.modelId === params.modelId
      && entry.promptVersion === params.promptVersion
    )) ?? null;
  }

  async put(entry: Omit<StoredNlSuggestionSet, 'suggestionSetId' | 'createdAt' | 'updatedAt'>): Promise<StoredNlSuggestionSet> {
    const current = this.readAll();
    const existingIndex = current.findIndex((candidate) => (
      candidate.projectId === entry.projectId
      && candidate.schemaFingerprint === entry.schemaFingerprint
      && candidate.modelId === entry.modelId
      && candidate.promptVersion === entry.promptVersion
    ));
    const now = new Date().toISOString();
    const nextEntry: StoredNlSuggestionSet = existingIndex >= 0
      ? {
          ...current[existingIndex],
          ...entry,
          updatedAt: now
        }
      : {
          suggestionSetId: randomUUID(),
          ...entry,
          createdAt: now,
          updatedAt: now
        };

    if (existingIndex >= 0) {
      current[existingIndex] = nextEntry;
    } else {
      current.push(nextEntry);
    }

    this.writeAll(current);
    return nextEntry;
  }
  async clear(): Promise<void> {
    this.writeAll([]);
  }
}

class PgNlSuggestionRepository implements NlSuggestionRepository {
  async get(params: {
    projectId: string;
    schemaFingerprint: string;
    modelId: string;
    promptVersion: number;
  }): Promise<StoredNlSuggestionSet | null> {
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT suggestion_set_id,
              project_id,
              schema_fingerprint,
              model_id,
              prompt_version,
              suggestions,
              created_at,
              updated_at
       FROM nl_placeholder_suggestions
       WHERE project_id = $1
         AND schema_fingerprint = $2
         AND model_id = $3
         AND prompt_version = $4
       LIMIT 1`,
      [params.projectId, params.schemaFingerprint, params.modelId, params.promptVersion]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapPgRow(result.rows[0]);
  }

  async put(entry: Omit<StoredNlSuggestionSet, 'suggestionSetId' | 'createdAt' | 'updatedAt'>): Promise<StoredNlSuggestionSet> {
    const pool = getDbPool();
    const result = await pool.query(
      `INSERT INTO nl_placeholder_suggestions (
         suggestion_set_id,
         project_id,
         schema_fingerprint,
         model_id,
         prompt_version,
         suggestions
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, schema_fingerprint, model_id, prompt_version)
       DO UPDATE SET suggestions = EXCLUDED.suggestions,
                     updated_at = NOW()
       RETURNING suggestion_set_id,
                 project_id,
                 schema_fingerprint,
                 model_id,
                 prompt_version,
                 suggestions,
                 created_at,
                 updated_at`,
      [
        randomUUID(),
        entry.projectId,
        entry.schemaFingerprint,
        entry.modelId,
        entry.promptVersion,
        JSON.stringify(entry.suggestions)
      ]
    );

    return mapPgRow(result.rows[0]);
  }
}

function mapPgRow(row: {
  suggestion_set_id: string;
  project_id: string;
  schema_fingerprint: string;
  model_id: string;
  prompt_version: number;
  suggestions: NlSuggestion[];
  created_at: Date;
  updated_at: Date;
}): StoredNlSuggestionSet {
  return {
    suggestionSetId: row.suggestion_set_id,
    projectId: row.project_id,
    schemaFingerprint: row.schema_fingerprint,
    modelId: row.model_id,
    promptVersion: Number(row.prompt_version),
    suggestions: row.suggestions,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export function createNlSuggestionRepository(cachePath: string): NlSuggestionRepository {
  if (hasDatabaseConfiguration()) {
    return new PgNlSuggestionRepository();
  }

  return new FileNlSuggestionRepository(cachePath);
}
