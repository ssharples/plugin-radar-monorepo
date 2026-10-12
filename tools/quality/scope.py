"""Select the plugin's changed production modules without losing local work."""

from __future__ import annotations

import fnmatch
import re
import subprocess
from pathlib import Path

SURFACES = {
    "cpp": ("apps/desktop/src/", {".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp"}),
    "desktop-ui": ("apps/desktop/ui/src/", {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}),
}
TEST_PARTS = {"test", "tests", "__tests__", "__mocks__", "mocks", "fixtures", "__fixtures__", "generated", "_generated", "vendor", "third_party", "third-party"}
TEST_SUFFIXES = (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", ".test.js", ".spec.js", ".d.ts")


def git(root: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    if result.returncode:
        raise ValueError(result.stderr.strip() or "git could not determine the changed surface")
    return result.stdout


def surface_for(path: str) -> str | None:
    source = Path(path)
    if any(part.lower() in TEST_PARTS for part in source.parts):
        return None
    if path.endswith(TEST_SUFFIXES) or re.search(r"\.(?:test|spec|mock|fixture|generated)\.", source.name):
        return None
    for name, (prefix, extensions) in SURFACES.items():
        if path.startswith(prefix) and source.suffix in extensions:
            return name
    return None


def inventory(root: Path) -> list[str]:
    paths = git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0")
    return sorted({path for path in paths if surface_for(path) and (root / path).is_file()})


def changed_files(root: Path, base: str | None) -> list[str]:
    revision = git(root, "merge-base", base, "HEAD").strip() if base else "HEAD"
    changed = git(root, "diff", "--name-only", "--diff-filter=ACMRT", "-z", revision, "--").split("\0")
    untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z").split("\0")
    return sorted({p for p in changed + untracked if surface_for(p) and (root / p).is_file()})


def explicit_files(root: Path, patterns: list[str]) -> list[str]:
    available = inventory(root)
    selected: set[str] = set()
    for pattern in patterns:
        relative = normalize_pattern(root, pattern)
        matches = [p for p in available if fnmatch.fnmatchcase(p, relative)]
        if not matches:
            raise ValueError(f"No plugin production module matches {pattern!r}; tests and generated files cannot be selected")
        selected.update(matches)
    return sorted(selected)


def normalize_pattern(root: Path, pattern: str) -> str:
    candidate = Path(pattern)
    if candidate.is_absolute():
        try:
            return str(candidate.relative_to(root))
        except ValueError as error:
            raise ValueError("Selected files must be inside this repository") from error
    if ".." in candidate.parts:
        raise ValueError("Selected paths cannot escape the repository")
    return candidate.as_posix().removeprefix("./")


def select(root: Path, files: list[str], base: str | None, all_files: bool, surface: str | None) -> list[str]:
    if files:
        selected = explicit_files(root, files)
    elif all_files:
        selected = inventory(root)
    else:
        selected = changed_files(root, base)
    return [p for p in selected if surface is None or surface_for(p) == surface]
