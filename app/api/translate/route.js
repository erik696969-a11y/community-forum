const TARGET_LANGS = ['EN', 'ES', 'FR', 'DE'];

async function callDeepL(texts, targetLang) {
  const apiKey = process.env.DEEPL_API_KEY;
  const isFree = apiKey && apiKey.endsWith(':fx');
  const url = isFree
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const params = new URLSearchParams();
  texts.forEach((text) => params.append('text', text));
  params.append('target_lang', targetLang);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`DeepL error: ${response.status}`);
  }

  const data = await response.json();
  return data.translations; // array of { detected_source_language, text }
}

// POST body: { texts: string[] }
// Returns: { originalLang: 'en', translations: { en: [...], es: [...], fr: [...], de: [...] } }
export async function POST(request) {
  try {
    const { texts } = await request.json();

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return Response.json({ error: 'No texts provided' }, { status: 400 });
    }

    if (!process.env.DEEPL_API_KEY) {
      // No translation configured - just echo back originals for every language
      const fallback = {};
      TARGET_LANGS.forEach((l) => {
        fallback[l.toLowerCase()] = texts;
      });
      return Response.json({ originalLang: 'es', translations: fallback });
    }

    // First call: translate to EN, this also tells us the detected source language
    const firstBatch = await callDeepL(texts, 'EN');
    const detectedLang = (firstBatch[0]?.detected_source_language || 'ES').toLowerCase();

    const translations = {};
    translations.en = firstBatch.map((t) => t.text);
    translations[detectedLang] = texts; // original text for its own language

    const remainingLangs = TARGET_LANGS.filter(
      (l) => l.toLowerCase() !== 'en' && l.toLowerCase() !== detectedLang
    );

    for (const targetLang of remainingLangs) {
      const batch = await callDeepL(texts, targetLang);
      translations[targetLang.toLowerCase()] = batch.map((t) => t.text);
    }

    // Ensure all 4 languages are present even if something was skipped
    TARGET_LANGS.forEach((l) => {
      const key = l.toLowerCase();
      if (!translations[key]) translations[key] = texts;
    });

    return Response.json({ originalLang: detectedLang, translations });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
