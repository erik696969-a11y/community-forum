export const BADGE_OPTIONS = [
  { key: 'helpful_member', emoji: '🌟', label: 'Helpful Member' },
  { key: 'community_contributor', emoji: '🤝', label: 'Community Contributor' },
  { key: 'verified_owner', emoji: '✅', label: 'Verified Owner' },
  { key: 'top_photographer', emoji: '📷', label: 'Top Photographer' },
];

export function badgeEmoji(key) {
  return BADGE_OPTIONS.find((b) => b.key === key)?.emoji || '';
}
