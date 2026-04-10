import type { FakeProject, FakeUser } from '../types';

export const mockUser: FakeUser = {
  id: 'usr_demo',
  name: 'Demo',
  email: 'demo@agentic-automl.dev',
  avatarUrl: null,
};

export const mockProject: FakeProject = {
  id: 'prj_demo_novacraft',
  name: 'NovaCraft — Customer Churn',
  color: 'violet',
  icon: 'TrendingDown',
  createdAt: '2026-03-12T10:23:00.000Z',
  phases: {
    upload:               'completed',
    'data-viewer':        'completed',
    preprocessing:        'completed',
    'feature-engineering':'completed',
    training:             'completed',
    experiments:          'completed',
    deployment:           'completed',
  },
};
