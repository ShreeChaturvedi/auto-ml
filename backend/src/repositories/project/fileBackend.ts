import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { appLogger } from '../../logging/logger.js';
import type { CreateProjectInput, Project } from '../../types/project.js';

import { InMemoryProjectRepository } from './inMemory.js';
import { sanitizeMetadata, storedProjectsSchema } from './types.js';

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
      appLogger.warn('[projectRepository] Ignoring invalid storage file contents');
      return [];
    }
    return parsed.data.map((project) => ({
      ...project,
      metadata: sanitizeMetadata(project.metadata)
    }));
  } catch (error) {
    appLogger.error('[projectRepository] Failed to load projects from file', error);
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
    appLogger.error('[projectRepository] Failed to persist projects to file', error);
  }
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
