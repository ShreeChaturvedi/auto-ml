import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { appLogger } from '../logging/logger.js';
import type { ModelRecord } from '../types/model.js';
import { ensureDirectoryForFile } from '../utils/fs.js';

/** Return the highest version number for a project within a list of models. */
function maxVersion(models: Iterable<ModelRecord>, projectId: string): number {
  let max = 0;
  for (const m of models) {
    if (m.projectId === projectId && typeof m.version === 'number' && m.version > max) {
      max = m.version;
    }
  }
  return max;
}

export interface ModelRepository {
  list(projectId?: string): Promise<ModelRecord[]>;
  getById(modelId: string): Promise<ModelRecord | undefined>;
  create(input: Omit<ModelRecord, 'modelId' | 'createdAt' | 'updatedAt'>): Promise<ModelRecord>;
  update(
    modelId: string,
    updater: (current: ModelRecord) => ModelRecord
  ): Promise<ModelRecord | undefined>;
  delete(modelId: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class InMemoryModelRepository implements ModelRepository {
  private readonly models = new Map<string, ModelRecord>();

  async list(projectId?: string): Promise<ModelRecord[]> {
    const all = Array.from(this.models.values());
    return projectId ? all.filter((model) => model.projectId === projectId) : all;
  }

  async getById(modelId: string): Promise<ModelRecord | undefined> {
    return this.models.get(modelId);
  }

  async create(input: Omit<ModelRecord, 'modelId' | 'createdAt' | 'updatedAt'>): Promise<ModelRecord> {
    const now = new Date().toISOString();
    const model: ModelRecord = {
      ...input,
      modelId: randomUUID(),
      version: input.version ?? maxVersion(this.models.values(), input.projectId) + 1,
      createdAt: now,
      updatedAt: now
    };
    this.models.set(model.modelId, model);
    return model;
  }

  async update(
    modelId: string,
    updater: (current: ModelRecord) => ModelRecord
  ): Promise<ModelRecord | undefined> {
    const current = this.models.get(modelId);
    if (!current) return undefined;
    const updated = {
      ...updater(current),
      modelId: current.modelId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    };
    this.models.set(modelId, updated);
    return updated;
  }

  async delete(modelId: string): Promise<boolean> {
    return this.models.delete(modelId);
  }

  async clear(): Promise<void> {
    this.models.clear();
  }
}

export class FileModelRepository implements ModelRepository {
  constructor(private readonly metadataPath: string) {
    ensureDirectoryForFile(metadataPath);
    if (!existsSync(metadataPath)) {
      writeFileSync(metadataPath, JSON.stringify([], null, 2), 'utf8');
    }
  }

  private readAll(): ModelRecord[] {
    try {
      const raw = readFileSync(this.metadataPath, 'utf8');
      if (!raw.trim()) return [];
      return JSON.parse(raw) as ModelRecord[];
    } catch (error) {
      appLogger.error('[modelRepository] Failed to read metadata', error);
      return [];
    }
  }

  private writeAll(models: ModelRecord[]) {
    ensureDirectoryForFile(this.metadataPath);
    writeFileSync(this.metadataPath, JSON.stringify(models, null, 2), 'utf8');
  }

  async list(projectId?: string): Promise<ModelRecord[]> {
    const all = this.readAll();
    return projectId ? all.filter((model) => model.projectId === projectId) : all;
  }

  async getById(modelId: string): Promise<ModelRecord | undefined> {
    return this.readAll().find((model) => model.modelId === modelId);
  }

  async create(input: Omit<ModelRecord, 'modelId' | 'createdAt' | 'updatedAt'>): Promise<ModelRecord> {
    const now = new Date().toISOString();
    const all = this.readAll();
    const version = input.version ?? maxVersion(all, input.projectId) + 1;
    const model: ModelRecord = {
      ...input,
      modelId: randomUUID(),
      version,
      createdAt: now,
      updatedAt: now
    };
    all.push(model);
    this.writeAll(all);
    return model;
  }

  async update(
    modelId: string,
    updater: (current: ModelRecord) => ModelRecord
  ): Promise<ModelRecord | undefined> {
    const all = this.readAll();
    const index = all.findIndex((model) => model.modelId === modelId);
    if (index === -1) return undefined;
    const current = all[index];
    const updated = {
      ...updater(current),
      modelId: current.modelId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    };
    all[index] = updated;
    this.writeAll(all);
    return updated;
  }

  async delete(modelId: string): Promise<boolean> {
    const all = this.readAll();
    const index = all.findIndex((model) => model.modelId === modelId);
    if (index === -1) return false;
    all.splice(index, 1);
    this.writeAll(all);
    return true;
  }

  async clear(): Promise<void> {
    this.writeAll([]);
  }
}

export function createModelRepository(metadataPath: string): ModelRepository {
  return new FileModelRepository(metadataPath);
}
