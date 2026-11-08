'use strict';

const main = document.querySelector('main');
const state = { recipes: [], category: 'Todas', chef: 'Todos', query: '' };
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
  return path.split('/').map(encodeURIComponent).join('/') + '?v=' + window.recetarioVersion;
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
  const optim = recipe.image.optimizedPath === 'assets/web/Arroces/imagen-arroz-335892bdc68b002eb55e.webp' ? pathUrl('assets/arroz-foto.webp') : pathUrl(recipe.image.optimizedPath);
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
  const copy = el('div', 'card-copy');
  const top = el('div', 'card-top');
  top.append(el('p', 'card-category', recipe.category));
  if (recipe.metadata?.Chef) top.append(el('span', 'card-chef', recipe.metadata.Chef));
  copy.append(top, el('h2', null, recipe.title));
  const bottom = el('div', 'card-bottom');
  bottom.append(el('span', 'card-time', heroTime(recipe)), el('span', 'card-arrow', 'Ver receta →'));
  copy.append(bottom);
  a.append(copy); return a;
}
function drawResults() {
  const grid = document.querySelector('.grid'); const n = normalize(state.query);
  const recipes = state.recipes.filter(recipe => {
    const ingredientText = (recipe.sections || []).filter(s => normalize(s.heading).startsWith('ingredientes')).map(s => s.markdown).join(' ');
    return (state.chef === 'Todos' || recipe.metadata?.Chef === state.chef) && (state.category === 'Todas' || recipe.category === state.category) && normalize(recipe.title + ' ' + ingredientText + ' ' + (recipe.metadata?.Chef || '')).includes(n);
  });
  document.querySelector('.count').textContent = `${recipes.length} ${recipes.length === 1 ? 'receta' : 'recetas'}`;
  grid.replaceChildren();
  if (!recipes.length) grid.append(el('p', 'empty', 'No encontramos recetas. Prueba con otro nombre o ingrediente.'));
  for (const recipe of recipes) grid.append(makeCard(recipe));
}
const people = [
    {name:'Javi', letter:'J', kind:'person'}, {name:'Patri', letter:'P', kind:'person'},
    {name:'Abuela Loli', letter:'L', kind:'grandma'}, {name:'Abuela Tere', letter:'T', kind:'grandma'},
    {name:'Thermomix', letter:'', kind:'machine'}
  ];
