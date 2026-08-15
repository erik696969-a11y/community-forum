import crypto from 'crypto';

// Bezpečnostný backlog #2: predtým appka identifikovala odosielateľa e-mailovej
// odpovede LEN podľa hlavičky "From:" - tá sa dá sfalšovať. Táto reply-to
// adresa namiesto toho nesie kryptografický podpis (HMAC) konkrétnej dvojice
// post+užívateľ, takže appka dokáže overiť, že mailová schránka Resendu
// skutočne dostala správu určenú TOMUTO konkrétnemu členovi pre TENTO
// konkrétny príspevok - nie len že sa "From:" zhoduje s niekým v databáze.
//
// Formát adresy: post-<postId>-<userId>-<token>@<domain>

const DOMAIN = 'kareipixai.resend.app';

function getSecret() {
  const secret = process.env.EMAIL_REPLY_TOKEN_SECRET;
  if (!secret) {
    throw new Error('EMAIL_REPLY_TOKEN_SECRET nie je nastavený v premenných prostredia.');
  }
  return secret;
}

function sign(postId, userId) {
  return crypto
    .createHmac('sha256', getSecret())
    .update(`${postId}:${userId}`)
    .digest('hex')
    .slice(0, 24);
}

// Vygeneruje jedinečnú reply-to adresu pre konkrétneho príjemcu a príspevok.
export function buildReplyToAddress(postId, userId) {
  const token = sign(postId, userId);
  return `post-${postId}-${userId}-${token}@${DOMAIN}`;
}

// Rozparsuje prijatú "to" adresu na { postId, userId, token }, alebo null,
// ak formát nesedí (napr. stará adresa spred nasadenia tejto opravy).
export function parseReplyToAddress(address) {
  const match = (address || '').match(
    /^post-([0-9a-f-]{36})-([0-9a-f-]{36})-([0-9a-f]+)@/i
  );
  if (!match) return null;
  const [, postId, userId, token] = match;
  return { postId, userId, token };
}

// Overí, že token v prijatej adrese je platný podpis pre danú dvojicu
// post+užívateľ - konštantno-časové porovnanie kvôli timing-attackom.
export function verifyReplyToken(postId, userId, token) {
  if (!token) return false;
  const expected = sign(postId, userId);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
