// Rozloženie odpovede AI (markdown podmnožina) na bloky: odseky, nadpisy, odrážky, tabuľky, čiary.

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

export function parseAnswer(text) {
  const blocks = [];
  let list = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    // Tabuľka v markdowne: riadok s | a pod ním oddeľovač |---|
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      i -= 1;
      list = null;
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      list = null;
      blocks.push({ type: 'hr' });
      continue;
    }
    const m = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/);
    if (m) {
      if (!list) {
        list = [];
        blocks.push({ type: 'ul', items: list });
      }
      list.push(m[1]);
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(h ? { type: 'h', text: h[1] } : { type: 'p', text: line });
  }
  return blocks;
}
