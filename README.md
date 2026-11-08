# Recetario Ortiz

Catálogo público de recetas para consultar desde el móvil o el ordenador. La web es estática y no utiliza una base de datos ni permite modificar recetas desde el navegador.

## Consultar en local

Desde la raíz del proyecto, ejecutar `python3 -m http.server 8000` y abrir `http://localhost:8000/`. No abrir `index.html` directamente: el navegador necesita cargar el catálogo por HTTP.

## Incorporar recetas

Usar la skill `anade-receta` e indicar las recetas concretas. La fuente editable está en `/Users/javi/Cocina`. El importador copia los archivos asociados y actualiza el catálogo preservando los originales. Para usarlo directamente desde la raíz del proyecto:

```sh
python3 scripts/recetario.py --dest . --manifest data/manifest.json --catalog data/catalogo.json --recipe 'Carnes/ejemplo.md'
python3 scripts/optimizar_imagenes.py --project . --catalog data/catalogo.json
```

Repetir `--recipe` por cada receta. Ejecutar siempre el optimizador después de importar; requiere `cwebp` y `sips` en el Mac. El importador rechaza conflictos, recursos ausentes y referencias locales que requieran revisión. Una importación no autoriza incorporar otras recetas ni añadir archivos ajenos al commit. La publicación de recetas seleccionadas debe hacerse después de revisar el diff y pasar las pruebas.

## Comprobaciones

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_*.py'
node --test tests/app.test.cjs
```

GitHub Pages publica la rama `main`. La web usa rutas relativas para funcionar en `/recetas/`.
