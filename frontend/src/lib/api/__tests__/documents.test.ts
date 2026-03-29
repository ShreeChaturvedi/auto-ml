import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/authStore';
import { downloadDocument, uploadDocument } from '../documents';
import { getRequestHeader } from './testUtils';

describe('downloadDocument', () => {
  beforeEach(() => {
    useAuthStore.getState().setTokens('test-access-token', 'test-refresh-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
  });

  it('sends Authorization header with the access token', async () => {
    const blob = new Blob(['pdf-content'], { type: 'application/pdf' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(blob, { status: 200 }));

    await downloadDocument('doc-123');

    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(getRequestHeader(init, 'Authorization')).toBe('Bearer test-access-token');
  });

  it('returns a Blob on success', async () => {
    const blob = new Blob(['file-bytes'], { type: 'application/pdf' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(blob, { status: 200 }));

    const result = await downloadDocument('doc-123');
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it('throws with backend error message on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(downloadDocument('doc-123')).rejects.toThrow('Authentication required');
  });

  it('falls back to statusText when body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', { status: 500, statusText: 'Internal Server Error' })
    );

    await expect(downloadDocument('doc-123')).rejects.toThrow('Internal Server Error');
  });
});

describe('uploadDocument', () => {
  beforeEach(() => {
    useAuthStore.getState().setTokens('test-access-token', 'test-refresh-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
  });

  it('sends Authorization header with the access token', async () => {
    const response = {
      document: {
        documentId: 'd1',
        projectId: 'p1',
        filename: 'file.pdf',
        mimeType: 'application/pdf',
        chunkCount: 1,
        embeddingDimension: 768
      }
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const file = new File(['content'], 'file.pdf', { type: 'application/pdf' });
    await uploadDocument('project-1', file);

    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(getRequestHeader(init, 'Authorization')).toBe('Bearer test-access-token');
  });
});
