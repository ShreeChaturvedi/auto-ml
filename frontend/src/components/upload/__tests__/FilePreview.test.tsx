import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FilePreview } from '../FilePreview';
import type { UploadedFile } from '@/types/file';
import { downloadDataset, getDatasetSample } from '@/lib/api/datasets';

vi.mock('@/lib/api/datasets', () => ({
  downloadDataset: vi.fn(),
  getDatasetSample: vi.fn(),
}));

function createUploadedFile(partial: Partial<UploadedFile> & Pick<UploadedFile, 'name' | 'type' | 'size' | 'projectId'>): UploadedFile {
  return {
    id: partial.id ?? crypto.randomUUID(),
    uploadedAt: partial.uploadedAt ?? new Date('2026-04-23T17:00:00.000Z'),
    ...partial,
  };
}

describe('FilePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses fresh TSV uploads with tab delimiters', async () => {
    const file = new File(['id\tregion\n1\tNorth\n2\tSouth\n'], 'orders.tsv', {
      type: 'text/tab-separated-values',
    });

    render(
      <FilePreview
        file={createUploadedFile({
          name: file.name,
          type: 'csv',
          size: file.size,
          projectId: 'project-1',
          file,
        })}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(await screen.findByText('id')).toBeInTheDocument();
    expect(screen.getByText('region')).toBeInTheDocument();
    expect(screen.getByText('North')).toBeInTheDocument();
  });

  it('parses fresh JSONL uploads as row-based dataset previews', async () => {
    const file = new File(['{"id":1,"event":"signup"}\n{"id":2,"event":"purchase"}\n'], 'events.jsonl', {
      type: 'application/x-ndjson',
    });

    render(
      <FilePreview
        file={createUploadedFile({
          name: file.name,
          type: 'json',
          size: file.size,
          projectId: 'project-1',
          file,
        })}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(await screen.findByText('event')).toBeInTheDocument();
    expect(screen.getByText('signup')).toBeInTheDocument();
    expect(screen.getByText('purchase')).toBeInTheDocument();
  });

  it('falls back to raw dataset download when the sample endpoint fails for TSV datasets', async () => {
    vi.mocked(getDatasetSample).mockRejectedValue(new Error('sample failed'));
    vi.mocked(downloadDataset).mockResolvedValue(
      new TextEncoder().encode('id\tsegment\n1\tEnterprise\n2\tSMB\n').buffer
    );

    render(
      <FilePreview
        file={createUploadedFile({
          name: 'northstar.tsv',
          type: 'csv',
          size: 32,
          projectId: 'project-1',
          metadata: {
            datasetId: 'dataset-1',
          },
        })}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(await screen.findByText('segment')).toBeInTheDocument();
    expect(screen.getByText('Enterprise')).toBeInTheDocument();
    await waitFor(() => {
      expect(getDatasetSample).toHaveBeenCalledWith('dataset-1');
      expect(downloadDataset).toHaveBeenCalledWith('dataset-1');
    });
  });
});
