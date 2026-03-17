import { randomUUID } from 'node:crypto';

import type { CreateProjectInput, Project } from '../../types/project.js';

import type { ProjectRepository } from './types.js';
import { sanitizeMetadata } from './types.js';

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
