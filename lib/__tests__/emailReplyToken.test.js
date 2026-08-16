import { describe, it, expect, vi } from 'vitest';
import { buildReplyToAddresses, resolveReplyToken } from '../emailReplyToken';

function makeMockAdminClient({ insertError = null, lookupData = null } = {}) {
  const inserted = [];
  return {
    inserted,
    from: (table) => ({
      insert: async (rows) => {
        inserted.push(...rows);
        return { error: insertError };
      },
      select: () => ({
        eq: (col, val) => ({
          maybeSingle: async () => ({ data: lookupData }),
        }),
      }),
    }),
  };
}

describe('buildReplyToAddresses', () => {
  it('generates one short reply-to address per recipient, well under the 64-char RFC 5321 limit', async () => {
    const admin = makeMockAdminClient();
    const map = await buildReplyToAddresses(admin, 'post-1', ['user-a', 'user-b']);

    expect(map.size).toBe(2);
    for (const address of map.values()) {
      const localPart = address.split('@')[0];
      // Bezpečnostný backlog #2 (regresia, ktorú sme opravili): pôvodný
      // podpísaný formát mal cez 100 znakov a Resend ho vždy odmietal.
      expect(localPart.length).toBeLessThanOrEqual(64);
      expect(address).toMatch(/^reply-[0-9a-f]{32}@kareipixai\.resend\.app$/);
    }
  });

  it('stores one row per recipient with the correct post_id/user_id pairing', async () => {
    const admin = makeMockAdminClient();
    await buildReplyToAddresses(admin, 'post-1', ['user-a', 'user-b']);
    expect(admin.inserted).toHaveLength(2);
    expect(admin.inserted.map((r) => r.user_id).sort()).toEqual(['user-a', 'user-b']);
    expect(admin.inserted.every((r) => r.post_id === 'post-1')).toBe(true);
  });

  it('throws if the database insert fails, so a caller cannot silently send unusable reply-to addresses', async () => {
    const admin = makeMockAdminClient({ insertError: { message: 'db down' } });
    await expect(buildReplyToAddresses(admin, 'post-1', ['user-a'])).rejects.toThrow();
  });
});

describe('resolveReplyToken', () => {
  it('returns null for an address that does not match the reply-<token>@ pattern', async () => {
    const admin = makeMockAdminClient({ lookupData: null });
    const result = await resolveReplyToken(admin, 'post-abc-123@old-format.example.com');
    expect(result).toBeNull();
  });

  it('returns null when the token is well-formed but not found in the database (invalid/expired)', async () => {
    const admin = makeMockAdminClient({ lookupData: null });
    const token = '0'.repeat(32);
    const result = await resolveReplyToken(admin, `reply-${token}@kareipixai.resend.app`);
    expect(result).toBeNull();
  });

  it('resolves a known token to its postId/userId', async () => {
    const admin = makeMockAdminClient({ lookupData: { post_id: 'post-1', user_id: 'user-a' } });
    const token = '0'.repeat(32);
    const result = await resolveReplyToken(admin, `reply-${token}@kareipixai.resend.app`);
    expect(result).toEqual({ postId: 'post-1', userId: 'user-a' });
  });
});
