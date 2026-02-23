import express, { Router } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';

import { InMemoryProjectRepository } from '../repositories/projectRepository.js';
import { canListen } from '../tests/canListen.js';

import { registerProjectRoutes } from './projects.js';

const canBind = await canListen();
const describeIf = canBind ? describe : describe.skip;

function createTestApp(repository: InMemoryProjectRepository) {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerProjectRoutes(router, repository);
  app.use('/api', router);
  return app;
}

describeIf('project routes', () => {
  let repository: InMemoryProjectRepository;

  beforeEach(() => {
    repository = new InMemoryProjectRepository();
  });

  describe('GET /api/projects', () => {
    it('returns empty array when no projects exist', async () => {
      const app = createTestApp(repository);
      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body.projects).toEqual([]);
    });

    it('returns all projects', async () => {
      await repository.create({ name: 'Project 1' });
      await repository.create({ name: 'Project 2' });

      const app = createTestApp(repository);
      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(2);
      expect(response.body.projects[0].name).toBe('Project 1');
      expect(response.body.projects[1].name).toBe('Project 2');
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns 404 for non-existent project', async () => {
      const app = createTestApp(repository);
      const response = await request(app).get('/api/projects/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('returns project by id', async () => {
      const created = await repository.create({ name: 'Test Project', description: 'A test' });

      const app = createTestApp(repository);
      const response = await request(app).get(`/api/projects/${created.id}`);

      expect(response.status).toBe(200);
      expect(response.body.project.id).toBe(created.id);
      expect(response.body.project.name).toBe('Test Project');
      expect(response.body.project.description).toBe('A test');
    });
  });

  describe('POST /api/projects', () => {
    it('creates a new project with minimal data', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'New Project' });

      expect(response.status).toBe(201);
      expect(response.body.project.name).toBe('New Project');
      expect(response.body.project.id).toBeDefined();
      expect(response.body.project.createdAt).toBeDefined();
      expect(response.body.project.updatedAt).toBeDefined();
    });

    it('creates a project with all fields', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'Full Project',
          description: 'A complete project',
          icon: 'star',
          color: 'red',
          metadata: {
            currentPhase: 'data-viewer',
            customInstructions: 'Some instructions'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.project.name).toBe('Full Project');
      expect(response.body.project.description).toBe('A complete project');
      expect(response.body.project.icon).toBe('star');
      expect(response.body.project.color).toBe('red');
      expect(response.body.project.metadata.currentPhase).toBe('data-viewer');
      expect(response.body.project.metadata.customInstructions).toBe('Some instructions');
    });

    it('returns 400 when name is missing', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .send({ description: 'No name' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('returns 400 when name is empty', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('persists the project to repository', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Persisted Project' });

      const projects = await repository.list();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(response.body.project.id);
    });

    it('sets default metadata', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Default Metadata Project' });

      expect(response.body.project.metadata).toBeDefined();
      expect(response.body.project.metadata.unlockedPhases).toContain('upload');
      expect(response.body.project.metadata.currentPhase).toBe('upload');
    });
  });

  describe('PATCH /api/projects/:id', () => {
    it('returns 404 for non-existent project', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .patch('/api/projects/non-existent-id')
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('updates project name', async () => {
      const created = await repository.create({ name: 'Original' });

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.project.name).toBe('Updated Name');
    });

    it('updates project description', async () => {
      const created = await repository.create({ name: 'Test' });

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .send({ description: 'New description' });

      expect(response.status).toBe(200);
      expect(response.body.project.description).toBe('New description');
    });

    it('updates project metadata', async () => {
      const created = await repository.create({ name: 'Test' });

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .send({ metadata: { currentPhase: 'preprocessing' } });

      expect(response.status).toBe(200);
      expect(response.body.project.metadata.currentPhase).toBe('preprocessing');
    });

    it('updates updatedAt timestamp', async () => {
      const created = await repository.create({ name: 'Test' });
      const originalUpdatedAt = created.updatedAt;

      // Wait a small amount to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .send({ name: 'Updated' });

      expect(response.body.project.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('preserves existing fields when not provided', async () => {
      const created = await repository.create({
        name: 'Test',
        description: 'Original description',
        icon: 'folder',
        color: 'blue'
      });

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .send({ name: 'New Name' });

      expect(response.body.project.name).toBe('New Name');
      expect(response.body.project.description).toBe('Original description');
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('returns 404 for non-existent project', async () => {
      const app = createTestApp(repository);
      const response = await request(app).delete('/api/projects/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('deletes an existing project', async () => {
      const created = await repository.create({ name: 'To Delete' });

      const app = createTestApp(repository);
      const response = await request(app).delete(`/api/projects/${created.id}`);

      expect(response.status).toBe(204);

      const projects = await repository.list();
      expect(projects).toHaveLength(0);
    });

    it('only deletes the specified project', async () => {
      const project1 = await repository.create({ name: 'Keep' });
      const project2 = await repository.create({ name: 'Delete' });

      const app = createTestApp(repository);
      await request(app).delete(`/api/projects/${project2.id}`);

      const projects = await repository.list();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(project1.id);
    });
  });

  describe('DELETE /api/projects/reset', () => {
    it('clears all projects', async () => {
      await repository.create({ name: 'Project 1' });
      await repository.create({ name: 'Project 2' });
      await repository.create({ name: 'Project 3' });

      const app = createTestApp(repository);
      const response = await request(app).delete('/api/projects/reset');

      expect(response.status).toBe(204);

      const projects = await repository.list();
      expect(projects).toHaveLength(0);
    });

    it('succeeds even when no projects exist', async () => {
      const app = createTestApp(repository);
      const response = await request(app).delete('/api/projects/reset');

      expect(response.status).toBe(204);
    });
  });

  describe('validation', () => {
    it('allows extra fields in body (permissive schema)', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'Project',
          extraField: 'should not cause error',
          anotherExtra: 123
        });

      expect(response.status).toBe(201);
      expect(response.body.project.name).toBe('Project');
    });

    it('rejects invalid phase values in metadata', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'Project',
          metadata: { currentPhase: 'invalid-phase' }
        });

      // Zod schema rejects invalid phase values
      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('accepts valid phase values in metadata', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'Project',
          metadata: { currentPhase: 'preprocessing' }
        });

      expect(response.status).toBe(201);
      expect(response.body.project.metadata.currentPhase).toBe('preprocessing');
    });
  });
});
