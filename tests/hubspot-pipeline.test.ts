import { afterEach, describe, expect, it, vi } from 'vitest';
import { daysSince, fetchStageEntryDates, searchHubSpotDeals } from '@/lib/integrations/hubspot-pipeline';

afterEach(() => vi.unstubAllGlobals());

describe('HubSpot pagination and stage history', () => {
  it('paginates, deduplicates IDs, and carries the next cursor', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: '1', properties: {} }, { id: '2', properties: {} }], paging: { next: { after: '100' } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: '2', properties: {} }, { id: '3', properties: {} }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const deals = await searchHubSpotDeals('token', [], ['dealname']);
    expect(deals.map((deal) => deal.id)).toEqual(['1', '2', '3']);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).after).toBe(100);
  });

  it('rejects repeated cursors instead of looping forever', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [], paging: { next: { after: '1' } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [], paging: { next: { after: '1' } } }), { status: 200 })));
    await expect(searchHubSpotDeals('token', [], [])).rejects.toThrow('cursor');
  });

  it('retries a bounded 429 and succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: '1', properties: {} }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await searchHubSpotDeals('token', [], [])).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the latest entry into the current stage, not deal creation time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ id: 'd1', propertiesWithHistory: { dealstage: [
      { value: 'qualified', timestamp: '2026-01-01T00:00:00.000Z' },
      { value: 'proposal', timestamp: '2026-02-01T00:00:00.000Z' },
      { value: 'qualified', timestamp: '2026-03-01T00:00:00.000Z' },
    ] } }] }), { status: 200 })));
    const result = await fetchStageEntryDates('token', [{ id: 'd1', currentStage: 'qualified' }]);
    expect(result.get('d1')).toBe('2026-03-01T00:00:00.000Z');
  });

  it('returns null rather than NaN for missing or invalid dates', () => {
    expect(daysSince(null)).toBeNull();
    expect(daysSince('not-a-date')).toBeNull();
    expect(daysSince('2026-01-01T00:00:00.000Z', Date.parse('2026-01-02T00:00:00.000Z'))).toBe(1);
  });
});
