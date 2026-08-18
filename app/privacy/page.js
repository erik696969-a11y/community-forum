'use client';

import Link from 'next/link';
import { useLanguage } from '../../lib/useLanguage';
import { privacyContent } from '../../lib/privacyContent';
import { resolveBrandPlaceholders } from '../../lib/brandConfig';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function PrivacyPage() {
  const [lang, setLang] = useLanguage(null);
  const content = privacyContent[lang] || privacyContent.en;

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/login" className="text-sm text-harbor/70 hover:text-harbor">
            ← Back
          </Link>
          <LanguageSwitcher lang={lang} onChange={setLang} />
        </div>

        <div className="card p-8">
          <h1 className="font-display text-2xl text-harbor mb-1">{content.title}</h1>
          <p className="text-xs text-ink/50 mb-6">{content.updated}</p>

          <div className="space-y-5">
            {content.sections.map((section) => (
              <div key={section.heading}>
                <h2 className="font-semibold text-harbor mb-1">{section.heading}</h2>
                <p className="text-sm text-ink/80 leading-relaxed">{resolveBrandPlaceholders(section.body)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
