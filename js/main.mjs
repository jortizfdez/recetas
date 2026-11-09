const { main, state, el, getHashId, normalize, categoryColor } = await import('./core.mjs?v=' + window.recetarioVersion);
const { showCatalogue } = await import('./catalogue.mjs?v=' + window.recetarioVersion);
const { showRecipe } = await import('./recipe.mjs?v=' + window.recetarioVersion);

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
  const categoryOrder = ['Carnes', 'Pescados', 'Pastas', 'Arroces', 'Verduras', 'Postres'];
  const categoryRank = new Map(categoryOrder.map((name, index) => [normalize(name), index]));
  const categoriesByKey = new Map();
  for (const value of state.recipes.map(r => r.category)) {
    const key = normalize(value);
    if (!key || categoriesByKey.has(key)) continue;
    categoriesByKey.set(key, categoryOrder.find(name => normalize(name) === key) || value);
  }
  const categories = [...categoriesByKey.entries()]
    .sort(([a], [b]) => (a === 'postres') - (b === 'postres') || (categoryRank.get(a) ?? categoryOrder.length) - (categoryRank.get(b) ?? categoryOrder.length) || a.localeCompare(b, 'es'))
    .map(([, name]) => name);
  for (const category of ['Todas', ...categories]) {
    const button = el('button', 'category-menu-item', category === 'Todas' ? 'Todas las recetas' : category);
    const accent = categoryColor(category);
    button.style.setProperty('--category-accent', accent);
    button.type = 'button'; button.addEventListener('click', () => {
      state.category = category; close();
      if (getHashId() !== null) location.hash = ''; else showCatalogue();
    }); list.append(button);
  }
}
function initializeApp() {
  window.addEventListener('hashchange', route);
  fetch('data/catalogo.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('No se pudo cargar el catálogo'); return response.json(); }).then(data => {
    if (!Array.isArray(data.recipes)) throw new Error('Formato de catálogo no válido'); state.recipes = data.recipes; setupCategoryMenu(); route();
  }).catch(() => { main.replaceChildren(); const error = el('section', 'error'); error.append(el('h1', null, 'No se pueden cargar las recetas'), el('p', null, 'Comprueba tu conexión y vuelve a intentarlo.')); const b = el('button', null, 'Volver a intentar'); b.type = 'button'; b.addEventListener('click', () => location.reload()); error.append(b); main.append(error); });
}


initializeApp();
