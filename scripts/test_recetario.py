import importlib.util
import json
import shutil
import tempfile
import unittest
from unittest import mock
from pathlib import Path

spec = importlib.util.spec_from_file_location('recetario', Path(__file__).with_name('recetario.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.src = self.base / 'Cocina'
        self.dest = self.base / 'Web'
        shutil.copytree(Path(__file__).resolve().parents[1] / 'Arroces', self.src / 'Arroces')
        self.manifest = self.base / 'manifest.json'
        self.catalog = self.base / 'catalog.json'
        self.md = self.src / 'Arroces/arroz-meloso-secreto-iberico-setas.md'

    def tearDown(self):
        self.temp.cleanup()

    def run_import(self):
        return r.import_recipes(self.src, self.dest, ['Arroces/' + self.md.name], self.manifest, self.catalog)

    def test_roundtrip_and_safe_source_update(self):
        self.assertEqual(self.run_import(), (1, 1))
        data = json.loads(self.catalog.read_text())['recipes'][0]
        self.assertEqual(data['markdown'], self.md.read_text())
        self.assertIn('4 personas | 6 personas', data['sections'][0]['markdown'])
        self.assertEqual((self.dest / data['image']['path']).read_bytes(), (self.src / data['image']['path']).read_bytes())
        self.md.write_text(self.md.read_text() + '\nNota adicional.\n')
        self.run_import()
        self.assertEqual((self.dest / 'Arroces' / self.md.name).read_text(), self.md.read_text())

    def test_preserves_pdf_and_custom_logo_when_reimporting(self):
        self.run_import()
        custom_logo = self.dest / 'assets' / 'custom.png'
        custom_logo.parent.mkdir()
        custom_logo.write_bytes(b'logo')
        data = json.loads(self.catalog.read_text())
        data['recipes'][0]['image']['logoPath'] = 'assets/custom.png'
        data['recipes'][0]['image']['displayPath'] = 'assets/custom.png'
        data['recipes'][0]['displayTitle'] = 'Título del logotipo'
        self.catalog.write_text(json.dumps(data))
        self.run_import()
        recipe = json.loads(self.catalog.read_text())['recipes'][0]
        self.assertEqual(recipe['pdfPath'], 'Arroces/1.arroz-meloso-secreto-iberico-setas.pdf')
        self.assertEqual(recipe['image']['logoPath'], 'assets/custom.png')
        self.assertEqual(recipe['image']['displayPath'], 'assets/custom.png')
        self.assertEqual(recipe['displayTitle'], 'Título del logotipo')

    def test_new_recipe_catalog_includes_pdf_and_logo(self):
        shutil.copytree(Path(__file__).resolve().parents[1] / 'Carnes', self.src / 'Carnes')
        r.import_recipes(self.src, self.dest, ['Carnes/lomo-cerdo-ciruelas-cebollitas.md'], self.manifest, self.catalog)
        recipe = json.loads(self.catalog.read_text())['recipes'][0]
        self.assertEqual(recipe['pdfPath'], 'Carnes/3.lomo-cerdo-ciruelas-cebollitas.pdf')
        self.assertEqual(recipe['image']['logoPath'], 'Carnes/lomo-logotipo.png')

    def test_numbered_pdf_and_full_recipe_logo_are_associated(self):
        category = self.src / 'Postres'
        category.mkdir()
        (category / 'tarta-de-queso.md').write_text(
            '# Tarta de Queso\n\n![Tarta](tarta-de-queso-imagen.png)\n\n'
            '## Ingredientes\n- 1 queso\n\n## Elaboración\n1. Mezcla y cocina.\n'
        )
        (category / 'tarta-de-queso-imagen.png').write_bytes(b'image')
        (category / 'tarta-de-queso-logotipo.png').write_bytes(b'logo')
        (category / '9.tarta-de-queso.pdf').write_bytes(b'pdf')
        (category / 'tarta-de-cerveza.md').write_text('# Otra tarta\n')
        r.import_recipes(self.src, self.dest, ['Postres/tarta-de-queso.md'], self.manifest, self.catalog)
        recipe = json.loads(self.catalog.read_text())['recipes'][0]
        self.assertEqual(recipe['pdfPath'], 'Postres/9.tarta-de-queso.pdf')
        self.assertEqual(recipe['image']['logoPath'], 'Postres/tarta-de-queso-logotipo.png')

    def test_preparacion_is_accepted_as_steps(self):
        self.md.write_text(self.md.read_text().replace('## Elaboración', '## Preparación'))
        self.run_import()
        recipe = json.loads(self.catalog.read_text())['recipes'][0]
        self.assertTrue(any(s['heading'] == 'Preparación' for s in recipe['sections']))

    def test_missing_registered_pdf_blocks_import_without_changing_outputs(self):
        self.run_import()
        pdf = self.dest / 'Arroces/1.arroz-meloso-secreto-iberico-setas.pdf'
        pdf.unlink()
        manifest = self.manifest.read_bytes()
        catalog = self.catalog.read_bytes()
        shutil.copytree(Path(__file__).resolve().parents[1] / 'Pastas', self.src / 'Pastas')
        with self.assertRaisesRegex(r.RecipeError, 'PDF registrado'):
            r.import_recipes(self.src, self.dest, ['Pastas/gnocchi-alla-sorrentina.md'], self.manifest, self.catalog)
        self.assertEqual(self.manifest.read_bytes(), manifest)
        self.assertEqual(self.catalog.read_bytes(), catalog)
        self.assertFalse((self.dest / 'Pastas/gnocchi-alla-sorrentina.md').exists())

    def test_interrupted_import_retains_backup_and_can_be_recovered(self):
        self.run_import()
        out = self.dest / 'Arroces' / self.md.name
        original = out.read_bytes()
        old_manifest = self.manifest.read_bytes()
        old_catalog = self.catalog.read_bytes()
        self.md.write_text(self.md.read_text() + '\nNueva versión.\n')
        real_copy = r.shutil.copy2
        def interrupted(src, dst):
            real_copy(src, dst)
            raise KeyboardInterrupt()
        with mock.patch.object(r.shutil, 'copy2', side_effect=interrupted):
            with self.assertRaises(KeyboardInterrupt):
                self.run_import()
        self.assertTrue(r.recovery_path(self.dest).is_file())
        with self.assertRaisesRegex(r.RecipeError, 'interrumpida'):
            self.run_import()
        r.recover_import(self.dest, self.manifest, self.catalog)
        self.assertEqual(out.read_bytes(), original)
        self.assertEqual(self.manifest.read_bytes(), old_manifest)
        self.assertEqual(self.catalog.read_bytes(), old_catalog)
        self.assertFalse(r.recovery_path(self.dest).exists())

    def test_incomplete_recovery_record_never_deletes_files(self):
        self.dest.mkdir()
        existing = self.dest / 'archivo.txt'
        existing.write_text('conservar')
        journal = r.recovery_path(self.dest)
        journal.write_text(json.dumps([{'path': str(existing.resolve())}]))
        with self.assertRaisesRegex(r.RecipeError, 'inválido'):
            r.recover_import(self.dest, self.manifest, self.catalog)
        self.assertEqual(existing.read_text(), 'conservar')
        self.assertTrue(journal.exists())

    def test_conflict_is_detected_before_any_writes(self):
        self.run_import()
        out = self.dest / 'Arroces' / self.md.name
        out.write_text(out.read_text() + '\nEdición local.\n')
        self.md.write_text(self.md.read_text() + '\nEdición de origen.\n')
        original_manifest = self.manifest.read_bytes()
        original_catalog = self.catalog.read_bytes()
        with self.assertRaises(r.RecipeError):
            self.run_import()
        self.assertIn('Edición local.', out.read_text())
        self.assertEqual(self.manifest.read_bytes(), original_manifest)
        self.assertEqual(self.catalog.read_bytes(), original_catalog)

    def test_missing_image_stops_without_copy(self):
        (self.src / 'Arroces/imagen-arroz.png').unlink()
        with self.assertRaises(r.RecipeError):
            self.run_import()
        self.assertFalse(self.dest.exists())
        self.assertFalse(self.manifest.exists())

    def test_additional_local_resources_are_copied(self):
        other = self.md.parent / 'detalle.png'
        other.write_bytes(b'additional-image')
        info = self.md.parent / 'otra.jpg'
        info.write_bytes(b'otra-imagen')
        self.md.write_text(self.md.read_text() + '\n![Detalle](detalle.png)\n\n[Otra foto](otra.jpg)\n')
        self.run_import()
        self.assertEqual((self.dest / 'Arroces/detalle.png').read_bytes(), b'additional-image')
        self.assertEqual((self.dest / 'Arroces/otra.jpg').read_bytes(), b'otra-imagen')

    def test_non_image_link_needs_review(self):
        info = self.md.parent / 'privado.txt'
        info.write_text('privado')
        self.md.write_text(self.md.read_text() + '\n[Notas](privado.txt)\n')
        with self.assertRaisesRegex(r.RecipeError, 'revisión manual'):
            self.run_import()
        self.assertFalse(self.dest.exists())

    def test_unselected_markdown_is_not_published(self):
        self.run_import()
        stray = self.dest / 'Arroces/otra-receta.md'
        stray.write_text('# Archivo no seleccionado\n')
        self.run_import()
        self.assertEqual(len(json.loads(self.catalog.read_text())['recipes']), 1)
        self.assertEqual(stray.read_text(), '# Archivo no seleccionado\n')

    def test_other_tracked_modified_recipe_blocks_import(self):
        self.run_import()
        extra = self.dest / 'Arroces' / self.md.name
        extra.write_text(extra.read_text() + '\nCambio externo\n')
        # Trying to import another selected recipe must not leak that change.
        category = self.src / 'Pastas'
        shutil.copytree(Path(__file__).resolve().parents[1] / 'Pastas', category)
        previous = self.catalog.read_bytes()
        with self.assertRaisesRegex(r.RecipeError, 'modificada'):
            r.import_recipes(self.src, self.dest, ['Pastas/gnocchi-alla-sorrentina.md'], self.manifest, self.catalog)
        self.assertEqual(self.catalog.read_bytes(), previous)

    def test_reject_reference_to_other_category(self):
        other = self.src / 'Carnes'
        other.mkdir()
        (other / 'foto.png').write_bytes(b'photo')
        self.md.write_text(self.md.read_text() + '\n![Detalle](../Carnes/foto.png)\n')
        with self.assertRaisesRegex(r.RecipeError, 'fuera de la categoría'):
            self.run_import()

    def test_failed_copy_restores_existing_files_and_outputs(self):
        self.run_import()
        out = self.dest / 'Arroces' / self.md.name
        original = out.read_bytes()
        manifest = self.manifest.read_bytes()
        catalog = self.catalog.read_bytes()
        self.md.write_text(self.md.read_text() + '\nNota nueva.\n')
        original_copy = r.shutil.copy2
        def failing_copy(src, dst):
            original_copy(src, dst)
            raise OSError('error simulado tras copiar')
        with mock.patch.object(r.shutil, 'copy2', side_effect=failing_copy):
            with self.assertRaises(OSError):
                self.run_import()
        self.assertEqual(out.read_bytes(), original)
        self.assertEqual(self.manifest.read_bytes(), manifest)
        self.assertEqual(self.catalog.read_bytes(), catalog)

    def test_overlapping_source_and_destination_are_rejected(self):
        with self.assertRaisesRegex(r.RecipeError, 'solaparse'):
            r.import_recipes(self.src, self.src, ['--all'], self.manifest, self.catalog)
        with self.assertRaisesRegex(r.RecipeError, 'Cocina'):
            r.import_recipes(self.src, self.dest, ['--all'], self.src / 'manifest.json', self.catalog)

    def test_destination_symlink_cannot_escape(self):
        self.dest.mkdir()
        outside = self.base / 'outside'
        outside.mkdir()
        (self.dest / 'Arroces').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(r.RecipeError):
            self.run_import()
        self.assertEqual(list(outside.iterdir()), [])

    def test_missing_extra_reference_stops_import(self):
        self.md.write_text(self.md.read_text() + '\n![Detalle](no-existe.png)\n')
        with self.assertRaises(r.RecipeError):
            self.run_import()
        self.assertFalse(self.dest.exists())

    def test_invalid_or_traversal_selection_is_rejected(self):
        with self.assertRaises(r.RecipeError):
            r.import_recipes(self.src, self.dest, ['../outside.md'], self.manifest, self.catalog)

if __name__ == '__main__':
    unittest.main()
