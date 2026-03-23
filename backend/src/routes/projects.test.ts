import express, { Router } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  hasDatabaseConfigurationMock,
  getDbPoolMock,
  verifyAccessTokenMock,
  findByIdMock
} = vi.hoisted(() => ({
  hasDatabaseConfigurationMock: vi.fn(),
  getDbPoolMock: vi.fn(() => ({})),
  verifyAccessTokenMock: vi.fn(),
  findByIdMock: vi.fn()
}));

vi.mock('../db.js', () => ({
  hasDatabaseConfiguration: hasDatabaseConfigurationMock,
  getDbPool: getDbPoolMock
}));

vi.mock('../repositories/userRepository.js', () => ({
  UserRepository: class MockUserRepository {
    findById = findByIdMock;
  }
}));

vi.mock('../services/authService.js', () => ({
  authService: {
    verifyAccessToken: verifyAccessTokenMock
  }
}));

import { InMemoryProjectRepository } from '../repositories/projectRepository.js';
import { describeRouteSuite } from '../tests/describeRouteSuite.js';

import { registerProjectRoutes } from './projects.js';

const TEST_USER = {
  user_id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  role: 'user' as const,
  email_verified: true,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  last_login_at: null
};

function createTestApp(repository: InMemoryProjectRepository) {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerProjectRoutes(router, repository);
  app.use('/api', router);
  return app;
}

/** Helper: make an authenticated request by setting up the mock chain */
function setupAuth(user = TEST_USER) {
  hasDatabaseConfigurationMock.mockReturnValue(true);
  verifyAccessTokenMock.mockReturnValue({ userId: user.user_id, email: user.email, role: user.role });
  findByIdMock.mockResolvedValue(user);
}

