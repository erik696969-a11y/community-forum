// Porovnanie prekladov DeepL a Claude vedľa seba (iba pre board).
// Nič neukladá – slúži na posúdenie kvality pred prepnutím TRANSLATION_PROVIDER.
//
// POST { texts: string[], authorLang: 'en'|'es'|'fr'|'de' }
// → { sourceLang, active: ['deepl','claude'], results: { deepl: {...}, claude: {...} } }
//   kde každý výsledok je { ok, ms, translations?: { es: [...] }, error? }

import { getAuthedProfile } from '../../../lib/serverAuth';
import { TARGET_LANGS, translateWith, hasClaude, hasDeepL, providerOrder } from '../../../lib/translation';

export const maxDuration = 120;

const DAILY_LIMIT = 60;
const MAX_ITEMS = 5;
const MAX_TEXT_LENGTH = 3000;

async function runProvider(provider, texts, sourceLang) {
  const started = Date.now();
  const targets = TARGET_LANGS.filter((l) => l !== sourceLang);
  try {
    const pairs = await Promise.all(
      targets.map(async (target) => [target.toLowerCase(), await translateWith(provider, texts, sourceLang, target)])
    );
    return { ok: true, ms: Date.now() - started, translations: Object.fromEntries(pairs) };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: e.message };
  }
}

export async function POST(request) {
  try {
    const auth = await getAuthedProfile(request);
    if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.profile.role !== 'board' || auth.profile.status !== 'approved') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { texts, authorLang } = await request.json();
    if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_ITEMS) {
      return Response.json({ error: 'Invalid texts' }, { status: 400 });
    }
    if (texts.some((t) => typeof t !== 'string' || t.length > MAX_TEXT_LENGTH)) {
      return Response.json({ error: 'Invalid texts' }, { status: 400 });
    }

    const { data: allowed, error: rlError } = await auth.adminClient.rpc('check_and_increment_rate_limit', {
      p_user_id: auth.user.id,
      p_endpoint: 'translate-compare',
      p_limit: DAILY_LIMIT,
    });
    if (rlError) return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
    if (!allowed) return Response.json({ error: 'Daily limit reached' }, { status: 429 });

    const sourceLang = TARGET_LANGS.includes((authorLang || '').toUpperCase()) ? authorLang.toUpperCase() : 'EN';

    const [deepl, claude] = await Promise.all([
      hasDeepL() ? runProvider('deepl', texts, sourceLang) : Promise.resolve({ ok: false, ms: 0, error: 'not_configured' }),
      hasClaude() ? runProvider('claude', texts, sourceLang) : Promise.resolve({ ok: false, ms: 0, error: 'not_configured' }),
    ]);

    return Response.json({ sourceLang: sourceLang.toLowerCase(), active: providerOrder(), results: { deepl, claude } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
