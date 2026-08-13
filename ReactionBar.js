'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const EMOJIS = [
  { emoji: '👍', label: 'Helpful' },
  { emoji: '❤️', label: 'Agree' },
  { emoji: '😂', label: 'Funny' },
  { emoji: '👏', label: 'Thanks' },
  { emoji: '⚠️', label: 'Important' },
];

// Generic reaction bar, works for both post_reactions and comment_reactions
// tables since they share the same shape (id, <target>_id, user_id, emoji).
export default function ReactionBar({ table, idField, targetId, reactions, userId, onChange }) {
  const [busy, setBusy] = useState(false);

  const counts = {};
  reactions.forEach((r) => {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  });
  const myReaction = reactions.find((r) => r.user_id === userId);

  async function handleClick(emoji) {
    if (busy) return;
    setBusy(true);

    if (myReaction && myReaction.emoji === emoji) {
      await supabase.from(table).delete().eq(idField, targetId).eq('user_id', userId);
    } else if (myReaction) {
      await supabase.from(table).update({ emoji }).eq(idField, targetId).eq('user_id', userId);
    } else {
      await supabase.from(table).insert({ [idField]: targetId, user_id: userId, emoji });
    }

    setBusy(false);
    onChange();
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {EMOJIS.map(({ emoji, label }) => (
        <button
          key={emoji}
          onClick={() => handleClick(emoji)}
          disabled={busy}
          title={label}
          className={`text-sm px-2 py-0.5 rounded-full border transition-colors ${
            myReaction?.emoji === emoji ? 'bg-ochre/20 border-ochre' : 'border-transparent hover:bg-sand-dark/60'
          }`}
        >
          {emoji}
          {counts[emoji] ? ` ${counts[emoji]}` : ''}
        </button>
      ))}
    </div>
  );
}
