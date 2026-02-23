import { apiRequest, getApiBaseUrl } from './client';

export interface DocumentUploadResponse {
  document: {
    documentId: string;
    projectId: string;
    filename: string;
    mimeType: string;
    chunkCount: number;
    embeddingDimension: number;
    parseWarning?: string;
  };
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  filename: string;
  score: number;
  snippet: string;
  span: { start: number; end: number };
}

export interface DocumentListItem {
  documentId: string;
  projectId?: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AnswerCitation {
  chunkId: string;
  documentId: string;
  filename: string;
  span: { start: number; end: number };
}

export interface AnswerResponse {
  answer: {
    status: 'ok' | 'not_found';
    answer: string;
    citations: AnswerCitation[];
    meta: {
      cached: boolean;
      latencyMs: number;
      chunksConsidered: number;
      cacheTimestamp?: string;
    };
  };
}

export async function uploadDocument(projectId: string, file: File): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('projectId', projectId);

  const response = await fetch(`${getApiBaseUrl()}/upload/doc`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const fallbackMessage = response.statusText || 'Document upload failed';
    try {
      const payload = await response.json();
      const message =
        typeof payload?.details === 'string'
          ? `${payload.error ?? 'Document upload failed'}: ${payload.details}`
          : payload?.error ?? fallbackMessage;
      throw new Error(message);
    } catch {
      throw new Error(fallbackMessage);
    }
  }

  return response.json() as Promise<DocumentUploadResponse>;
}

export async function listDocuments(projectId?: string): Promise<{ documents: DocumentListItem[] }> {
  const url = projectId ? `/documents?projectId=${projectId}` : '/documents';
  return apiRequest<{ documents: DocumentListItem[] }>(url, { method: 'GET' });
}

export async function downloadDocument(documentId: string): Promise<Blob> {
  const response = await fetch(`${getApiBaseUrl()}/documents/${documentId}/download`, {
    method: 'GET'
  });

  if (!response.ok) {
    const message = response.statusText || 'Document download failed';
    throw new Error(message);
  }

  return response.blob();
}

export async function deleteDocument(documentId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/documents/${documentId}`, {
    method: 'DELETE'
  });
}

export async function searchDocuments(
  projectId: string,
  query: string,
  topK: number = 5
): Promise<{ results: SearchResult[] }> {
  return apiRequest(`/docs/search?projectId=${projectId}&q=${encodeURIComponent(query)}&k=${topK}`, {
    method: 'GET'
  });
}

export async function getAnswer(
  projectId: string,
  question: string,
  topK: number = 3
): Promise<AnswerResponse> {
  return apiRequest('/answer', {
    method: 'POST',
    body: JSON.stringify({ projectId, question, topK })
  });
}
