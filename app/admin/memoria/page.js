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
import ReportPanel from '../../components/memoria/ReportPanel';
import TasksPanel from '../../components/memoria/TasksPanel';
import CalendarPanel from '../../components/memoria/CalendarPanel';
import MeetingsPanel from '../../components/memoria/MeetingsPanel';
import HomePanel from '../../components/memoria/HomePanel';
import HandoverPanel from '../../components/memoria/HandoverPanel';
import AskPanel from '../../components/memoria/AskPanel';
import MandatesPanel from '../../components/memoria/MandatesPanel';
import ExportPanel from '../../components/memoria/ExportPanel';
import BudgetPanel from '../../components/memoria/BudgetPanel';
import CasesPanel from '../../components/memoria/CasesPanel';
import { supabase } from '../../../lib/supabaseClient';

// Karty v troch skupinách, aby sa v module dalo ľahko zorientovať.
const TAB_GROUPS = [
  {
    label: 'navGroupGovernance',
    tabs: [
      { key: 'home', label: 'tabHome', icon: '🏠' },
      { key: 'tasks', label: 'tabTasks', icon: '✅' },
      { key: 'calendar', label: 'tabCalendar', icon: '📅' },
      { key: 'meetings', label: 'tabMeetings', icon: '🗓️' },
      { key: 'decisions', label: 'tabDecisions', icon: '⚖️' },
      { key: 'mandates', label: 'tabMandates', icon: '👥' },
      { key: 'cases', label: 'tabCases', icon: '🛡️' },
    ],
  },
  {
    label: 'navGroupMoney',
    tabs: [
      { key: 'suppliers', label: 'tabSuppliers', icon: '🏢' },
      { key: 'tenders', label: 'tabTenders', icon: '🧾' },
      { key: 'contracts', label: 'tabContracts', icon: '📑' },
      { key: 'invoices', label: 'tabInvoices', icon: '💶' },
      { key: 'budget', label: 'tabBudget', icon: '💰' },
    ],
  },
  {
    label: 'navGroupReports',
    tabs: [
      { key: 'ask', label: 'tabAsk', icon: '💬' },
      { key: 'report', label: 'tabReport', icon: '📊' },
      { key: 'handover', label: 'tabHandover', icon: '📦' },
      { key: 'activity', label: 'tabActivity', icon: '🕒' },
      { key: 'export', label: 'tabExport', icon: '💾' },
    ],
  },
];

export default function MemoriaPage() {
  const { loading, session, profile } = useProfile();
  const [lang, setLang] = useLanguage(profile);
  const router = useRouter();
  const [tab, setTab] = useState('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasDemo, setHasDemo] = useState(false);

  const isBoard = profile?.role === 'board' && profile?.status === 'approved';

  // Upozornenie, že v Memorii sú ukážkové dáta (DEMO).
  useEffect(() => {
    if (!isBoard) return;
    (async () => {
      const [a, b, c] = await Promise.all([
        supabase.from('memoria_tasks').select('id').eq('is_demo', true).limit(1),
        supabase.from('memoria_suppliers').select('id').eq('is_demo', true).limit(1),
        supabase.from('memoria_decisions').select('id').eq('is_demo', true).limit(1),
      ]);
      setHasDemo([a, b, c].some((r) => (r.data || []).length > 0));
    })();
  }, [isBoard, refreshKey]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login?next=/admin/memoria');
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
      <div className="print:hidden">
        <Header profile={profile} lang={lang} onLanguageChange={setLang} />
      </div>
      <div className="max-w-4xl mx-auto px-4 py-8 print:py-0">
        <div className="print:hidden">
          <Link href="/admin" className="text-sm text-harbor/70 hover:text-harbor">← {t(lang, 'managementTitle')}</Link>
        </div>
        <h1 className={`font-display text-2xl text-harbor mt-2 ${tab === 'meetings' || tab === 'handover' ? 'print:hidden' : ''}`}>🧠 {mt(lang, 'memoriaTitle')}</h1>
        <p className="text-sm text-ink/60 mt-1 mb-6 print:hidden">{mt(lang, 'memoriaSubtitle')}</p>

        {hasDemo && (
          <p className="text-xs text-ochre border border-dashed border-ochre rounded-md px-3 py-2 mb-4 print:hidden">
            DEMO · {mt(lang, 'demoNotice')}
          </p>
        )}

        <nav className="border-b border-sand-dark mb-6 print:hidden">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {TAB_GROUPS.map((g) => (
              <div key={g.label} className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-ink/40 font-semibold px-1">{mt(lang, g.label)}</p>
                <div className="flex flex-wrap gap-1">
                  {g.tabs.map((tb) => (
                    <button
                      key={tb.key}
                      onClick={() => setTab(tb.key)}
                      className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${
                        tab === tb.key ? 'border-ochre text-harbor' : 'border-transparent text-ink/50 hover:text-harbor'
                      }`}
                    >
                      {tb.icon} {mt(lang, tb.label)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {tab === 'home' && <HomePanel lang={lang} profile={profile} refreshKey={refreshKey} onOpenTab={setTab} />}
        {tab === 'ask' && <AskPanel lang={lang} />}
        {tab === 'handover' && <HandoverPanel lang={lang} profile={profile} />}
        {tab === 'tasks' && <TasksPanel lang={lang} onChanged={bump} />}
        {tab === 'calendar' && <CalendarPanel lang={lang} onChanged={bump} onOpenTab={setTab} />}
        {tab === 'meetings' && <MeetingsPanel lang={lang} onChanged={bump} />}
        {tab === 'decisions' && <DecisionsPanel lang={lang} onChanged={bump} />}
        {tab === 'suppliers' && <SuppliersPanel lang={lang} onChanged={bump} />}
        {tab === 'contracts' && <ContractsPanel lang={lang} onChanged={bump} />}
        {tab === 'tenders' && <TendersPanel lang={lang} onChanged={bump} />}
        {tab === 'invoices' && <InvoicesPanel lang={lang} onChanged={bump} />}
        {tab === 'report' && <ReportPanel lang={lang} />}
        {tab === 'activity' && <ActivityFeed lang={lang} refreshKey={refreshKey} />}
        {tab === 'mandates' && <MandatesPanel lang={lang} profile={profile} onChanged={bump} />}
        {tab === 'export' && <ExportPanel lang={lang} profile={profile} />}
        {tab === 'budget' && <BudgetPanel lang={lang} onChanged={bump} />}
        {tab === 'cases' && <CasesPanel lang={lang} onChanged={bump} />}
      </div>
    </main>
  );
}
