const { main, state, colors, normalize, el, pathUrl, recipeTitle, recipeHash } = await import('./core.mjs?v=' + window.recetarioVersion);

function imageFor(recipe) {
  if (!recipe.image || !recipe.image.path) return null;
  const img = document.createElement('img'); img.loading = 'lazy'; img.decoding = 'async'; img.alt = recipe.image.alt || recipe.title;
  const original = pathUrl(recipe.image.path);
  const optim = pathUrl(recipe.image.displayPath) || pathUrl(recipe.image.optimizedPath);
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
  copy.append(top, el('h2', null, recipeTitle(recipe)));
  const bottom = el('div', 'card-bottom');
  bottom.append(el('span', 'card-time', heroTime(recipe)), el('span', 'card-arrow', 'Ver receta →'));
  copy.append(bottom);
  a.append(copy); return a;
}
function matchesRecipe(recipe, filters) {
  if (filters.chef !== 'Todos' && recipe.metadata?.Chef !== filters.chef) return false;
  if (filters.category !== 'Todas' && recipe.category !== filters.category) return false;
  const ingredients = (recipe.sections || [])
    .filter(section => normalize(section.heading).startsWith('ingredientes'))
    .map(section => section.markdown)
    .join(' ');
  const searchable = [recipeTitle(recipe), recipe.title, ingredients, recipe.metadata?.Chef || ''].join(' ');
  return normalize(searchable).includes(normalize(filters.query));
}
function drawResults() {
  const grid = document.querySelector('.grid');
  const recipes = state.recipes.filter(recipe => matchesRecipe(recipe, state));
  document.querySelector('.count').textContent = `${recipes.length} ${recipes.length === 1 ? 'receta' : 'recetas'}`;
  grid.replaceChildren();
  if (!recipes.length) grid.append(el('p', 'empty', 'No encontramos recetas. Prueba con otro nombre o ingrediente.'));
  for (const recipe of recipes) grid.append(makeCard(recipe));
}
const people = [
  { name: 'Javi', portrait: 'javi' },
  { name: 'Patri', portrait: 'patri' },
  { name: 'Abuela Loli', portrait: 'loli' },
  { name: 'Abuela Tere', portrait: 'tere' },
  { name: 'Ela', portrait: 'ela' },
  { name: 'Thermomix', portrait: 'thermomix' }
];
function chefSymbol(person) {
  const image = el('img', 'chef-portrait');
  image.src = pathUrl(`assets/chefs/${person.portrait}.webp`);
  image.alt = '';
  image.decoding = 'async';
  return image;
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
    const portrait = chefSymbol(person);
    button.append(portrait); button.addEventListener('click', () => { state.chef = state.chef === person.name ? 'Todos' : person.name; icons.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button && state.chef !== 'Todos'))); drawResults(); }); icons.append(button);
  }
  const count = el('span', 'count'); count.setAttribute('aria-live', 'polite'); results.append(title, icons, count); main.append(results, el('div', 'grid')); drawResults();
}

export { imageFor, people, chefSymbol, showCatalogue };
