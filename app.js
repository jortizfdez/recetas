// El HTML anterior puede seguir cargando este archivo tras una actualización.
import('./js/main.mjs?v=' + window.recetarioVersion).catch(() => {
  document.querySelector('main').textContent = 'No se puede cargar la aplicación. Recarga la página para intentarlo de nuevo.';
});

// Revalida los recursos sin descargar sus cuerpos cuando el servidor ofrece validadores.
const resources = ['index.html', 'app.js', 'js/main.mjs', 'js/core.mjs', 'js/markdown.mjs', 'js/catalogue.mjs', 'js/recipe.mjs', 'styles.css', 'data/catalogo.json'];
let publicationSnapshot;
let checkingPublication = false;
async function resourceVersion(path) {
  const response = await fetch(path, { method: 'HEAD', cache: 'no-store' });
  if (response.ok) {
    const etag = response.headers.get('etag');
    const modified = response.headers.get('last-modified');
    if (etag || modified) return [etag, modified];
  } else if (![405, 501].includes(response.status)) {
    throw new Error('No se pudo comprobar la publicación');
  }
  const fallback = await fetch(path, { cache: 'no-store' });
  if (!fallback.ok) throw new Error('No se pudo comprobar la publicación');
  return fallback.text();
}
async function checkPublication() {
  if (checkingPublication || document.visibilityState === 'hidden') return;
  checkingPublication = true;
  try {
    const snapshot = JSON.stringify(await Promise.all(resources.map(resourceVersion)));
    if (publicationSnapshot !== undefined && publicationSnapshot !== snapshot) location.reload();
    else publicationSnapshot = snapshot;
  } catch { /* Se volverá a intentar en la siguiente comprobación. */ }
  finally { checkingPublication = false; }
}
checkPublication();
setInterval(checkPublication, 60000);
document.addEventListener('visibilitychange', checkPublication);
