import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools.quality.scope import changed_files, explicit_files, inventory, select, surface_for


class ScopeTests(unittest.TestCase):
    def test_surface_excludes_tests_swift_and_web(self):
        self.assertEqual(surface_for("apps/desktop/src/core/Foo.cpp"), "cpp")
        self.assertEqual(surface_for("apps/desktop/ui/src/App.tsx"), "desktop-ui")
        for path in ("apps/desktop/tests/Foo.cpp", "apps/desktop/ui/src/App.test.ts", "apps/studio-macos/S.swift", "apps/web/app/page.tsx"):
            self.assertIsNone(surface_for(path))

    def test_inventory_and_changed_include_staged_unstaged_untracked_and_rename(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.email", "a@b"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "A"], cwd=root, check=True)
            source = root / "apps/desktop/src/a.cpp"
            source.parent.mkdir(parents=True)
            source.write_text("a")
            subprocess.run(["git", "add", "."], cwd=root, check=True)
            subprocess.run(["git", "commit", "-qm", "base"], cwd=root, check=True)
            source.write_text("b")
            untracked = root / "apps/desktop/src/b.cpp"
            untracked.write_text("b")
            subprocess.run(["git", "add", str(source)], cwd=root, check=True)
            renamed = root / "apps/desktop/src/c.cpp"
            source.rename(renamed)
            result = changed_files(root, None)
            self.assertIn("apps/desktop/src/c.cpp", result)
            self.assertIn("apps/desktop/src/b.cpp", result)

    def test_explicit_selection_rejects_escape_and_missing_match(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "apps/desktop/src/a.cpp"
            path.parent.mkdir(parents=True)
            path.write_text("a")
            with patch("tools.quality.scope.inventory", return_value=["apps/desktop/src/a.cpp"]):
                self.assertEqual(explicit_files(root, ["apps/desktop/src/a.cpp"]), ["apps/desktop/src/a.cpp"])
                with self.assertRaises(ValueError):
                    explicit_files(root, ["../outside.cpp"])
                with self.assertRaises(ValueError):
                    explicit_files(root, ["missing.cpp"])

    def test_select_surface_filters_and_does_not_pool_surfaces(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch("tools.quality.scope.inventory", return_value=["apps/desktop/src/a.cpp", "apps/desktop/ui/src/a.ts"]):
                self.assertEqual(select(root, [], None, True, "cpp"), ["apps/desktop/src/a.cpp"])
                self.assertEqual(select(root, [], None, True, "desktop-ui"), ["apps/desktop/ui/src/a.ts"])


if __name__ == "__main__":
    unittest.main()
