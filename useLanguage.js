'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { DEFAULT_LANG } from './i18n';

export function useLanguage(profile) {
  const [lang, setLangState] = useState(DEFAULT_LANG);

  useEffect(() => {
    if (profile?.language) {
      setLangState(profile.language);
    } else if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('lang');
      if (stored) setLangState(stored);
    }
  }, [profile]);

  async function setLanguage(newLang) {
    setLangState(newLang);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lang', newLang);
    }
    if (profile?.id) {
      await supabase.rpc('update_own_preferences', { p_language: newLang });
    }
  }

  return [lang, setLanguage];
}
