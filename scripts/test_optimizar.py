import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

spec = importlib.util.spec_from_file_location('optimizer', Path(__file__).with_name('optimizar_imagenes.py'))
optimizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(optimizer)

class ImageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'Arroces').mkdir()
        shutil.copy2('/Users/javi/Cocina/Arroces/imagen-arroz.png', self.root / 'Arroces/imagen-arroz.png')
        self.catalog = self.root / 'catalogo.json'
        self.data = {'version': 1, 'recipes': [{'image': {'path': 'Arroces/imagen-arroz.png', 'alt': 'Imagen'}}]}
        self.catalog.write_text(json.dumps(self.data), encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def test_generates_idempotently_without_changing_original(self):
        source = self.root / 'Arroces/imagen-arroz.png'
        original = source.read_bytes()
        self.assertEqual(optimizer.optimize(self.root, self.catalog), 1)
        catalog = self.catalog.read_bytes()
        data = json.loads(catalog)
        optimized = self.root / data['recipes'][0]['image']['optimizedPath']
        self.assertTrue(optimized.is_file())
        webp = optimized.read_bytes()
        optimizer.optimize(self.root, self.catalog)
        self.assertEqual(catalog, self.catalog.read_bytes())
        self.assertEqual(webp, optimized.read_bytes())
        self.assertEqual(original, source.read_bytes())

    def test_source_missing_does_not_change_catalog(self):
        self.data['recipes'][0]['image']['path'] = 'Arroces/ausente.png'
        self.catalog.write_text(json.dumps(self.data))
        original = self.catalog.read_bytes()
        with self.assertRaises(optimizer.OptimizationError):
            optimizer.optimize(self.root, self.catalog)
        self.assertEqual(original, self.catalog.read_bytes())

    def test_escape_and_symlink_are_rejected(self):
        self.data['recipes'][0]['image']['path'] = '../privado.png'
        self.catalog.write_text(json.dumps(self.data))
        with self.assertRaises(optimizer.OptimizationError):
            optimizer.optimize(self.root, self.catalog)
        outside = Path(self.temp.name).parent / 'recetario-unrelated-image.png'
        try:
            outside.write_bytes(b'external')
            (self.root / 'Arroces/enlace.png').symlink_to(outside)
            self.data['recipes'][0]['image']['path'] = 'Arroces/enlace.png'
            self.catalog.write_text(json.dumps(self.data))
            with self.assertRaises(optimizer.OptimizationError):
                optimizer.optimize(self.root, self.catalog)
        finally:
            outside.unlink(missing_ok=True)

    def test_encoder_failure_leaves_catalog_unchanged(self):
        original = self.catalog.read_bytes()
        real = optimizer.subprocess.run
        def run(args, **kwargs):
            if args[0] == optimizer.CWEBP:
                raise OSError('fallo simulado')
            return real(args, **kwargs)
        with mock.patch.object(optimizer.subprocess, 'run', side_effect=run):
            with self.assertRaises(OSError):
                optimizer.optimize(self.root, self.catalog)
        self.assertEqual(original, self.catalog.read_bytes())

if __name__ == '__main__':
    unittest.main()
