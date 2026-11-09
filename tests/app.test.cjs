'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class MockNode {
  constructor(tag = '') { this.tag = tag; this.children = []; this.attributes = {}; this.style = { setProperty() {} }; this.textContent = ''; this.handlers = {}; this.classes = new Set(); this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) }; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  querySelector(tag) { return this.children.find(child => child.tag === tag); }
  remove() { this.removed = true; }
}
function runtime() {
  const grid = new MockNode('grid'), count = new MockNode('count'), main = new MockNode('main');
  const nodes = { main, '.grid': grid, '.count': count };
  const document = { addEventListener() {}, querySelector: selector => nodes[selector], createElement: name => new MockNode(name), createTextNode: text => { const n = new MockNode('#text'); n.textContent = text; return n; } };
  const context = { document, setInterval() {}, window: { recetarioVersion: 'test', addEventListener() {}, scrollTo() {} }, location: {hash: ''}, fetch: () => new Promise(() => {}), console };
  vm.createContext(context);
  const files = ['js/core.mjs', 'js/markdown.mjs', 'js/catalogue.mjs', 'js/recipe.mjs'];
  const source = files.map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/^const \{.*\} = await import\(.*\);\n/gm, '').replace(/^export .*;\n/gm, '')).join('\n');
  vm.runInContext(source + '\nglobalThis.testing = { renderMarkdown, pathUrl, drawResults, createRecipeHeader, state };', context);
  return { ...context.testing, grid, count };
}
const flatten = node => node.textContent + node.children.map(flatten).join('');
const tags = node => [node.tag, ...node.children.flatMap(tags)];
const fixture = [
  { id: 'Arroces/arroz', title: 'Arroz con ñora', category: 'Arroces', metadata: {}, sections: [{ heading: 'Ingredientes', markdown: '| Ingrediente | Cantidad |\n|---|---|\n| Pimiento rojo | 1 |' }] },
  { id: 'Carnes/lomo', title: 'Lomo', category: 'Carnes', metadata: {}, sections: [{ heading: 'Ingredientes para la salsa', markdown: '| Ingrediente | Cantidad |\n|---|---|\n| Cebolla | 1 |' }, { heading: 'Consejos', markdown: 'Servir con arroz.' }] },
];
function results(app, query, category = 'Todas') {
  app.state.recipes = fixture; app.state.query = query; app.state.category = category; app.drawResults();
  return app.grid.children.filter(node => node.tag === 'a').map(flatten);
}
test('busca nombres e ingredientes sin tildes ni diferencias de mayúsculas', () => {
  const app = runtime();
  assert.deepEqual(results(app, 'NORA'), ['ArrocesArroz con ñoraVer receta →']);
  assert.match(results(app, 'PIMIENTO')[0], /Arroz con ñora/);
  assert.match(results(app, 'cebólla')[0], /Lomo/);
});
test('combina categoría y búsqueda; no busca en consejos', () => {
  const app = runtime();
  assert.equal(results(app, 'arroz', 'Carnes').length, 0);
  assert.equal(app.count.textContent, '0 recetas');
  assert.equal(results(app, 'arroz', 'Arroces').length, 1);
  assert.equal(results(app, 'cebolla', 'Arroces').length, 0);
});
test('ordena por número descendente y mantiene el orden en los filtros', () => {
  const app = runtime();
  app.state.recipes = [
    { ...fixture[0], title: 'Primera', pdfPath: 'Arroces/2.primera.pdf' },
    { ...fixture[0], title: 'Última', pdfPath: 'Arroces/24.ultima.pdf' },
    { ...fixture[1], title: 'Intermedia', pdfPath: 'Carnes/9.intermedia.pdf' },
    { ...fixture[0], title: 'Sin número' },
  ];
  app.drawResults();
  assert.deepEqual(app.grid.children.map(flatten), ['ArrocesÚltimaVer receta →', 'CarnesIntermediaVer receta →', 'ArrocesPrimeraVer receta →', 'ArrocesSin númeroVer receta →']);
  app.state.category = 'Arroces'; app.drawResults();
  assert.deepEqual(app.grid.children.map(flatten), ['ArrocesÚltimaVer receta →', 'ArrocesPrimeraVer receta →', 'ArrocesSin númeroVer receta →']);
});
test('usa el título de presentación y conserva la búsqueda por el título original', () => {
  const app = runtime();
  app.state.recipes = [{ ...fixture[0], displayTitle: 'Arroz meloso' }];
  app.state.query = 'ñora';
  app.drawResults();
  assert.match(flatten(app.grid), /Arroz meloso/);
  assert.doesNotMatch(flatten(app.grid), /Arroz con ñora/);
});
test('renderiza tablas, párrafos, listas y enlaces sin interpretar HTML', () => {
  const app = runtime(), root = new MockNode('section');
  app.renderMarkdown(root, '| Ingrediente | Cantidad |\n|---|---:|\n| <img src=x onerror=alert(1)> | 2 |\n\nUna aclaración.\n\n1. Primer paso\n2. Segundo paso\n\n- Ver [fuente](https://example.com/receta).');
  assert.ok(tags(root).includes('table'));
  assert.equal(tags(root).filter(tag => tag === 'tr').length, 2);
  assert.equal(tags(root).filter(tag => tag === 'li').length, 3);
  assert.ok(tags(root).includes('a'));
  assert.equal(tags(root).includes('img'), false);
  assert.match(flatten(root), /<img src=x onerror=alert\(1\)>/);
});
test('no convierte enlaces javascript en enlaces navegables y limita rutas locales', () => {
  const app = runtime(), root = new MockNode('section');
  app.renderMarkdown(root, '[texto](javascript:alert(1))');
  assert.equal(tags(root).includes('a'), false);
  assert.equal(app.pathUrl('../secret'), null);
  assert.equal(app.pathUrl('/etc/passwd'), null);
  assert.equal(app.pathUrl('Carnes/foto con espacios.png'), 'Carnes/foto%20con%20espacios.png?v=test');
});
test('muestra el título si falla la carga del logotipo', () => {
  const app = runtime();
  const header = app.createRecipeHeader({
    title: 'Arroz', category: 'Arroces', image: { logoPath: 'Arroces/logo.png' }
  });
  const copy = header.children[0];
  const title = copy.children.find(node => node.tag === 'h1');
  const logo = copy.children.find(node => node.tag === 'img');
  assert.ok(title.classes.has('visually-hidden'));
  logo.handlers.error();
  assert.equal(title.classes.has('visually-hidden'), false);
  assert.equal(logo.removed, true);
});
test('representa todas las secciones del catálogo real', () => {
  const catalogue = path.join(__dirname, '..', 'data', 'catalogo.json');
  assert.ok(fs.existsSync(catalogue), "Falta data/catalogo.json");
  const app = runtime(), data = JSON.parse(fs.readFileSync(catalogue, 'utf8'));
  assert.ok(data.recipes.length >= 6);
  for (const recipe of data.recipes) for (const section of recipe.sections) {
    const root = new MockNode('section'); app.renderMarkdown(root, section.markdown);
    assert.ok(flatten(root).trim(), `${recipe.title}: ${section.heading}`);
  }
});

test('los módulos ES resuelven sus dependencias reales', async () => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  global.document = { querySelector: () => new MockNode('main'), createElement: name => new MockNode(name) };
  global.window = { recetarioVersion: 'test' };
  try {
    const { createRecipeHeader } = await import('../js/recipe.mjs');
    const header = createRecipeHeader({ title: 'Arroz', category: 'Arroces', image: {} });
    assert.equal(header.children[0].children[1].textContent, 'Arroz');
  } finally {
    global.document = previousDocument;
    global.window = previousWindow;
  }
});
