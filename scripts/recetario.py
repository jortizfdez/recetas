#!/usr/bin/env python3
"""Import and index Recetario Ortiz Markdown files, without third-party packages."""
import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote

IMAGE = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')
HEADING = re.compile(r'^##\s+(.+?)\s*$')
METADATA = re.compile(r'\*\*([^*]+):\*\*\s*([^·\n]+)')
LINK = re.compile(r'(?<!!)\[[^\]]+\]\(([^)]+)\)')

class RecipeError(Exception):
    pass

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def inside(path, root):
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False

def parse_recipe(path, root):
    root = root.resolve()
    path = path.resolve()
    if not inside(path, root) or path.suffix.lower() != '.md':
        raise RecipeError(f'Receta fuera del origen o no Markdown: {path}')
    relative = path.relative_to(root)
    if len(relative.parts) != 2:
        raise RecipeError(f'Se espera una receta dentro de una categoría: {relative}')
    raw = path.read_text(encoding='utf-8')
    lines = raw.splitlines()
    if not lines or not lines[0].startswith('# ') or not lines[0][2:].strip():
        raise RecipeError(f'Falta el título: {relative}')
    title = lines[0][2:].strip()
    headings = [(i, m.group(1)) for i, line in enumerate(lines) if (m := HEADING.match(line))]
    if not headings:
        raise RecipeError(f'Faltan secciones: {relative}')
    intro = '\n'.join(lines[1:headings[0][0]]).strip()
    metadata = {m.group(1).strip(): m.group(2).strip() for m in METADATA.finditer(intro)}
    images = list(IMAGE.finditer(intro))
    if not images:
        raise RecipeError(f'Falta una imagen principal en la cabecera: {relative}')
    alt, image_uri = images[0].groups()
    if '://' in image_uri or image_uri.startswith('/') or '#' in image_uri or '?' in image_uri:
        raise RecipeError(f'La imagen debe ser un archivo local: {relative}')
    image_file = (path.parent / unquote(image_uri)).resolve()
    if not inside(image_file, path.parent) or not image_file.is_file():
        raise RecipeError(f'Imagen ausente o fuera de la categoría: {relative}: {image_uri}')
    sections = []
    for n, (index, heading) in enumerate(headings):
        end = headings[n+1][0] if n+1 < len(headings) else len(lines)
        content = '\n'.join(lines[index+1:end]).strip()
        if not content:
            raise RecipeError(f'Sección vacía «{heading}»: {relative}')
        sections.append({'heading': heading, 'markdown': content})
    lower = [h.lower() for _, h in headings]
    if not any(h.startswith('ingredientes') for h in lower) or 'elaboración' not in lower:
        raise RecipeError(f'Faltan ingredientes o elaboración: {relative}')
    if not re.search(r'^\s*1\.\s+\S', next(x['markdown'] for x in sections if x['heading'].lower() == 'elaboración'), re.M):
        raise RecipeError(f'No se identifica el primer paso: {relative}')
    # Keep complete source and every section intact; presentation never has to discard
    # paragraphs, links, unusual quantities or additional section types.
    return {'id': relative.with_suffix('').as_posix(), 'category': relative.parts[0],
            'title': title, 'metadata': metadata,
            'image': {'path': image_file.relative_to(root).as_posix(), 'alt': alt},
            'sections': sections, 'markdown': raw}

def local_references(path, root):
    """Find every local Markdown link/image; reject missing and escaping resources."""
    raw = path.read_text(encoding='utf-8')
    uris = [m.group(2) for m in IMAGE.finditer(raw)] + [m.group(1) for m in LINK.finditer(raw)]
    result = set()
    for uri in uris:
        if uri.startswith(('https://', 'http://', 'mailto:', '#')):
            continue
        if ':' in uri.split('/')[0] or uri.startswith('/') or '?' in uri:
            raise RecipeError(f'Enlace local no admitido en {path.name}: {uri}')
        file_part = unquote(uri.split('#', 1)[0])
        if not file_part:
            continue
        asset = (path.parent / file_part).resolve()
        if not inside(asset, path.parent.resolve()) or not asset.is_file():
            raise RecipeError(f'Recurso local ausente o fuera de la categoría: {uri}')
        if asset.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp', '.gif'}:
            raise RecipeError(f'Recurso local no fotográfico requiere revisión manual: {uri}')
        result.add(asset)
    return result

