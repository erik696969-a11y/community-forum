'use client';

import { useEffect } from 'react';

// Automatically re-runs the given callback whenever the user comes back to
// this tab/app (e.g. switches back from another app, or from the email app
// after replying) — so new content shows up without having to fully close
// and reopen the app.
export function useRefreshOnFocus(callback) {
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        callback();
      }
    }
    window.addEventListener('focus', callback);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', callback);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
