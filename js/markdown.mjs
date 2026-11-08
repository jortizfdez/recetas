const { el } = await import('./core.mjs?v=' + window.recetarioVersion);

function addInline(parent, text) {
  // Build DOM nodes rather than interpreting recipe text as HTML.
  const link = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0, match;
  while ((match = link.exec(text))) {
    parent.append(document.createTextNode(text.slice(last, match.index)));
    const a = el('a', null, match[1]);
    a.href = match[2]; a.target = '_blank'; a.rel = 'noopener noreferrer';
    parent.append(a); last = link.lastIndex;
  }
  parent.append(document.createTextNode(text.slice(last)));
}
const cellValues = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
function renderMarkdown(target, markdown) {
  const lines = markdown.split(/\r?\n/); let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const wrap = el('div', 'table-wrap'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Tabla de ingredientes');
      const table = el('table'); const head = el('thead'); const tr = el('tr');
      for (const value of cellValues(line)) { const th = el('th'); th.scope = 'col'; addInline(th, value); tr.append(th); }
      head.append(tr); table.append(head); const body = el('tbody'); i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const row = el('tr'); for (const value of cellValues(lines[i])) { const td = el('td'); addInline(td, value); row.append(td); } body.append(row); i++;
      }
      table.append(body); wrap.append(table); target.append(wrap); continue;
    }
    const numbered = /^\s*\d+\.\s+/.test(line); const bulleted = /^\s*[-*]\s+/.test(line);
    if (numbered || bulleted) {
      const list = el(numbered ? 'ol' : 'ul');
      const pattern = numbered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      while (i < lines.length && pattern.test(lines[i])) { const li = el('li'); addInline(li, lines[i].replace(pattern, '')); list.append(li); i++; }
      target.append(list); continue;
    }
    const pieces = [line.trim()]; i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(?:\||\d+\.\s+|[-*]\s+)/.test(lines[i])) { pieces.push(lines[i].trim()); i++; }
    const p = el('p'); addInline(p, pieces.join(' ')); target.append(p);
  }
}

export { renderMarkdown };