def recipe_assets(path, root):
    parse_recipe(path, root)
    pdfs = list(path.parent.glob('*.' + path.stem + '.pdf'))
    if len(pdfs) != 1:
        raise RecipeError(f'Se esperaba un PDF asociado a {path.name}; encontrados {len(pdfs)}')
    files = {path.resolve(), pdfs[0].resolve()} | local_references(path, root)
    prefix = path.stem.split('-')[0]
    logos = list(path.parent.glob(prefix + '-logotipo.png'))
    candidates = list(path.parent.glob(prefix + '-*.md'))
    if logos and len(candidates) > 1:
        raise RecipeError(f'No se puede asociar el logotipo con seguridad a {path.name}')
    files.update(x.resolve() for x in logos)
    if any(not inside(x, root.resolve()) for x in files):
        raise RecipeError(f'Un archivo asociado a {path.name} sale de Cocina')
    return files

def generate(root, manifest, previous_catalog=None):
    # Only explicitly imported recipes belong to the published catalog.
    paths = sorted(root / key for key in manifest if key.lower().endswith('.md'))
    for path in paths:
        if not inside(path.resolve(), root.resolve()) or not path.is_file():
            raise RecipeError(f'Receta registrada ausente o fuera del proyecto: {path}')
        key = path.relative_to(root).as_posix()
        if digest(path) != manifest[key]:
            raise RecipeError(f'Receta registrada modificada fuera de la importación: {key}')
    previous = {recipe['id']: recipe for recipe in (previous_catalog or {}).get('recipes', [])
                if isinstance(recipe, dict) and isinstance(recipe.get('id'), str)}
    recipes = []
    for path in paths:
        recipe = parse_recipe(path, root)
        relative = path.relative_to(root)
        pdfs = sorted(Path(name) for name in manifest
                      if Path(name).parent == relative.parent
                      and Path(name).name.endswith('.' + path.stem + '.pdf'))
        if len(pdfs) != 1:
            raise RecipeError(f'Se esperaba un PDF registrado para {relative}')
        pdf = root / pdfs[0]
        if not inside(pdf.resolve(), root.resolve()) or not pdf.is_file() or digest(pdf) != manifest[pdfs[0].as_posix()]:
            raise RecipeError(f'PDF registrado ausente o modificado: {pdfs[0]}')
        recipe['pdfPath'] = pdfs[0].as_posix()
        prefix = path.stem.split('-')[0]
        logo = relative.parent / (prefix + '-logotipo.png')
        if logo.as_posix() in manifest and (root / logo).is_file():
            recipe['image']['logoPath'] = logo.as_posix()
        old_recipe = previous.get(recipe['id'], {})
        display_title = old_recipe.get('displayTitle')
        if isinstance(display_title, str) and display_title.strip():
            recipe['displayTitle'] = display_title
        old_image = old_recipe.get('image', {})
        if isinstance(old_image, dict):
            for key in ('logoPath', 'optimizedPath', 'displayPath'):
                value = old_image.get(key)
                if not isinstance(value, str) or not value or Path(value).is_absolute():
                    continue
                candidate = (root / value).resolve()
                if inside(candidate, root.resolve()) and candidate.is_file():
                    if key == 'logoPath' or old_image.get('path') == recipe['image']['path']:
                        recipe['image'].setdefault(key, value)
        recipes.append(recipe)
    return recipes

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def recovery_path(dest):
    return dest / '.recetario-recovery.json'

def save_recovery(dest, backups):
    journal = recovery_path(dest)
    if journal.exists():
        raise RecipeError(f'Hay una importación interrumpida; revisa y recupera {journal}')
    dest.mkdir(parents=True, exist_ok=True)
    records = [{'path': str(path.resolve()), 'data': base64.b64encode(data).decode('ascii') if data is not None else None}
               for path, data in backups.items()]
    fd, temporary = tempfile.mkstemp(prefix='.recetario-recovery-', dir=dest)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as file:
            json.dump(records, file)
            file.flush()
            os.fsync(file.fileno())
        # The journal must be complete before the first destination is modified.
        os.link(temporary, journal)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return journal

