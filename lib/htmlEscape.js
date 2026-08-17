// Escapes user-controlled text before it's interpolated into a manually
// built HTML email string (post titles, names, group names, apartment
// numbers...). React escapes automatically in the app UI, but these email
// templates build raw HTML strings by hand, so this has to be done
// explicitly here. Always wrap any user-generated value with this before
// putting it inside an email's `html` field.
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
