#!/usr/bin/env python3
"""Genera versiones WebP para las fotos de portada ya incluidas en el catálogo."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath

CWEBP = '/opt/homebrew/bin/cwebp'
SIPS = '/usr/bin/sips'

class OptimizationError(Exception):
    pass

def inside(path, root):
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False

def dimensions(path):
    result = subprocess.run([SIPS, '-g', 'pixelWidth', '-g', 'pixelHeight', str(path)],
                            check=True, capture_output=True, text=True)
    width = re.search(r'pixelWidth:\s*(\d+)', result.stdout)
    height = re.search(r'pixelHeight:\s*(\d+)', result.stdout)
    if not width or not height or int(width.group(1)) < 1 or int(height.group(1)) < 1:
        raise OptimizationError(f'No se han podido leer las dimensiones de {path.name}')
    return int(width.group(1)), int(height.group(1))

def valid_relative(value):
    if not isinstance(value, str) or not value or '\\' in value:
        raise OptimizationError('Ruta de imagen inválida en el catálogo')
    path = PurePosixPath(value)
    if path.is_absolute() or any(x in ('.', '..') for x in path.parts):
        raise OptimizationError(f'Ruta de imagen no permitida: {value}')
    if len(path.parts) != 2:
        raise OptimizationError(f'Se esperaba una imagen dentro de una categoría: {value}')
    return path

def optimize(project, catalog):
    project = project.resolve()
    catalog = catalog.resolve()
    if not inside(catalog, project) or not catalog.is_file():
        raise OptimizationError('El catálogo debe existir dentro del proyecto')
    data = json.loads(catalog.read_text(encoding='utf-8'))
    recipes = data.get('recipes')
    if not isinstance(recipes, list):
        raise OptimizationError('Catálogo sin lista de recetas')
    pending = []
    for recipe in recipes:
        image = recipe.get('image')
        if not isinstance(image, dict):
            raise OptimizationError('Receta sin imagen')
        relative = valid_relative(image.get('path'))
        source = (project / relative).resolve()
        if not inside(source, project) or not source.is_file():
            raise OptimizationError(f'Imagen fuera del proyecto o ausente: {relative}')
        if source.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            raise OptimizationError(f'Tipo de imagen no admitido: {relative}')
        source_bytes = source.read_bytes()
        # Include the path to distinguish equally named files and a content hash
        # to leave earlier published assets untouched during a failed update.
        identity = hashlib.sha256(relative.as_posix().encode('utf-8') + b'\0' + source_bytes).hexdigest()[:20]
        output_rel = PurePosixPath('assets/web') / relative.parent / (relative.stem + '-' + identity + '.webp')
        output = project / output_rel
        if not inside(output.resolve(), project):
            raise OptimizationError(f'La ruta de salida escapa del proyecto: {output_rel}')
        pending.append((source, output, output_rel.as_posix(), image))
    # Encode everything before modifying output files or the catalog.
    with tempfile.TemporaryDirectory(prefix='recetario-webp-') as temp:
        ready = []
        for index, (source, output, output_rel, image) in enumerate(pending):
            width, height = dimensions(source)
            args = [CWEBP, '-quiet', '-q', '82']
            if max(width, height) > 1200:
                args += ['-resize', '1200', '0'] if width >= height else ['-resize', '0', '1200']
            temp_file = Path(temp) / f'{index}.webp'
            subprocess.run(args + [str(source), '-o', str(temp_file)], check=True, capture_output=True)
            data_bytes = temp_file.read_bytes()
            if len(data_bytes) < 12 or data_bytes[:4] != b'RIFF' or data_bytes[8:12] != b'WEBP':
                raise OptimizationError(f'El archivo WebP generado no es válido: {output_rel}')
            ready.append((data_bytes, output, output_rel, image))
        for data_bytes, output, output_rel, image in ready:
            # Recheck resolution before writing to guard against pre-existing symlinks.
            if not inside(output.resolve(), project):
                raise OptimizationError(f'La ruta de salida escapa del proyecto: {output_rel}')
            output.parent.mkdir(parents=True, exist_ok=True)
            if not output.exists() or output.read_bytes() != data_bytes:
                with tempfile.NamedTemporaryFile(dir=str(output.parent), prefix='.webp-', delete=False) as temp_out:
                    temp_out_path = Path(temp_out.name)
                    try:
                        temp_out.write(data_bytes)
                        temp_out.flush()
                        os.fsync(temp_out.fileno())
                    except Exception:
                        temp_out_path.unlink(missing_ok=True)
                        raise
                try:
                    os.replace(temp_out_path, output)
                finally:
                    temp_out_path.unlink(missing_ok=True)
            image['optimizedPath'] = output_rel
        for _, output, _, _ in ready:
            if not output.is_file():
                raise OptimizationError(f'Falta la imagen generada: {output}')
        content = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
        if catalog.read_text(encoding='utf-8') != content:
            with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=str(catalog.parent), prefix='.catalog-', delete=False) as temp_catalog:
                temp_catalog_path = Path(temp_catalog.name)
                try:
                    temp_catalog.write(content)
                    temp_catalog.flush()
                    os.fsync(temp_catalog.fileno())
                except Exception:
                    temp_catalog_path.unlink(missing_ok=True)
                    raise
            try:
                os.replace(temp_catalog_path, catalog)
            finally:
                temp_catalog_path.unlink(missing_ok=True)
    return len(recipes)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--catalog', type=Path, required=True)
    args = parser.parse_args()
    try:
        count = optimize(args.project, args.catalog)
    except (OSError, ValueError, OptimizationError, subprocess.SubprocessError) as exc:
        print(f'Error: {exc}', file=sys.stderr)
        return 1
    print(f'Imágenes optimizadas: {count}.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
