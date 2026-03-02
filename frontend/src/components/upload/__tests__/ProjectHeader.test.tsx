import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ProjectHeader } from '../ProjectHeader';
import type { Phase } from '@/types/phase';
import type { Project } from '@/types/project';

const mockProject: Project = {
  id: 'project-1',
  title: 'Employee Attrition',
  description: 'Initial description',
  icon: 'Folder',
  color: 'blue' as const,
  createdAt: new Date('2026-02-27T00:00:00.000Z'),
  updatedAt: new Date('2026-02-27T00:00:00.000Z'),
  unlockedPhases: ['upload'] as Phase[],
  completedPhases: [] as Phase[],
  currentPhase: 'upload' as const,
  metadata: {}
};

describe('ProjectHeader', () => {
  const renderWithRouter = (node: ReactNode) => {
    return render(<MemoryRouter>{node}</MemoryRouter>);
  };

  it('shows only a single-line description field in upload header', () => {
    renderWithRouter(<ProjectHeader project={mockProject} editable />);

    const descriptionInput = screen.getByPlaceholderText('Add a description');
    expect(descriptionInput).toBeInTheDocument();
    expect(descriptionInput).toHaveValue('Initial description');
    expect(screen.queryByText('Employee Attrition')).not.toBeInTheDocument();
  });

  it('persists description edits on blur', () => {
    const onUpdate = vi.fn();
    renderWithRouter(<ProjectHeader project={mockProject} editable onUpdate={onUpdate} />);

    const descriptionInput = screen.getByPlaceholderText('Add a description');
    fireEvent.change(descriptionInput, { target: { value: 'Updated description' } });
    fireEvent.blur(descriptionInput);

    expect(onUpdate).toHaveBeenCalledWith({ description: 'Updated description' });
  });
});