def recover_import(dest, manifest, catalog):
    dest = dest.resolve()
    journal = recovery_path(dest)
    if not journal.is_file():
        raise RecipeError('No hay ninguna recuperación pendiente')
    records = json.loads(journal.read_text(encoding='utf-8'))
    if not isinstance(records, list):
        raise RecipeError('Registro de recuperación inválido')
    allowed_outputs = {manifest.resolve(), catalog.resolve()}
    decoded = []
    for record in records:
        if (not isinstance(record, dict) or not isinstance(record.get('path'), str)
                or 'data' not in record or not (record['data'] is None or isinstance(record['data'], str))):
            raise RecipeError('Registro de recuperación inválido')
        target = Path(record['path'])
        if not target.is_absolute() or target.resolve() != target or target == journal or not (inside(target, dest) or target in allowed_outputs):
            raise RecipeError('Ruta no permitida en el registro de recuperación')
        data = record['data']
        decoded.append((target, None if data is None else base64.b64decode(data, validate=True)))
    for target, data in decoded:
        if data is None:
            target.unlink(missing_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    journal.unlink()

def import_recipes(source, dest, selection, manifest, catalog):
    source, dest = source.resolve(), dest.resolve()
    if recovery_path(dest).exists():
        raise RecipeError('Hay una importación interrumpida; usa --recover después de revisar los cambios')
    if inside(source, dest) or inside(dest, source):
        raise RecipeError('Origen y destino no pueden solaparse')
    if any(inside(p.resolve(), source) for p in (manifest, catalog)):
        raise RecipeError('El catálogo y el manifiesto no pueden escribirse en Cocina')
    paths = sorted(source.glob('*/*.md')) if selection == ['--all'] else [(source / x).resolve() for x in selection]
    if not paths:
        raise RecipeError('No se seleccionó ninguna receta')
    for path in paths:
        if not inside(path, source) or not path.is_file():
            raise RecipeError(f'No existe la receta seleccionada: {path}')
    if manifest.exists():
        old = json.loads(manifest.read_text(encoding='utf-8'))
        if not isinstance(old, dict):
            raise RecipeError('El registro de importaciones no es válido')
    else:
        old = {}
    previous_catalog = json.loads(catalog.read_text(encoding='utf-8')) if catalog.exists() else {}
    if not isinstance(previous_catalog, dict) or not isinstance(previous_catalog.get('recipes', []), list):
        raise RecipeError('El catálogo existente no es válido')
    to_copy = {}
    for path in paths:
        for asset in recipe_assets(path, source):
            rel = asset.relative_to(source).as_posix()
            if rel in to_copy and digest(to_copy[rel]) != digest(asset):
                raise RecipeError(f'Colisión entre archivos: {rel}')
            to_copy[rel] = asset
    # Refuse symlinks escaping the destination and locally changed files.
    targets = {}
    for rel, asset in to_copy.items():
        target = dest / rel
        if not inside(target.resolve(), dest):
            raise RecipeError(f'El destino sale del proyecto: {rel}')
        if target.exists() and digest(target) != digest(asset):
            if old.get(rel) != digest(target):
                raise RecipeError(f'Archivo de destino modificado o no registrado: {rel}; revisar antes de actualizar')
        targets[target] = asset
    replacements = {p.relative_to(source).as_posix(): p for p in paths}
    for rel, recorded_hash in old.items():
        if not rel.lower().endswith('.md') or rel in replacements:
            continue
        current = dest / rel
        if not inside(current.resolve(), dest) or not current.is_file() or digest(current) != recorded_hash:
            raise RecipeError(f'Receta registrada ausente o modificada fuera de la importación: {rel}')
        parse_recipe(current, dest)
    # Snapshot every affected file first; restore byte-for-byte if any later
    # copy, validation or output write fails. No deleted destination is guessed.
    outputs = [manifest.resolve(), catalog.resolve()]
    if len(set(outputs)) != 2 or any(p in targets for p in outputs):
        raise RecipeError('Las salidas se solapan entre sí o con archivos de receta')
    impacted = list(targets) + outputs
    if recovery_path(dest) in impacted:
        raise RecipeError('La ruta de recuperación se solapa con una salida')
    backups = {p: (p.read_bytes() if p.exists() else None) for p in impacted}
    journal = save_recovery(dest, backups)
    try:
        for target, asset in sorted(targets.items()):
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or digest(target) != digest(asset):
                shutil.copy2(asset, target)
            old[target.relative_to(dest).as_posix()] = digest(asset)
        result = generate(dest, old, previous_catalog)
        write_json(manifest, old)
        write_json(catalog, {'version': 1, 'recipes': result})
    except Exception:
        # Use a separate writer so a simulated copy/write failure does not
        # prevent rollback. Preserve every pre-existing byte exactly.
        for target, data in backups.items():
            if data is None:
                if target.exists():
                    target.unlink()
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
        journal.unlink()
        raise
    journal.unlink()
    return len(paths), len(result)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/Users/javi/Cocina'))
    parser.add_argument('--dest', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--catalog', type=Path, required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--recover', action='store_true', help='Restaurar los archivos de una importación interrumpida')
    group.add_argument('--all', action='store_true', help='Importar todas las recetas')
    group.add_argument('--recipe', action='append', help='Ruta relativa a Cocina; se puede repetir')
    args = parser.parse_args()
    try:
        if args.recover:
            recover_import(args.dest, args.manifest, args.catalog)
            print('Archivos restaurados.')
            return 0
        n, total = import_recipes(args.source, args.dest, ['--all'] if args.all else args.recipe, args.manifest, args.catalog)
    except (OSError, ValueError, RecipeError) as exc:
        print('Error:', exc, file=sys.stderr)
        return 1
    print(f'Recetas seleccionadas: {n}; catálogo: {total}.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
