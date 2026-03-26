import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { streamNlQuery, type NlQueryStreamEvent } from '../query';
import { createNdjsonResponse, getRequestHeader } from './testUtils';
import { useAuthStore } from '@/stores/authStore';

describe('streamNlQuery', () => {
  beforeEach(() => {
    useAuthStore.getState().setTokens('query-access-token', 'query-refresh-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
  });

  it('emits terminal done when stream completes without explicit done event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createNdjsonResponse([
        `${JSON.stringify({ type: 'phase_started', phaseId: 'planning', summary: 'Planning', timestamp: new Date().toISOString() })}\n`
      ])
    );

    const events: NlQueryStreamEvent[] = [];
    await streamNlQuery(
      { projectId: '550e8400-e29b-41d4-a716-446655440000', query: 'show users' },
      (event) => events.push(event)
    );

    expect(events.some((event) => event.type === 'phase_started')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('emits parse failure when malformed NDJSON line is encountered', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createNdjsonResponse([
        'not-json\n',
        `${JSON.stringify({ type: 'done' })}\n`
      ])
    );

    const events: NlQueryStreamEvent[] = [];
    await streamNlQuery(
      { projectId: '550e8400-e29b-41d4-a716-446655440000', query: 'show users' },
      (event) => events.push(event)
    );

    expect(events.some((event) =>
      event.type === 'phase_failed'
      && event.phaseId === 'done'
      && event.summary.includes('parse')
    )).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('emits tail parse failure when trailing buffer is malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createNdjsonResponse(['{"type":"phase_started","phaseId":"planning","summary":"Planning","timestamp":"2026-03-04T00:00:00.000Z"}\n', 'bad-tail'])
    );

    const events: NlQueryStreamEvent[] = [];
    await streamNlQuery(
      { projectId: '550e8400-e29b-41d4-a716-446655440000', query: 'show users' },
      (event) => events.push(event)
    );

    expect(events.some((event) =>
      event.type === 'phase_failed'
      && event.phaseId === 'done'
      && event.summary.includes('tail')
    )).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('parses model work events across chunk boundaries', async () => {
    const firstHalf = '{"type":"model_work_delta","blockId":"plan-1","kind":"plan","title":"Query planning","delta":"Selecting ';
    const secondHalf = 'the users table.","timestamp":"2026-03-05T00:00:00.000Z"}\n';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createNdjsonResponse([
        firstHalf,
        secondHalf,
        `${JSON.stringify({ type: 'done' })}\n`
      ])
    );

    const events: NlQueryStreamEvent[] = [];
    await streamNlQuery(
      { projectId: '550e8400-e29b-41d4-a716-446655440000', query: 'show users' },
      (event) => events.push(event)
    );

    expect(events).toContainEqual(expect.objectContaining({
      type: 'model_work_delta',
      blockId: 'plan-1',
      delta: 'Selecting the users table.'
    }));
    expect(events.at(-1)?.type).toBe('done');
  });

  it('sends the bearer token for NL stream requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createNdjsonResponse([`${JSON.stringify({ type: 'done' })}\n`])
    );

    await streamNlQuery(
      { projectId: '550e8400-e29b-41d4-a716-446655440000', query: 'show users' },
      () => undefined
    );

    const [, init] = fetchSpy.mock.calls[0];
    expect(getRequestHeader(init, 'Authorization')).toBe('Bearer query-access-token');
    expect(getRequestHeader(init, 'Accept')).toBe('application/x-ndjson');
  });
});
