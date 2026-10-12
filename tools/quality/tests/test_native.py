import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools.quality import native


class NativeAdapterTests(unittest.TestCase):
    def test_compiler_driver_name_is_preserved(self):
        with patch.dict(os.environ, {"CLANGXX": "/llvm/bin/clang++"}), patch("shutil.which", return_value="/llvm/bin/clang++"):
            self.assertEqual(native._tool("CLANGXX", "clang++", root=Path.cwd()).name, "clang++")

    def test_rejects_mixed_llvm_versions(self):
        def run(command, **kwargs):
            version = 20 if "llvm-cov" in command[0] else 21
            return subprocess.CompletedProcess(command, 0, f"LLVM version {version}.0", "")
        with patch("tools.quality.native._tool", side_effect=lambda key, name, **kwargs: Path('/llvm/bin') / name), patch("tools.quality.native._run", side_effect=run):
            with self.assertRaisesRegex(ValueError, "one LLVM toolchain"):
                native._llvm(Path.cwd())

    def fixture(self, directory):
        root = Path(directory).resolve()
        source = root / "apps/desktop/src/example.cpp"
        source.parent.mkdir(parents=True)
        source.write_text("int f() { return 1; }\n")
        output = root / "out"
        output.mkdir()
        compiler = {key: Path('/llvm/bin') / name for key, name in (("CLANG", "clang"), ("CLANGXX", "clang++"), ("LLVM_COV", "llvm-cov"), ("LLVM_PROFDATA", "llvm-profdata"))}
        return root, source, output, compiler

    def test_runs_both_fresh_binaries_and_exports_coverage(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source, output, compiler = self.fixture(directory)
            (output / "profiles").mkdir()
            (output / "profiles/stale.profraw").write_text("old")
            (output / "old.coverage.json").write_text("old")
            def run(command, **kwargs):
                stdout = "ok"
                if command[1:2] == ["--build"]:
                    build = Path(command[2]); build.mkdir()
                    for target in native.TEST_TARGETS:
                        (build / target).write_text("binary")
                if "LLVM_PROFILE_FILE" in (kwargs.get("env") or {}):
                    Path(kwargs['env']['LLVM_PROFILE_FILE'].replace('%p', '1')).write_text('fresh')
                if command[1:2] == ["export"]:
                    stdout = json.dumps({"type": "llvm.coverage.json.export", "version": "2.0.1", "data": []})
                return subprocess.CompletedProcess(command, 0, stdout, "")
            with patch("tools.quality.native._llvm", return_value=(compiler, 21)), patch("tools.quality.native._tool", return_value=Path('/bin/cmake')), patch("tools.quality.native._run", side_effect=run):
                result = native.run_coverage("cpp", [source], root, output)
            self.assertEqual(result['status'], 'ok', result)
            self.assertEqual(result['exit_status'], 0)
            self.assertEqual(len(result['reports']), 2)
            self.assertTrue(all(Path(path).is_file() for path in result['reports']))
            self.assertFalse((output / 'profiles/stale.profraw').exists())
            self.assertFalse((output / 'old.coverage.json').exists())
            tests = [c for c in result['commands'] if Path(c[0]).name in native.TEST_TARGETS]
            self.assertEqual(len(tests), 2)
            self.assertTrue(all(Path(c[0]).parent == output / 'build' for c in tests))
            self.assertIn('--parallel', result['commands'][1])
            self.assertIn('3', result['commands'][1])
            self.assertNotIn('--format=json', str(result['commands']))

    def test_failed_build_cannot_return_old_coverage(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source, output, compiler = self.fixture(directory)
            (output / 'old.coverage.json').write_text('{}')
            with patch("tools.quality.native._llvm", return_value=(compiler, 21)), patch("tools.quality.native._tool", return_value=Path('/bin/cmake')), patch("tools.quality.native._run", return_value=subprocess.CompletedProcess([], 1, '', 'failed')):
                result = native.run_coverage('cpp', [source], root, output)
            self.assertNotEqual(result['exit_status'], 0)
            self.assertEqual(result['reports'], [])
            self.assertFalse((output / 'old.coverage.json').exists())

    def test_configuration_is_reviewable_without_native_tools_or_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source, output, _ = self.fixture(directory)
            with patch('tools.quality.native._tool', return_value=Path('/bin/cmake')), patch('tools.quality.native._run') as run:
                result = native.run_mutation('cpp', [source], root, output, configure_only=True)
            run.assert_not_called()
            self.assertEqual(result['status'], 'configured')
            self.assertFalse(result['executed'])
            self.assertIn('-fpass-plugin=${MULL_IR_FRONTEND}', str(result['commands']))
            self.assertEqual(len(result['commands']), 4)
            self.assertIn('MULL_CONFIG', json.loads((output / 'plan.json').read_text())['environment'])
            self.assertIn('includePaths:', (output / 'mull.yml').read_text())

    def test_missing_mull_does_not_pass_or_use_the_normal_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source, output, compiler = self.fixture(directory)
            with patch('tools.quality.native._tool', return_value=Path('/bin/cmake')), patch('tools.quality.native._llvm', return_value=(compiler, 21)), patch.dict(os.environ, {'MULL_LLVM_MAJOR': ''}):
                result = native.run_mutation('cpp', [source], root, output)
            self.assertNotEqual(result['exit_status'], 0)
            self.assertEqual(result['reports'], [])
            self.assertFalse(result['executed'])

if __name__ == '__main__':
    unittest.main()