describeRouteSuite('project routes', () => {
  let repository: InMemoryProjectRepository;

  beforeEach(() => {
    repository = new InMemoryProjectRepository();
    vi.clearAllMocks();
    setupAuth();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('authentication', () => {
    it('returns 401 when no auth header is provided', async () => {
      const app = createTestApp(repository);
      const response = await request(app).get('/api/projects');
      expect(response.status).toBe(401);
    });

    it('returns 401 for invalid token', async () => {
      verifyAccessTokenMock.mockReturnValue(null);
      const app = createTestApp(repository);
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer bad-token');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/projects', () => {
    it('returns empty array when no projects exist', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.projects).toEqual([]);
    });

    it('returns only projects owned by the authenticated user', async () => {
      await repository.create({ name: 'My Project', userId: 'user-1' });
      await repository.create({ name: 'Other Project', userId: 'user-2' });

      const app = createTestApp(repository);
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(1);
      expect(response.body.projects[0].name).toBe('My Project');
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns 404 for non-existent project', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .get('/api/projects/non-existent-id')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('returns project by id when owned by user', async () => {
      const created = await repository.create({ name: 'Test Project', description: 'A test', userId: 'user-1' });

      const app = createTestApp(repository);
      const response = await request(app)
        .get(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.project.id).toBe(created.id);
      expect(response.body.project.name).toBe('Test Project');
      expect(response.body.project.description).toBe('A test');
    });

    it('returns 404 for project owned by another user', async () => {
      const created = await repository.create({ name: 'Other Project', userId: 'user-2' });

      const app = createTestApp(repository);
      const response = await request(app)
        .get(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/projects', () => {
    it('creates a new project with minimal data', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'New Project' });

      expect(response.status).toBe(201);
      expect(response.body.project.name).toBe('New Project');
      expect(response.body.project.id).toBeDefined();
      expect(response.body.project.createdAt).toBeDefined();
      expect(response.body.project.updatedAt).toBeDefined();
    });

    it('sets userId from authenticated user', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'New Project' });

      expect(response.status).toBe(201);
      expect(response.body.project.userId).toBe('user-1');
    });

    it('creates a project with all fields', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', 'Bearer valid-token')
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
        .set('Authorization', 'Bearer valid-token')
        .send({ description: 'No name' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('returns 400 when name is empty', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('persists the project to repository', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Persisted Project' });

      const projects = await repository.list();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(response.body.project.id);
    });

    it('sets default metadata', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', 'Bearer valid-token')
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
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('updates project name', async () => {
      const created = await repository.create({ name: 'Original', userId: 'user-1' });

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.project.name).toBe('Updated Name');
    });

    it('updates project description', async () => {
      const created = await repository.create({ name: 'Test', userId: 'user-1' });

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ description: 'New description' });

      expect(response.status).toBe(200);
      expect(response.body.project.description).toBe('New description');
    });

    it('updates project metadata', async () => {
      const created = await repository.create({ name: 'Test', userId: 'user-1' });

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ metadata: { currentPhase: 'preprocessing' } });

      expect(response.status).toBe(200);
      expect(response.body.project.metadata.currentPhase).toBe('preprocessing');
    });

    it('updates updatedAt timestamp', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-11T09:00:00.000Z'));

      const created = await repository.create({ name: 'Test', userId: 'user-1' });
      const originalUpdatedAt = created.updatedAt;

      vi.setSystemTime(new Date('2026-03-11T09:00:01.000Z'));

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated' });

      expect(response.body.project.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('preserves existing fields when not provided', async () => {
      const created = await repository.create({
        name: 'Test',
        description: 'Original description',
        icon: 'folder',
        color: 'blue',
        userId: 'user-1'
      });

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'New Name' });

      expect(response.body.project.name).toBe('New Name');
      expect(response.body.project.description).toBe('Original description');
    });

    it('returns 404 when trying to update another user\'s project', async () => {
      const created = await repository.create({ name: 'Other', userId: 'user-2' });

      const app = createTestApp(repository);
      const response = await request(app)
        .patch(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Hijacked' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('returns 404 for non-existent project', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .delete('/api/projects/non-existent-id')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('deletes an existing project', async () => {
      const created = await repository.create({ name: 'To Delete', userId: 'user-1' });

      const app = createTestApp(repository);
      const response = await request(app)
        .delete(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(204);

      const projects = await repository.list();
      expect(projects).toHaveLength(0);
    });

    it('only deletes the specified project', async () => {
      const project1 = await repository.create({ name: 'Keep', userId: 'user-1' });
      const project2 = await repository.create({ name: 'Delete', userId: 'user-1' });

      const app = createTestApp(repository);
      await request(app)
        .delete(`/api/projects/${project2.id}`)
        .set('Authorization', 'Bearer valid-token');

      const projects = await repository.list();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(project1.id);
    });

    it('returns 404 when trying to delete another user\'s project', async () => {
      const created = await repository.create({ name: 'Other', userId: 'user-2' });

      const app = createTestApp(repository);
      const response = await request(app)
        .delete(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);

      // Verify it wasn't actually deleted
      const project = await repository.getById(created.id);
      expect(project).toBeDefined();
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
        .set('Authorization', 'Bearer valid-token')
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
        .set('Authorization', 'Bearer valid-token')
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
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Project',
          metadata: { currentPhase: 'preprocessing' }
        });

      expect(response.status).toBe(201);
      expect(response.body.project.metadata.currentPhase).toBe('preprocessing');
    });

    it('accepts metadata.projectPlan up to 50000 chars', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Project',
          metadata: { projectPlan: 'a'.repeat(50000) }
        });

      expect(response.status).toBe(201);
      expect(response.body.project.metadata.projectPlan).toHaveLength(50000);
    });

    it('rejects metadata.projectPlan longer than 50000 chars', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Project',
          metadata: { projectPlan: 'a'.repeat(50001) }
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('legacy projects (no userId)', () => {
    it('allows access to legacy projects without a userId', async () => {
      // Legacy projects have no userId set
      const created = await repository.create({ name: 'Legacy Project' });

      const app = createTestApp(repository);
      const response = await request(app)
        .get(`/api/projects/${created.id}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.project.name).toBe('Legacy Project');
    });
  });
});
