// Odtlačok ponúk zákazky: keď sa ponuky zmenia, uložená AI analýza je zastaraná.
export function quotesFingerprint(quotes) {
  return (quotes || [])
    .map((q) => `${q.id}:${Number(q.amount)}:${Boolean(q.vat_included)}:${(q.notes || '').length}`)
    .sort()
    .join('|');
}
