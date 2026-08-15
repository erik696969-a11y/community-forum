import crypto from 'crypto';

// Bezpečnostný backlog #2: reply-to adresa nesie len krátky náhodný token
// (nie dlhý podpísaný reťazec s celými UUID - to narážalo na RFC 5321 limit
// 64 znakov pre lokálnu časť e-mailovej adresy a Resend to preto vždy
// odmietal). Párovanie token -> {postId, userId} je uložené v tabuľke
// email_reply_tokens. Token samotný je 128-bitový náhodný reťazec - jeho
// samotná existencia v databáze je dôkaz, že sme ho MY vygenerovali a
// poslali konkrétnemu členovi pre konkrétny príspevok.

const DOMAIN = 'kareipixai.resend.app';

function generateToken() {
  return crypto.randomBytes(16).toString('hex'); // 32 hex znakov
}

// Vygeneruje reply-to adresy pre viacero príjemcov naraz (1 DB insert).
// Vracia Map<userId, replyToAddress>.
export async function buildReplyToAddresses(adminClient, postId, userIds) {
  const rows = userIds.map((userId) => ({
    token: generateToken(),
    post_id: postId,
    user_id: userId,
  }));

  if (rows.length > 0) {
    const { error } = await adminClient.from('email_reply_tokens').insert(rows);
    if (error) {
      throw new Error(`Failed to store email reply tokens: ${error.message}`);
    }
  }

  const map = new Map();
  rows.forEach((row) => {
    map.set(row.user_id, `reply-${row.token}@${DOMAIN}`);
  });
  return map;
}

// Rozparsuje prijatú "to" adresu a vyhľadá zodpovedajúci token v databáze.
// Vracia { postId, userId } alebo null, ak token nesedí/neexistuje.
export async function resolveReplyToken(adminClient, address) {
  const match = (address || '').match(/^reply-([0-9a-f]{32})@/i);
  if (!match) return null;

  const token = match[1];

  const { data } = await adminClient
    .from('email_reply_tokens')
    .select('post_id, user_id')
    .eq('token', token)
    .maybeSingle();

  if (!data) return null;

  return { postId: data.post_id, userId: data.user_id };
}
