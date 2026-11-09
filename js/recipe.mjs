const { main, categoryColor, normalize, el, pathUrl, recipeTitle } = await import('./core.mjs?v=' + window.recetarioVersion);
const { renderMarkdown } = await import('./markdown.mjs?v=' + window.recetarioVersion);
const { imageFor, people, chefSymbol } = await import('./catalogue.mjs?v=' + window.recetarioVersion);

function createRecipeHeader(recipe) {
  const head = el('div', 'detail-head'); const copy = el('div', 'detail-copy'); copy.append(el('p', 'detail-category', recipe.category), el('h1', null, recipeTitle(recipe)));
  const logoPath = pathUrl(recipe.image?.logoPath);
  if (logoPath) {
    const logo = el('img', 'recipe-logo');
    logo.src = logoPath;
    logo.alt = '';
    const title = copy.querySelector('h1');
    title.classList.add('visually-hidden');
    logo.addEventListener('error', () => {
      logo.remove();
      title.classList.remove('visually-hidden');
    });
    copy.append(logo);
  }
  head.append(copy);
  const img = imageFor(recipe);
  if (img) {
    img.loading = 'eager';
    const figure = el('figure', 'detail-image');
    figure.append(img);
    head.append(figure);
  }
  return head;
}

function createRecipeMetadata(recipe) {
  const meta = el('dl', 'metadata');
  const metadata = recipe.metadata || {};
  const time = metadata.Tiempo || metadata['Tiempo total'] || metadata['Tiempo activo'] || metadata.Horno || '—';
  const difficulty = normalize(metadata.Dificultad || '');
  const level = difficulty.includes('facil') ? 1 : difficulty.includes('media') ? 2 :
    difficulty.includes('alta') || difficulty.includes('dificil') ? 3 : 0;
  const fields = [['RACIONES', metadata.Raciones || '—'], ['DIFICULTAD', metadata.Dificultad || '—'],
    ['TIEMPO', time], ['CHEF', metadata.Chef || '—']];
  for (const [label, value] of fields) {
    const item = el('div', 'meta-item');
    item.append(el('dt', null, label));
    if (label === 'DIFICULTAD' && level) {
      const squares = el('dd', 'difficulty-squares');
      squares.setAttribute('aria-label', value);
      for (let i = 0; i < 3; i++) squares.append(el('i', i < level ? 'active' : ''));
      item.append(squares);
    } else if (label === 'CHEF') {
      const valueNode = el('dd', 'meta-chef');
      const person = people.find(p => p.name === value);
      if (person) valueNode.append(chefSymbol(person));
      valueNode.append(el('span', null, value));
      item.append(valueNode);
    } else {
      item.append(el('dd', null, value));
    }
    meta.append(item);
  }
  return meta;
}

function createRecipeBody(recipe) {
  const body = el('div', 'recipe-body'); const left = el('div', 'recipe-column'); const right = el('div', 'recipe-column');
  const assignedIds = new Set();
  for (const section of recipe.sections || []) {
    const node = el('section', 'recipe-section');
    const name = normalize(section.heading);
    const id = name.startsWith('ingredientes') ? 'ingredientes' : name === 'preparacion' ? 'elaboracion' :
      ['elaboracion', 'consejos'].includes(name) ? name : null;
    if (id && !assignedIds.has(id)) {
      node.id = id;
      assignedIds.add(id);
    }
    node.append(el('h2', null, section.heading));
    renderMarkdown(node, section.markdown);
    (name.startsWith('ingredientes') ? left : right).append(node);
  }
  body.append(left, right);
  return body;
}

function createRecipeNavigation(body) {
  const nav = el('nav', 'detail-nav');
  nav.setAttribute('aria-label', 'Navegación de la receta');
  for (const [id, label] of [['ingredientes', 'Ingredientes'], ['elaboracion', 'Elaboración'], ['consejos', 'Consejos']]) {
    const target = body.querySelector('#' + id);
    if (!target) continue;
    const button = el('button', 'detail-nav-item', label);
    button.type = 'button';
    button.addEventListener('click', () => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    nav.append(button);
  }
  return nav;
}

function addPdfSharing(recipe, meta, nav) {
  const pdf = pathUrl(recipe.pdfPath);
  if (pdf) {
    const share = el('button', 'detail-share'); share.type = 'button'; share.setAttribute('aria-label', 'Compartir PDF'); share.title = 'Compartir PDF';
    const icon = el('img', 'share-icon');
    icon.src = pathUrl('assets/share.webp');
    icon.alt = '';
    share.append(icon);
    let file; let failed = false;
    fetch(pdf).then(response => { if (!response.ok) throw new Error('PDF'); return response.blob(); }).then(blob => { file = new File([blob], decodeURIComponent(new URL(pdf, location.href).pathname.split('/').pop()), {type: 'application/pdf'}); }).catch(() => { failed = true; });
    const sharePdf = async () => {
      if (!file && !failed) { share.title = 'Preparando PDF'; return; }
      if (file && navigator.share && navigator.canShare && navigator.canShare({files: [file]})) {
        try { await navigator.share({files: [file], title: recipeTitle(recipe)}); } catch (error) { if (error.name !== 'AbortError') window.open(pdf, '_blank', 'noopener'); }
      } else { window.open(pdf, '_blank', 'noopener'); }
    };
    share.addEventListener('click', sharePdf);
    const desktopItem = el('div', 'meta-item meta-share');
    desktopItem.append(el('dt', 'visually-hidden', 'Compartir'));
    const desktopValue = el('dd'); const desktopShare = share.cloneNode(true);
    desktopShare.addEventListener('click', sharePdf); desktopValue.append(desktopShare); desktopItem.append(desktopValue); meta.append(desktopItem);
    nav.append(share);
  }
}

function showRecipe(recipe) {
  document.title = `${recipeTitle(recipe)} · Recetario Ortiz`;
  main.replaceChildren();
  const article = el('article', 'detail');
  article.style.setProperty('--accent', categoryColor(recipe.category));
  const back = el('a', 'back', '← Todas las recetas');
  back.href = '#';
  const meta = createRecipeMetadata(recipe);
  const body = createRecipeBody(recipe);
  article.append(back, createRecipeHeader(recipe), meta, body);
  const nav = createRecipeNavigation(body);
  addPdfSharing(recipe, meta, nav);
  article.append(nav);
  main.append(article);
}

export { createRecipeHeader, showRecipe };
