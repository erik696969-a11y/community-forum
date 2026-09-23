'use client';

// Memoria — board-only modul „elektronický mozog komunity“ (Fáza 1a).
// Údaje chráni databáza (RLS: is_approved_board_member()); presmerovanie
// nižšie je len pohodlie pre používateľa, nie bezpečnostná vrstva.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '../../../lib/useProfile';
import { useLanguage } from '../../../lib/useLanguage';
import { t } from '../../../lib/i18n';
import { mt } from '../../../lib/memoriaI18n';
import Header from '../../components/Header';
import DecisionsPanel from '../../components/memoria/DecisionsPanel';
import SuppliersPanel from '../../components/memoria/SuppliersPanel';
import ActivityFeed from '../../components/memoria/ActivityFeed';
import ContractsPanel from '../../components/memoria/ContractsPanel';
import TendersPanel from '../../components/memoria/TendersPanel';
import InvoicesPanel from '../../components/memoria/InvoicesPanel';
import AlertsBar from '../../components/memoria/AlertsBar';

const TABS = [
  { key: 'decisions', label: 'tabDecisions', icon: '⚖️' },
  { key: 'suppliers', label: 'tabSuppliers', icon: '🏢' },
  { key: 'contracts', label: 'tabContracts', icon: '📑' },
  { key: 'tenders', label: 'tabTenders', icon: '🧾' },
  { key: 'invoices', label: 'tabInvoices', icon: '💶' },
  { key: 'activity', label: 'tabActivity', icon: '🕒' },
];

export default function MemoriaPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const [tab, setTab] = useState('decisions');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (profile && (profile.role !== 'board' || profile.status !== 'approved')) {
      router.replace('/dashboard');
    }
  }, [loading, session, profile, router]);

  if (loading || !profile || profile.role !== 'board' || profile.status !== 'approved') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-harbor">{t(lang, 'loading')}</p>
      </main>
    );
  }

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <main className="min-h-screen">
      <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/admin" className="text-sm text-harbor/70 hover:text-harbor">← {t(lang, 'managementTitle')}</Link>
        <h1 className="font-display text-2xl text-harbor mt-2">🧠 {mt(lang, 'memoriaTitle')}</h1>
        <p className="text-sm text-ink/60 mt-1 mb-6">{mt(lang, 'memoriaSubtitle')}</p>

        <AlertsBar lang={lang} refreshKey={refreshKey} onOpenTab={setTab} />

        <div className="flex gap-1 border-b border-sand-dark mb-6 overflow-x-auto">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${
                tab === tb.key ? 'border-ochre text-harbor' : 'border-transparent text-ink/50 hover:text-harbor'
              }`}
            >
              {tb.icon} {mt(lang, tb.label)}
            </button>
          ))}
        </div>

        {tab === 'decisions' && <DecisionsPanel lang={lang} onChanged={bump} />}
        {tab === 'suppliers' && <SuppliersPanel lang={lang} onChanged={bump} />}
        {tab === 'contracts' && <ContractsPanel lang={lang} onChanged={bump} />}
        {tab === 'tenders' && <TendersPanel lang={lang} onChanged={bump} />}
        {tab === 'invoices' && <InvoicesPanel lang={lang} onChanged={bump} />}
        {tab === 'activity' && <ActivityFeed lang={lang} refreshKey={refreshKey} />}
      </div>
    </main>
  );
}
