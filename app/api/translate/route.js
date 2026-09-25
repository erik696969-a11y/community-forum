import { getAuthedProfile } from '../../../lib/serverAuth';
import { TARGET_LANGS, translateAll } from '../../../lib/translation';

const DAILY_LIMIT = 200;
const MAX_ITEMS = 10;
const MAX_TEXT_LENGTH = 5000;

export const maxDuration = 120;

// POST body: { texts: string[], authorLang: 'en'|'es'|'fr'|'de' }
// Returns: { originalLang: 'en', translations: { en: [...], es: [...], fr: [...], de: [...] } }
//
// Note: we deliberately use the AUTHOR'S OWN app language as the source
// language, instead of letting the translator auto-detect it. Auto-detection is
// unreliable for short or ambiguous text (e.g. the English word "gate"
// is also a valid Swedish word meaning "street", which a translator would
// happily "detect" and mistranslate). Since we already know which of
// our 4 supported languages the person is writing in, that's a far more
// reliable signal than guessing from a few words.
export async function POST(request) {
  try {
    const auth = await getAuthedProfile(request);
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (auth.profile.status !== 'approved') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { texts, authorLang } = await request.json();

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return Response.json({ error: 'No texts provided' }, { status: 400 });
    }

    if (texts.length > MAX_ITEMS) {
      return Response.json({ error: 'Too many items in one request' }, { status: 400 });
    }

    if (texts.some((text) => typeof text === 'string' && text.length > MAX_TEXT_LENGTH)) {
      return Response.json({ error: 'One or more texts are too long' }, { status: 400 });
    }

    // Per-user daily rate limit, so a single account can't rack up a large
    // translation bill by hammering this endpoint.
    const { data: allowed, error: rateLimitError } = await auth.adminClient.rpc('check_and_increment_rate_limit', {
      p_user_id: auth.user.id,
      p_endpoint: 'translate',
      p_limit: DAILY_LIMIT,
    });

    if (rateLimitError) {
      console.error('translate rate limit check failed:', rateLimitError);
      return Response.json({ error: 'Translation is temporarily unavailable. Please try again later.' }, { status: 503 });
    }
    if (!allowed) {
      return Response.json({ error: 'Daily translation limit reached. Please try again tomorrow.' }, { status: 429 });
    }

    const sourceLang = TARGET_LANGS.includes((authorLang || '').toUpperCase())
      ? authorLang.toUpperCase()
      : 'EN';

    // Hlavný poskytovateľ podľa TRANSLATION_PROVIDER, druhý ako záloha
    // (lib/translation.js). Bez poskytovateľa sa vrátia originály.
    const { translations } = await translateAll(texts, sourceLang);

    return Response.json({ originalLang: sourceLang.toLowerCase(), translations });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
