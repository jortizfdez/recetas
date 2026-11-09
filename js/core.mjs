'use strict';

const main = document.querySelector('main');
const state = { recipes: [], category: 'Todas', chef: 'Todos', query: '' };
const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const colors = { arroces: '#1239b4', carnes: '#a52e28', pastas: '#7a5a00', verduras: '#326d37', pescados: '#006e6e', postres: '#6f42a5', legumbres: '#46535b' };
const categoryColor = (category) => colors[normalize(category)] || '#1239b4';
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

export { main, state, colors, categoryColor, normalize, el, pathUrl, recipeTitle, recipeHash, getHashId };
