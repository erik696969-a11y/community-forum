'use client';

import Link from 'next/link';
import { t } from '../../lib/i18n';
import { useUnreadMessages } from '../../lib/useUnreadMessages';
import LanguageSwitcher from './LanguageSwitcher';

export default function Header({ profile, lang, onLanguageChange }) {
  const { count, soundEnabled, toggleSound } = useUnreadMessages(profile);

  return (
    <header className="bg-harbor text-sand">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/dashboard" className="font-display text-xl whitespace-nowrap">
          {t(lang, 'appName')}
        </Link>
        <nav className="flex items-center gap-4 text-sm flex-wrap">
          <Link href="/dashboard/documents" className="hover:text-ochre whitespace-nowrap">
            {t(lang, 'documentsTitle')}
          </Link>
          <Link href="/dashboard/events" className="hover:text-ochre whitespace-nowrap">
            {t(lang, 'eventsTitle')}
          </Link>
          <Link href="/dashboard/contacts" className="hover:text-ochre whitespace-nowrap">
            {t(lang, 'contacts')}
          </Link>
          <Link href="/dashboard/messages" className="hover:text-ochre whitespace-nowrap relative">
            {t(lang, 'messages')}
            {count > 0 && (
              <span className="absolute -top-2 -right-3 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </Link>
          <Link href="/dashboard/settings" className="hover:text-ochre whitespace-nowrap">
            {t(lang, 'settingsTitle')}
          </Link>
          {profile?.role === 'board' && (
            <Link href="/admin" className="hover:text-ochre whitespace-nowrap">
              {t(lang, 'admin')}
            </Link>
          )}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Sound notifications: on' : 'Sound notifications: off'}
            className="hover:text-ochre"
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>
          <LanguageSwitcher lang={lang} onChange={onLanguageChange} dark />
          <span className="text-sand/70 hidden sm:inline whitespace-nowrap">
            {profile?.full_name} · {profile?.apartment_number}
          </span>
        </nav>
      </div>
    </header>
  );
}
