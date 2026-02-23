import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import type { CreateProjectInput, Project, ProjectMetadata, PhaseValue } from '../types/project.js';

export interface ProjectRepository {
  list(): Promise<Project[]>;
  getById(id: string): Promise<Project | undefined>;
  create(input: CreateProjectInput): Promise<Project>;
  update(id: string, input: Partial<CreateProjectInput>): Promise<Project | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class InMemoryProjectRepository implements ProjectRepository {
  protected readonly projects = new Map<string, Project>();

  constructor(initialProjects: Project[] = []) {
    initialProjects.forEach((project) => {
      this.projects.set(project.id, project);
    });
  }

  async list(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async getById(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      icon: input.icon ?? 'folder-closed',
      color: input.color ?? 'blue',
      createdAt: now,
      updatedAt: now,
      metadata: sanitizeMetadata(input.metadata)
    };

    this.projects.set(project.id, project);
    return project;
  }

  async update(id: string, input: Partial<CreateProjectInput>): Promise<Project | undefined> {
    const existing = this.projects.get(id);
    if (!existing) return undefined;

    const updated: Project = {
      ...existing,
      ...input,
      metadata: sanitizeMetadata({ ...existing.metadata, ...input.metadata }),
      updatedAt: new Date().toISOString()
    };

    this.projects.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  async clear(): Promise<void> {
    this.projects.clear();
  }
}

export const PHASE_VALUES = [
  'upload',
  'data-viewer',
  'preprocessing',
  'feature-engineering',
  'training',
  'experiments',
  'deployment'
] as const satisfies readonly PhaseValue[];

const phaseSchema = z.enum(PHASE_VALUES);

const metadataSchema = z
  .object({
    unlockedPhases: z.array(phaseSchema).optional(),
    completedPhases: z.array(phaseSchema).optional(),
    currentPhase: phaseSchema.optional(),
    customInstructions: z.string().max(5000).optional()
  })
  .catchall(z.unknown())
  .optional();

const storedProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: metadataSchema
});

const storedProjectsSchema = z.array(storedProjectSchema);

function ensureDirectory(filePath: string) {
  const directory = dirname(filePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

function loadProjectsFromFile(filePath: string): Project[] {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    if (!raw.trim()) return [];
    const parsed = storedProjectsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('[projectRepository] Ignoring invalid storage file contents');
      return [];
    }
    return parsed.data.map((project) => ({
      ...project,
      metadata: sanitizeMetadata(project.metadata)
    }));
  } catch (error) {
    console.error('[projectRepository] Failed to load projects from file', error);
    return [];
  }
}

function persistProjects(filePath: string, projects: Project[]) {
  try {
    ensureDirectory(filePath);
    const sanitized = projects.map((project) => ({
      ...project,
      metadata: sanitizeMetadata(project.metadata)
    }));
    writeFileSync(filePath, JSON.stringify(sanitized, null, 2), 'utf8');
  } catch (error) {
    console.error('[projectRepository] Failed to persist projects to file', error);
  }
}

const DEFAULT_METADATA: Required<ProjectMetadata> = {
  unlockedPhases: ['upload'],
  completedPhases: [],
  currentPhase: 'upload',
  customInstructions: ''
};

function sanitizeMetadata(metadata?: ProjectMetadata): ProjectMetadata {
  const unlocked = Array.isArray(metadata?.unlockedPhases)
    ? metadata?.unlockedPhases.filter(isValidPhase)
    : DEFAULT_METADATA.unlockedPhases;

  const completed = Array.isArray(metadata?.completedPhases)
    ? metadata?.completedPhases.filter((phase) => isValidPhase(phase) && unlocked.includes(phase))
    : DEFAULT_METADATA.completedPhases;

  const current = isValidPhase(metadata?.currentPhase)
    ? metadata?.currentPhase
    : DEFAULT_METADATA.currentPhase;

  const customInstructions = typeof metadata?.customInstructions === 'string'
    ? metadata?.customInstructions
    : DEFAULT_METADATA.customInstructions;

  return {
    ...metadata,
    unlockedPhases: Array.from(new Set([...unlocked, current, DEFAULT_METADATA.currentPhase])),
    completedPhases: completed,
    currentPhase: current,
    customInstructions
  };
}

function isValidPhase(value: unknown): value is PhaseValue {
  return typeof value === 'string' && PHASE_VALUES.includes(value as PhaseValue);
}

export class FileProjectRepository extends InMemoryProjectRepository {
  private readonly filePath: string;

  constructor(filePath: string) {
    ensureDirectory(filePath);
    const initialProjects = loadProjectsFromFile(filePath);
    super(initialProjects);
    this.filePath = filePath;

    if (!existsSync(filePath)) {
      void this.persist();
    }
  }

  private async persist() {
    const projects = await this.list();
    persistProjects(this.filePath, projects);
  }

  override async create(input: CreateProjectInput): Promise<Project> {
    const project = await super.create(input);
    await this.persist();
    return project;
  }

  override async update(id: string, input: Partial<CreateProjectInput>): Promise<Project | undefined> {
    const project = await super.update(id, input);
    if (project) {
      await this.persist();
    }
    return project;
  }

  override async delete(id: string): Promise<boolean> {
    const deleted = await super.delete(id);
    if (deleted) {
      await this.persist();
    }
    return deleted;
  }

