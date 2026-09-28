// Text z dokumentu Word (.docx) – odseky po riadkoch, bunky tabuliek oddelené „ | “.
// Stačí na prečítanie zápisnice; formátovanie sa zahodí.

import JSZip from 'jszip';

function decode(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

export function documentXmlToText(xml) {
  const body = String(xml || '');
  const out = [];
  // Tabuľkové riadky: bunky do jedného riadku.
  const parts = body.split(/(<w:tr[\s>][\s\S]*?<\/w:tr>)/);
  for (const part of parts) {
    if (part.startsWith('<w:tr')) {
      const cells = part.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
      out.push(cells.map((c) => paragraphsText(c).join(' ').trim()).join(' | '));
    } else {
      out.push(...paragraphsText(part));
    }
  }
  return out
    .map((l) => l.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function paragraphsText(xml) {
  const paras = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g) || [];
  return paras.map((p) => {
    let text = '';
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      if (m[0] === '<w:tab/>') text += '\t';
      else if (m[0] === '<w:br/>') text += '\n';
      else text += decode(m[1]);
    }
    return text;
  });
}

export async function docxToText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('not a Word document');
  return documentXmlToText(await file.async('string'));
}