function chefSymbol(person) {
  const files = {'Javi':'javi', 'Abuela Loli':'loli', 'Thermomix':'thermomix', 'Abuela Tere':'tere', 'Patri':'patri'};
  const image = el('img', 'chef-portrait'); image.src = pathUrl(`assets/chefs/${files[person.name]}.webp`); image.alt = ''; image.decoding = 'async'; return image;
}
function showCatalogue() {
  document.title = 'Recetario Ortiz'; main.replaceChildren();
  const label = el('label', 'search'); const icon = el('span', null, '⌕'); icon.setAttribute('aria-hidden', 'true'); icon.style.fontSize = '24px';
  const input = document.createElement('input'); input.type = 'search'; input.placeholder = 'Busca una receta, ingrediente o chef'; input.setAttribute('aria-label', 'Buscar por receta, ingrediente o chef'); input.value = state.query; input.addEventListener('input', () => { state.query = input.value; drawResults(); }); label.append(icon, input); main.append(label);
  const results = el('div', 'results');
  const title = el('span', 'results-title', state.category === 'Todas' ? 'Nuestras recetas' : state.category);
  const icons = el('nav', 'chef-icons'); icons.setAttribute('aria-label', 'Filtrar por chef');
  for (const person of people) {
    const button = el('button', 'chef-icon'); button.type = 'button';
    button.setAttribute('aria-label', `Filtrar por ${person.name}`); button.title = person.name;
    button.setAttribute('aria-pressed', String(state.chef === person.name));
    button.disabled = !state.recipes.some(r => r.metadata?.Chef === person.name);
    const svg = chefSymbol(person);
    button.append(svg); button.addEventListener('click', () => { state.chef = state.chef === person.name ? 'Todos' : person.name; icons.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button && state.chef !== 'Todos'))); drawResults(); }); icons.append(button);
  }
  const count = el('span', 'count'); count.setAttribute('aria-live', 'polite'); results.append(title, icons, count); main.append(results, el('div', 'grid')); drawResults();
}
function showRecipe(recipe) {
  document.title = `${recipe.title} · Recetario Ortiz`; main.replaceChildren();
  const article = el('article', 'detail'); article.style.setProperty('--accent', colors[recipe.category] || '#1239b4');
  const back = el('a', 'back', '← Todas las recetas'); back.href = '#'; article.append(back);
  const head = el('div', 'detail-head'); const copy = el('div', 'detail-copy'); copy.append(el('p', 'detail-category', recipe.category), el('h1', null, recipe.title));
  const logoPath = recipe.image?.logoPath && pathUrl(recipe.image.logoPath); if(logoPath){const logo=el('img','recipe-logo');logo.src=logoPath;logo.alt='';copy.querySelector('h1').classList.add('visually-hidden');copy.append(logo)} head.append(copy);
  const img = imageFor(recipe); if (img) { img.loading = 'eager'; const figure = el('figure', 'detail-image'); figure.append(img); head.append(figure); } article.append(head);
  const meta = el('dl', 'metadata'); const metadata=recipe.metadata||{}; const time=metadata.Tiempo||metadata['Tiempo total']||metadata['Tiempo activo']||metadata.Horno||'—';
  const difficulty=normalize(metadata.Dificultad||''); const level=difficulty.includes('facil')?1:difficulty.includes('media')?2:difficulty.includes('alta')||difficulty.includes('dificil')?3:0;
  for(const [label,value] of [['RACIONES',metadata.Raciones||'—'],['DIFICULTAD',metadata.Dificultad||'—'],['TIEMPO',time],['CHEF',metadata.Chef||'—']]){const item=el('div','meta-item');item.append(el('dt',null,label));if(label==='DIFICULTAD'&&level){const squares=el('dd','difficulty-squares');squares.setAttribute('aria-label',value);for(let i=0;i<3;i++)squares.append(el('i',i<level?'active':''));item.append(squares)}else if(label==='CHEF'){const dd=el('dd','meta-chef');const person=people.find(p=>p.name===value);if(person)dd.append(chefSymbol(person));dd.append(el('span',null,value));item.append(dd)}else item.append(el('dd',null,value));meta.append(item)}
  article.append(meta);
  const body = el('div', 'recipe-body'); const left = el('div', 'recipe-column'); const right = el('div', 'recipe-column');
  for (const section of recipe.sections || []) {
    const s = el('section', 'recipe-section'); const sectionName = normalize(section.heading); if (sectionName.startsWith('ingredientes')) s.id = 'ingredientes'; else if (sectionName === 'elaboracion') s.id = 'elaboracion'; else if (sectionName === 'consejos') s.id = 'consejos'; s.append(el('h2', null, section.heading)); renderMarkdown(s, section.markdown);
    (normalize(section.heading).startsWith('ingredientes') ? left : right).append(s);
  }
  body.append(left, right); article.append(body);
  const nav = el('nav', 'detail-nav'); nav.setAttribute('aria-label', 'Navegación de la receta');
  for (const [id, label] of [['ingredientes', 'Ingredientes'], ['elaboracion', 'Elaboración'], ['consejos', 'Consejos']]) {
    const target = body.querySelector('#' + id); if (!target) continue;
    const button = el('button', 'detail-nav-item', label); button.type = 'button';
    button.addEventListener('click', () => target.scrollIntoView({behavior: 'smooth', block: 'start'})); nav.append(button);
  }
  const pdf = pathUrl(recipe.pdfPath);
  if (pdf) {
    const share = el('button', 'detail-share'); share.type = 'button'; share.setAttribute('aria-label', 'Compartir PDF'); share.title = 'Compartir PDF';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M12 16V3m-5 5 5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'); svg.append(path); share.append(svg);
    let file; let failed = false;
    fetch(pdf).then(response => { if (!response.ok) throw new Error('PDF'); return response.blob(); }).then(blob => { file = new File([blob], decodeURIComponent(new URL(pdf, location.href).pathname.split('/').pop()), {type: 'application/pdf'}); }).catch(() => { failed = true; });
    share.addEventListener('click', async () => {
      if (!file && !failed) { share.title = 'Preparando PDF'; return; }
      if (file && navigator.share && navigator.canShare && navigator.canShare({files: [file]})) {
        try { await navigator.share({files: [file], title: recipe.title}); } catch (error) { if (error.name !== 'AbortError') window.open(pdf, '_blank', 'noopener'); }
      } else { window.open(pdf, '_blank', 'noopener'); }
    });
    const desktopItem = el('div', 'meta-item meta-share');
    desktopItem.append(el('dt', null, 'COMPARTIR'));
    const desktopValue = el('dd'); const desktopShare = share.cloneNode(true);
    desktopShare.addEventListener('click', () => share.click()); desktopValue.append(desktopShare); desktopItem.append(desktopValue); meta.append(desktopItem);
    nav.append(share);
  }
  article.append(nav); main.append(article);
}
function route() {
  const id = getHashId();
  if (id === null) { showCatalogue(); return; }
  const recipe = state.recipes.find(r => r.id === id);
  if (recipe) { showRecipe(recipe); window.scrollTo(0, 0); }
  else { main.replaceChildren(); const section = el('section', 'missing'); section.append(el('h1', null, 'No encontramos esta receta.')); const a = el('a', null, 'Volver al recetario'); a.href = '#'; section.append(a); main.append(section); }
}
function setupCategoryMenu() {
  const dialog = document.querySelector('#category-menu');
  const opener = document.querySelector('.menu-toggle');
  const list = dialog.querySelector('nav');
  const close = () => dialog.close();
  opener.addEventListener('click', () => { dialog.showModal(); dialog.querySelector('.menu-close').focus(); });
  dialog.querySelector('.menu-close').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  for (const category of ['Todas', ...new Set(state.recipes.map(r => r.category))]) {
    const button = el('button', 'category-menu-item', category === 'Todas' ? 'Todas las recetas' : category);
    button.type = 'button'; button.addEventListener('click', () => {
      state.category = category; close();
      if (getHashId() !== null) location.hash = ''; else showCatalogue();
    }); list.append(button);
  }
}
window.addEventListener('hashchange', route);
fetch('data/catalogo.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('No se pudo cargar el catálogo'); return response.json(); }).then(data => {
  if (!Array.isArray(data.recipes)) throw new Error('Formato de catálogo no válido'); state.recipes = data.recipes; setupCategoryMenu(); route();
}).catch(() => { main.replaceChildren(); const error = el('section', 'error'); error.append(el('h1', null, 'No se pueden cargar las recetas'), el('p', null, 'Comprueba tu conexión y vuelve a intentarlo.')); const b = el('button', null, 'Volver a intentar'); b.type = 'button'; b.addEventListener('click', () => location.reload()); error.append(b); main.append(error); });

// Detecta publicaciones también cuando el recetario permanece abierto.
let publicationSnapshot;
let checkingPublication = false;
async function checkPublication() {
  if (checkingPublication || document.visibilityState === 'hidden') return;
  checkingPublication = true;
  try {
    const responses = await Promise.all(['index.html', 'app.js', 'styles.css', 'data/catalogo.json'].map(path => fetch(path, {cache: 'no-store'})));
    if (responses.some(response => !response.ok)) return;
    const snapshot = JSON.stringify(await Promise.all(responses.map(response => response.text())));
    if (publicationSnapshot !== undefined && publicationSnapshot !== snapshot) location.reload();
    else publicationSnapshot = snapshot;
  } catch { /* La siguiente comprobación volverá a intentarlo. */ }
  finally { checkingPublication = false; }
}
checkPublication();
setInterval(checkPublication, 60000);
document.addEventListener('visibilitychange', checkPublication);
