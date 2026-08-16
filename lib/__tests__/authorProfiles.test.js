import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('../supabaseClient', () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
}));

const { fetchAuthorProfiles, attachAuthors } = await import('../authorProfiles');

describe('fetchAuthorProfiles', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('returns an empty Map without calling the RPC when there are no ids', async () => {
    const map = await fetchAuthorProfiles([]);
    expect(map.size).toBe(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('de-duplicates ids before calling the RPC (bezpečnostný backlog #1: get_author_profiles)', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'a', full_name: 'Erik' }], error: null });
    await fetchAuthorProfiles(['a', 'a', 'a', null, undefined]);
    expect(rpcMock).toHaveBeenCalledWith('get_author_profiles', { p_ids: ['a'] });
  });

  it('builds a Map keyed by profile id from the RPC response', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { id: 'a', full_name: 'Erik', apartment_number: '1.1.1', badges: [] },
        { id: 'b', full_name: 'Orsolya', apartment_number: '14G2', badges: [] },
      ],
      error: null,
    });
    const map = await fetchAuthorProfiles(['a', 'b']);
    expect(map.get('a').full_name).toBe('Erik');
    expect(map.get('b').full_name).toBe('Orsolya');
  });

  it('returns an empty Map (not a thrown error) if the RPC call fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const map = await fetchAuthorProfiles(['a']);
    expect(map.size).toBe(0);
  });
});

describe('attachAuthors', () => {
  it('attaches the matching author onto each row by default idField/asField', () => {
    const map = new Map([['u1', { full_name: 'Erik' }]]);
    const rows = [{ id: 1, author_id: 'u1' }];
    const result = attachAuthors(rows, map);
    expect(result[0].author.full_name).toBe('Erik');
  });

  it('sets author to null when there is no matching profile in the map (deleted/unknown user)', () => {
    const map = new Map();
    const rows = [{ id: 1, author_id: 'ghost' }];
    const result = attachAuthors(rows, map);
    expect(result[0].author).toBeNull();
  });

  it('supports a custom idField and asField, e.g. event photo uploader', () => {
    const map = new Map([['u2', { full_name: 'Orsolya' }]]);
    const rows = [{ id: 1, uploaded_by: 'u2' }];
    const result = attachAuthors(rows, map, { idField: 'uploaded_by', asField: 'uploader' });
    expect(result[0].uploader.full_name).toBe('Orsolya');
  });

  it('handles an empty/undefined rows array without throwing', () => {
    expect(attachAuthors(undefined, new Map())).toEqual([]);
    expect(attachAuthors([], new Map())).toEqual([]);
  });
});
