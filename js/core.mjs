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
const recipeTitle = (recipe) => recipe.displayTitle || recipe.title;
const recipeHash = (id) => '#receta=' + encodeURIComponent(id);
const getHashId = () => {
  if (!location.hash.startsWith('#receta=')) return null;
  try { return decodeURIComponent(location.hash.slice(8)); } catch { return ''; }
};

export { main, state, colors, normalize, el, pathUrl, recipeTitle, recipeHash, getHashId };
