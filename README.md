# Recetario Ortiz

Catálogo público de recetas para consultar desde el móvil o el ordenador. La web es estática y no utiliza una base de datos ni permite modificar recetas desde el navegador.

## Consultar en local

Desde la raíz del proyecto, ejecutar `python3 -m http.server 8000` y abrir `http://localhost:8000/`. No abrir `index.html` directamente: el navegador necesita cargar el catálogo por HTTP.

## Organización de la aplicación

La web no necesita compilación ni dependencias de JavaScript. `app.js` inicia los módulos ES de `js/`: `core.mjs` contiene estado y utilidades, `markdown.mjs` representa las recetas, `catalogue.mjs` construye el catálogo, `recipe.mjs` las fichas y `main.mjs` coordina navegación y carga. Los módulos declaran sus dependencias con `import` y `export`. La comprobación de publicaciones utiliza validadores HTTP y recurre al contenido cuando el servidor no los ofrece.

## Incorporar recetas

Usar la skill `anade-receta` e indicar las recetas concretas. La fuente editable está en `/Users/javi/Cocina`. El importador copia los archivos asociados y actualiza el catálogo preservando los originales. Para usarlo directamente desde la raíz del proyecto:

```sh
python3 scripts/recetario.py --dest . --manifest data/manifest.json --catalog data/catalogo.json --recipe 'Carnes/ejemplo.md'
python3 scripts/optimizar_imagenes.py --project . --catalog data/catalogo.json
```

Repetir `--recipe` por cada receta. El origen predeterminado es `/Users/javi/Cocina`; en otro equipo se puede indicar con `--source /ruta/a/recetas`. Ejecutar siempre el optimizador después de importar; necesita `cwebp` y `sips` disponibles en el `PATH` (este último viene con macOS). El importador rechaza conflictos, recursos ausentes y referencias locales que requieran revisión. Una importación no autoriza incorporar otras recetas ni añadir archivos ajenos al commit. La publicación de recetas seleccionadas debe hacerse después de revisar el diff y pasar las pruebas.

Si se interrumpe una importación, se conserva una copia local en `.recetario-recovery.json` y se bloquean nuevas importaciones. Antes de recuperarla, revisa cualquier cambio posterior: la recuperación restaura las versiones previas y puede sobrescribirlo. Ejecuta `python3 scripts/recetario.py --dest . --manifest data/manifest.json --catalog data/catalogo.json --recover`. Esta recuperación protege frente a la interrupción del proceso, pero no garantiza una transacción atómica ante una caída del sistema o pérdida de alimentación. El archivo de recuperación está excluido de Git.

Si el nombre del logotipo difiere del título del Markdown, registrar el texto visible en `displayTitle` en el catálogo. El importador conserva ese campo en actualizaciones posteriores. La imagen de presentación opcional `image.displayPath` permite usar una portada alternativa sin introducir excepciones en el código.

## Comprobaciones

Las pruebas usan las recetas incluidas en el repositorio; la comprobación real del optimizador se omite si faltan `cwebp` o `sips`.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_*.py'
node --test tests/app.test.cjs
```

GitHub Pages publica la rama `main`. La web usa rutas relativas para funcionar en `/recetas/`.
