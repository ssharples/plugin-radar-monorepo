import argparse
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools.quality import cli


class GateSequenceTests(unittest.TestCase):
    def run_main(self, directory, passed):
        files = ['apps/desktop/ui/src/sample.ts']
        with patch('tools.quality.cli.ROOT', Path(directory)), patch('tools.quality.cli.scope.select', return_value=files), patch('tools.quality.cli.run_crap', return_value=({'source_sha256': {}}, passed)) as crap, patch('tools.quality.cli.run_mutation', return_value=True) as mutate, contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = cli.main(['gate', '--report-dir', str(Path(directory) / 'report')])
        return result, crap.call_count, mutate.call_count

    def test_failing_crap_blocks_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            result, crap, mutation = self.run_main(directory, False)
        self.assertEqual((result, crap, mutation), (1, 1, 0))

    def test_passing_crap_precedes_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            result, crap, mutation = self.run_main(directory, True)
        self.assertEqual((result, crap, mutation), (0, 1, 1))

    def test_empty_explicit_selection_does_not_mutate_dirty_modules_or_leave_stale_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            selected = root / 'selected.json'; selected.write_text('[]')
            reports = root / 'report'; reports.mkdir()
            for name in ('crap.json', 'mutation.json'):
                (reports / name).write_text('{"status":"pass"}')
            with patch('tools.quality.cli.scope.select') as selection, patch('tools.quality.cli.run_crap') as crap, contextlib.redirect_stdout(io.StringIO()):
                code = cli.main(['gate', '--files-json', str(selected), '--report-dir', str(reports)])
            self.assertEqual(code, 0)
            selection.assert_not_called(); crap.assert_not_called()
            self.assertFalse((reports / 'mutation.json').exists())
            self.assertEqual(json.loads((reports / 'scope.json').read_text())['status'], 'no_production_changes')

    def test_failed_provider_blocks_even_a_good_metric(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = 'apps/desktop/ui/src/sample.ts'
            (root / source).parent.mkdir(parents=True); (root / source).write_text('const f = () => 1')
            args = argparse.Namespace(report_dir=root, test_filter=None)
            metric = {'functions': [], 'issues': [], 'not_available': 0, 'above_threshold': 0}
            provider = {'status': 'error', 'exit_status': 1, 'reports': []}
            with patch('tools.quality.cli.ROOT', root), patch('tools.quality.cli.coverage_for', return_value=provider), patch('tools.quality.cli.crap.analyze_files', return_value=metric), contextlib.redirect_stdout(io.StringIO()):
                report, passed = cli.run_crap([source], args)
            self.assertFalse(passed)
            self.assertFalse(report['tests_passed'])

    def test_source_edits_during_coverage_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = 'apps/desktop/ui/src/sample.ts'
            (root / source).parent.mkdir(parents=True); (root / source).write_text('const f = () => 1')
            args = argparse.Namespace(report_dir=root, test_filter=None)
            metric = {'functions': [], 'issues': [], 'not_available': 0, 'above_threshold': 0}
            def coverage(*args):
                (root / source).write_text('const f = () => 2')
                return {'status': 'ok', 'exit_status': 0, 'reports': ['coverage.json']}
            with patch('tools.quality.cli.ROOT', root), patch('tools.quality.cli.coverage_for', side_effect=coverage), patch('tools.quality.cli.read_reports', return_value={}), patch('tools.quality.cli.crap.analyze_files', return_value=metric), contextlib.redirect_stdout(io.StringIO()):
                report, passed = cli.run_crap([source], args)
            self.assertFalse(passed)
            self.assertTrue(report['source_changed_during_run'])

if __name__ == '__main__':
    unittest.main()
