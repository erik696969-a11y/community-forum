'use client';

import { badgeEmoji } from '../../lib/badges';

export default function AuthorBadges({ badges }) {
  if (!badges || badges.length === 0) return null;
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {badges.map((b) => (
        <span key={b} title={b}>
          {badgeEmoji(b)}
        </span>
      ))}
    </span>
  );
}