  override async clear(): Promise<void> {
    await super.clear();
    await this.persist();
  }
}

export function createProjectRepository(storagePath: string): ProjectRepository {
  // Use Postgres when available to maintain foreign key integrity with datasets
  if (hasDatabaseConfiguration()) {
    try {
      console.log('[projectRepository] Using Postgres backend');
      return new PgProjectRepository();
    } catch (error) {
      console.error('[projectRepository] Postgres failed, falling back to file storage', error);
    }
  }

  // Fallback to file-based storage
  try {
    console.log('[projectRepository] Using file-based storage');
    return new FileProjectRepository(storagePath);
  } catch (error) {
    console.error('[projectRepository] Falling back to in-memory storage', error);
    return new InMemoryProjectRepository();
  }
}

class PgProjectRepository implements ProjectRepository {
  private readonly table = 'projects';
  private columnCache: Promise<Set<string>> | null = null;

  private async getColumns(): Promise<Set<string>> {
    if (!this.columnCache) {
      this.columnCache = (async () => {
        const pool = getDbPool();
        const result = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
          [this.table]
        );
        return new Set(result.rows.map((row) => String(row.column_name)));
      })();
    }
    return this.columnCache;
  }

  private buildSelectColumns(columns: Set<string>) {
    const select = ['project_id', 'name', 'description', 'metadata', 'created_at', 'updated_at'];
    if (columns.has('icon')) {
      select.push('icon');
    }
    if (columns.has('color')) {
      select.push('color');
    }
    return select;
  }

  async list(): Promise<Project[]> {
    const pool = getDbPool();
    const columns = await this.getColumns();
    const selectColumns = this.buildSelectColumns(columns);
    const result = await pool.query(
      `SELECT ${selectColumns.join(', ')} FROM ${this.table} ORDER BY created_at ASC`
    );

    return result.rows.map((row) => ({
      id: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      icon: row.icon ?? 'Folder',
      color: row.color ?? 'blue',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      metadata: sanitizeMetadata(row.metadata ?? undefined)
    }));
  }

  async getById(id: string): Promise<Project | undefined> {
    const pool = getDbPool();
    const columns = await this.getColumns();
    const selectColumns = this.buildSelectColumns(columns);
    const result = await pool.query(
      `SELECT ${selectColumns.join(', ')} FROM ${this.table} WHERE project_id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      return undefined;
    }
    const row = result.rows[0];
    return {
      id: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      icon: row.icon ?? 'Folder',
      color: row.color ?? 'blue',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      metadata: sanitizeMetadata(row.metadata ?? undefined)
    };
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const pool = getDbPool();
    const id = randomUUID();
    const metadata = sanitizeMetadata(input.metadata);
    const columns = await this.getColumns();

    const insertColumns = ['project_id', 'name', 'description', 'metadata'];
    const values: unknown[] = [id, input.name, input.description ?? null, metadata ?? {}];
    if (columns.has('icon')) {
      insertColumns.push('icon');
      values.push(input.icon ?? 'Folder');
    }
    if (columns.has('color')) {
      insertColumns.push('color');
      values.push(input.color ?? 'blue');
    }

    const result = await pool.query(
      `INSERT INTO ${this.table} (${insertColumns.join(', ')})
       VALUES (${insertColumns.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING ${this.buildSelectColumns(columns).join(', ')}`,
      values
    );

    const row = result.rows[0];
    return {
      id: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      icon: row.icon ?? 'Folder',
      color: row.color ?? 'blue',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      metadata: sanitizeMetadata(row.metadata ?? undefined)
    };
  }

  async update(id: string, input: Partial<CreateProjectInput>): Promise<Project | undefined> {
    const existing = await this.getById(id);
    if (!existing) {
      return undefined;
    }

    const pool = getDbPool();
    const mergedMetadata = sanitizeMetadata({
      ...(existing.metadata ?? {}),
      ...(input.metadata ?? {})
    });
    const columns = await this.getColumns();

    const updates: string[] = [];
    const values: unknown[] = [id];
    let index = 2;

    updates.push(`name = COALESCE($${index++}, name)`);
    values.push(input.name ?? null);

    updates.push(`description = COALESCE($${index++}, description)`);
    values.push(input.description ?? null);

    if (columns.has('icon')) {
      updates.push(`icon = COALESCE($${index++}, icon)`);
      values.push(input.icon ?? null);
    }

    if (columns.has('color')) {
      updates.push(`color = COALESCE($${index++}, color)`);
      values.push(input.color ?? null);
    }

    updates.push(`metadata = $${index++}`);
    values.push(mergedMetadata ?? {});

    const result = await pool.query(
      `UPDATE ${this.table}
       SET ${updates.join(', ')},
           updated_at = NOW()
       WHERE project_id = $1
       RETURNING ${this.buildSelectColumns(columns).join(', ')}`,
      values
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    const row = result.rows[0];
    return {
      id: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      icon: row.icon ?? 'Folder',
      color: row.color ?? 'blue',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      metadata: sanitizeMetadata(row.metadata ?? undefined)
    };
  }

  async delete(id: string): Promise<boolean> {
    const pool = getDbPool();
    const result = await pool.query(`DELETE FROM ${this.table} WHERE project_id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async clear(): Promise<void> {
    const pool = getDbPool();
    await pool.query(`DELETE FROM ${this.table}`);
  }
}
