'use strict';

const main = document.querySelector('main');
const state = { recipes: [], category: 'Todas', query: '' };
const colors = { Arroces: '#1239b4', Carnes: '#a52e28', Pastas: '#7a5a00', Verduras: '#326d37' };
const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const el = (name, className, content) => {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
};
const pathUrl = (path) => {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').some(p => !p || p === '..' || p === '.')) return null;
  return path.split('/').map(encodeURIComponent).join('/');
};
const recipeHash = (id) => '#receta=' + encodeURIComponent(id);
const getHashId = () => {
  if (!location.hash.startsWith('#receta=')) return null;
  try { return decodeURIComponent(location.hash.slice(8)); } catch { return ''; }
};
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
function imageFor(recipe) {
  if (!recipe.image || !recipe.image.path) return null;
  const img = document.createElement('img'); img.loading = 'lazy'; img.decoding = 'async'; img.alt = recipe.image.alt || recipe.title;
  const original = pathUrl(recipe.image.path);
  const optim = recipe.image.optimizedPath === 'assets/web/Arroces/imagen-arroz-335892bdc68b002eb55e.webp' ? 'assets/arroz-foto.webp' : pathUrl(recipe.image.optimizedPath);
  if (!original) return null;
  if (optim) { img.src = optim; img.onerror = () => { img.onerror = null; img.src = original; }; } else img.src = original;
  return img;
}
function heroTime(recipe) {
  const m = recipe.metadata || {}; const k = Object.keys(m).find(key => /^(tiempo(?: total| activo)?|horno)$/i.test(key));
  return k ? `${k === 'Horno' ? 'Horno: ' : ''}${m[k]}` : '';
}
function makeCard(recipe) {
  const a = el('a', 'card'); a.href = recipeHash(recipe.id); a.style.setProperty('--accent', colors[recipe.category] || '#1239b4');
  const img = imageFor(recipe);
  if (img) { const photo = el('div', 'card-image'); photo.append(img); a.append(photo); }
  const copy = el('div', 'card-copy'); copy.append(el('p', 'card-category', recipe.category), el('h2', null, recipe.title));
  const bottom = el('div', 'card-bottom'); bottom.append(el('span', null, heroTime(recipe)), el('span', 'card-arrow', 'Ver receta →')); copy.append(bottom); a.append(copy); return a;
}
function drawResults() {
  const grid = document.querySelector('.grid'); const n = normalize(state.query);
  const recipes = state.recipes.filter(recipe => {
    const ingredientText = (recipe.sections || []).filter(s => normalize(s.heading).startsWith('ingredientes')).map(s => s.markdown).join(' ');
    return (state.category === 'Todas' || recipe.category === state.category) && normalize(recipe.title + ' ' + ingredientText).includes(n);
  });
  document.querySelector('.count').textContent = `${recipes.length} ${recipes.length === 1 ? 'receta' : 'recetas'}`;
  grid.replaceChildren();
  if (!recipes.length) grid.append(el('p', 'empty', 'No encontramos recetas. Prueba con otro nombre o ingrediente.'));
  for (const recipe of recipes) grid.append(makeCard(recipe));
}
function showCatalogue() {
  document.title = 'Recetario Ortiz'; main.replaceChildren();
  const intro = el('section', 'intro'); intro.append(el('p', 'eyebrow', 'Nuestra colección'), el('h1', null, 'Siempre hay algo rico.'), el('p', null, 'Recetas que nos gustan, para volver a ellas una y otra vez.')); main.append(intro);
  const label = el('label', 'search'); const icon = el('span', null, '⌕'); icon.setAttribute('aria-hidden', 'true'); icon.style.fontSize = '24px';
  const input = document.createElement('input'); input.type = 'search'; input.placeholder = 'Busca una receta o ingrediente'; input.setAttribute('aria-label', 'Buscar por nombre o ingrediente'); input.value = state.query; input.addEventListener('input', () => { state.query = input.value; drawResults(); }); label.append(icon, input); main.append(label);
  const filters = el('nav', 'filters'); filters.setAttribute('aria-label', 'Filtrar por categoría');
  for (const cat of ['Todas', ...new Set(state.recipes.map(r => r.category))]) {
    const button = el('button', null, cat); button.type = 'button'; button.setAttribute('aria-pressed', String(cat === state.category)); button.addEventListener('click', () => { state.category = cat; filters.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); drawResults(); }); filters.append(button);
  }
  main.append(filters); const results = el('div', 'results'); const count = el('span', 'count'); count.setAttribute('aria-live', 'polite'); results.append(el('span', null, 'Nuestras recetas'), count); main.append(results, el('div', 'grid')); drawResults();
}
function showRecipe(recipe) {
  document.title = `${recipe.title} · Recetario Ortiz`; main.replaceChildren();
  const article = el('article', 'detail'); article.style.setProperty('--accent', colors[recipe.category] || '#1239b4');
  const back = el('a', 'back', '← Todas las recetas'); back.href = '#'; article.append(back);
  const head = el('div', 'detail-head'); const copy = el('div', 'detail-copy'); copy.append(el('p', 'detail-category', recipe.category), el('h1', null, recipe.title)); head.append(copy);
  const img = imageFor(recipe); if (img) { img.loading = 'eager'; const figure = el('figure', 'detail-image'); figure.append(img); if (/ilustrativ|generad/i.test(img.alt)) figure.append(el('figcaption', null, img.alt)); head.append(figure); } article.append(head);
  const meta = el('dl', 'metadata'); for (const [key, value] of Object.entries(recipe.metadata || {})) { const item = el('div', 'meta-item'); item.append(el('dt', null, key), el('dd', null, value)); meta.append(item); } article.append(meta);
  const body = el('div', 'recipe-body'); const left = el('div', 'recipe-column'); const right = el('div', 'recipe-column');
  for (const section of recipe.sections || []) {
    const s = el('section', 'recipe-section'); s.append(el('h2', null, section.heading)); renderMarkdown(s, section.markdown);
    (normalize(section.heading).startsWith('ingredientes') ? left : right).append(s);
  }
  body.append(left, right); article.append(body); main.append(article);
}
function route() {
  const id = getHashId();
  if (id === null) { showCatalogue(); return; }
  const recipe = state.recipes.find(r => r.id === id);
  if (recipe) { showRecipe(recipe); window.scrollTo(0, 0); }
  else { main.replaceChildren(); const section = el('section', 'missing'); section.append(el('h1', null, 'No encontramos esta receta.')); const a = el('a', null, 'Volver al recetario'); a.href = '#'; section.append(a); main.append(section); }
}
window.addEventListener('hashchange', route);
fetch('data/catalogo.json').then(response => { if (!response.ok) throw new Error('No se pudo cargar el catálogo'); return response.json(); }).then(data => {
  if (!Array.isArray(data.recipes)) throw new Error('Formato de catálogo no válido'); state.recipes = data.recipes; route();
}).catch(() => { main.replaceChildren(); const error = el('section', 'error'); error.append(el('h1', null, 'No se pueden cargar las recetas'), el('p', null, 'Comprueba tu conexión y vuelve a intentarlo.')); const b = el('button', null, 'Volver a intentar'); b.type = 'button'; b.addEventListener('click', () => location.reload()); error.append(b); main.append(error); });
