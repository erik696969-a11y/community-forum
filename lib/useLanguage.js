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

  // i18n oprava: koreňový layout appky nemá pri serverovom vykreslení ako
  // vedieť, aký jazyk si užívateľ zvolil (to sa zistí až po prihlásení na
  // klientovi) - takže <html lang="en"> je natvrdo nastavené v layout.js.
  // Toto to dorovná hneď, ako appka reálny jazyk zistí, aby atribút lang
  // v prehliadači zodpovedal skutočne zobrazenému textu (dôležité pre
  // čítačky obrazovky a automatický preklad prehliadača).
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

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
