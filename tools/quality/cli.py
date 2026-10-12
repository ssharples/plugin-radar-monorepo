"""Tests -> CRAP -> per-file mutation gates for the C++ plugin and its UI."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

from . import crap, mutation, native, scope
from .coverage_data import read_reports

ROOT = Path(__file__).resolve().parents[2]


def arguments(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["crap", "mutate", "gate", "scope", "mutation-config", "test"])
    parser.add_argument("--files", nargs="+", default=[], help="Exact repository paths or quoted globs")
    parser.add_argument("--files-json", type=Path, help="JSON array of repository paths, useful in CI")
    parser.add_argument("--base", help="Git ref; compare merge-base with HEAD plus local changes")
    parser.add_argument("--all", action="store_true", help="Audit all plugin production functions (CRAP only)")
    parser.add_argument("--surface", choices=list(scope.SURFACES))
    parser.add_argument("--report-dir", type=Path, default=ROOT / "reports/quality")
    parser.add_argument("--test-filter", help="Optional explicit test-name filter; recorded in the report")
    args = parser.parse_args(argv)
    if args.all and args.command in {"mutate", "gate"}:
        parser.error("Mutation requires changed modules or --files; use crap --all for an inventory")
    if args.files_json:
        values = json.loads(args.files_json.read_text())
        if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
            parser.error("--files-json must contain an array of path strings")
        args.files.extend(values)
    return args


def save(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def fingerprints(root: Path, files: list[str]) -> dict:
    return {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in files}


def groups(files: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for path in files:
        result.setdefault(scope.surface_for(path), []).append(path)
    return result


def run_js(mode: str, files: list[str], output: Path, test_filter: str | None) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    selection = output / "selected-files.json"
    selection.write_text(json.dumps(files))
    command = ["node", str(ROOT / "tools/quality/js/run.mjs"), mode, "--surface", "desktop-ui",
               "--files-json", str(selection), "--output-dir", str(output)]
    if test_filter:
        command.extend(["--test-filter", test_filter])
    result_path = output / "adapter-result.json"
    result_path.unlink(missing_ok=True)
    with (output / "adapter.log").open("w") as log:
        completed = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    if not result_path.is_file():
        return {"exit_status": completed.returncode or 2, "status": "error", "reports": [], "commands": [command],
                "error": f"JS adapter produced no result; inspect {output / 'adapter.log'}"}
    result = json.loads(result_path.read_text())
    result["exit_status"] = completed.returncode or result.get("exit_status", 2)
    result["invocation"] = command
    return result


def coverage_for(surface: str, files: list[str], output: Path, test_filter: str | None) -> dict:
    print(f"Running {surface} tests and refreshing coverage for {len(files)} production modules...", flush=True)
    if surface == "cpp":
        return native.run_coverage(surface, files, ROOT, output, test_filter)
    return run_js("coverage", files, output, test_filter)


def run_crap(files: list[str], args: argparse.Namespace) -> tuple[dict, bool]:
    before = fingerprints(ROOT, files)
    providers = {}
    reports = []
    for surface, selected in groups(files).items():
        result = coverage_for(surface, selected, args.report_dir / "coverage" / surface, args.test_filter)
        providers[surface] = result
        reports.extend(Path(path) for path in result.get("reports", []) if Path(path).is_file())
    changed_during_run = before != fingerprints(ROOT, files)
    coverage = read_reports(reports, ROOT)
    analysis = crap.analyze_files(ROOT, files, coverage)
    tests_passed = all(provider.get("exit_status") == 0 and provider.get("status") in {"ok", "passed"}
                       and provider.get("reports") for provider in providers.values())
    passed = tests_passed and not changed_during_run and crap.passed(analysis)
    report = {"schema_version": 1, "scope": files, "source_sha256": before, "created_unix": time.time(),
              "test_filter": args.test_filter, "coverage_runs": providers, "tests_passed": tests_passed,
              "source_changed_during_run": changed_during_run, **analysis,
              "status": "pass" if passed else "fail"}
    save(args.report_dir / "crap.json", report)
    (args.report_dir / "crap.txt").write_text(crap.table(report) + "\n")
    print(crap.table(report))
    for provider in providers.values():
        if provider.get("error"):
            print(provider["error"], file=sys.stderr)
    return report, passed


def mutation_for(surface: str, files: list[str], output: Path, args: argparse.Namespace) -> dict:
    print(f"Mutation gate: {surface}, {len(files)} modules, at most 3 workers...", flush=True)
    if surface == "cpp":
        return native.run_mutation(surface, files, ROOT, output, args.test_filter)
    return run_js("mutate", files, output, args.test_filter)


def prepare_mutation_reports(provider: dict, root: Path) -> list[Path]:
    reports = []
    for name in provider.get("reports", []):
        path = Path(name)
        if not path.is_file() or path.suffix != ".json":
            continue
        document = json.loads(path.read_text())
        if "files" not in document:
            raise ValueError(f"Expected mutation report, received another artifact: {path}")
        document.setdefault("projectRoot", provider.get("projectRoot", str(root)))
        normalized_path = path.with_name(path.stem + ".with-root.json")
        save(normalized_path, document)
        reports.append(normalized_path)
    return reports


def run_mutation(files: list[str], args: argparse.Namespace, crap_report: dict) -> bool:
    providers = {}
    reports = []
    for surface, selected in groups(files).items():
        provider = mutation_for(surface, selected, args.report_dir / "mutation" / surface, args)
        providers[surface] = provider
        reports.extend(prepare_mutation_reports(provider, ROOT))
    equivalents = mutation.reviewed_equivalents(ROOT / "tools/quality/equivalents.json")
    report = mutation.analyze_reports(reports, ROOT, files, equivalents)
    source_unchanged = crap_report["source_sha256"] == fingerprints(ROOT, files)
    tools_passed = all(provider.get("exit_status") == 0 and provider.get("executed", True)
                       for provider in providers.values())
    passed = tools_passed and source_unchanged and report["status"] == "pass"
    report.update({"schema_version": 1, "runs": providers, "source_unchanged": source_unchanged,
                   "status": "pass" if passed else "fail"})
    save(args.report_dir / "mutation.json", report)
    print_mutation(report)
    return passed


def print_mutation(report: dict) -> None:
    for module in report["modules"]:
        score = f"{module['score']:.2f}%" if module["score"] is not None else "N/A"
        print(f"{module['path']}: {score}; killed={module['killed']} survived={module['survived']} "
              f"invalid={module['invalid']} equivalent={module['equivalent']} unresolved={module['unresolved']} "
              f"trivial survivors={module['trivial_survivors']}; {module['status']}")
        for mutant in module["mutants"]:
            if mutant["outcome"] in {"survived", "unresolved"}:
                line = mutant["location"]["start"]["line"]
                print(f"  {mutant['id']} line {line} {mutant['operator']}: {mutant['replacement']!r}")
    for provider in report.get("runs", {}).values():
        if provider.get("error"):
            print(provider["error"], file=sys.stderr)


def configure_native(files: list[str], args: argparse.Namespace) -> int:
    selected = [path for path in files if scope.surface_for(path) == "cpp"]
    result = native.run_mutation("cpp", selected, ROOT, args.report_dir / "mutation-config", configure_only=True)
    save(args.report_dir / "mutation-config.json", result)
    if result.get("status") == "configured":
        print("Native mutation configuration prepared. No mutation score was measured and no gate passed.")
    else:
        print("Native mutation configuration failed; select C++ production modules.", file=sys.stderr)
    print(json.dumps(result, indent=2))
    return result.get("exit_status", 2)


def main(argv: list[str] | None = None) -> int:
    args = arguments(argv)
    if args.command == "test":
        result = subprocess.call([sys.executable, "-m", "unittest", "discover", "-s", "tools/quality/tests"], cwd=ROOT)
        if result:
            return result
        return subprocess.call(["node", str(ROOT / "tools/quality/js/node_modules/vitest/vitest.mjs"),
                                "run", "run.test.mjs"], cwd=ROOT / "tools/quality/js")
    args.report_dir = args.report_dir.resolve()
    if args.command in {"crap", "mutate", "gate"}:
        args.report_dir.mkdir(parents=True, exist_ok=True)
        for name in ("crap.json", "crap.txt", "mutation.json"):
            (args.report_dir / name).unlink(missing_ok=True)
    files = [] if args.files_json and not args.files else scope.select(ROOT, args.files, args.base, args.all, args.surface)
    if args.command == "scope":
        print(json.dumps({"files": files, "surfaces": list(groups(files))}))
        return 0
    args.report_dir.mkdir(parents=True, exist_ok=True)
    if args.command == "mutation-config":
        return configure_native(files, args)
    if not files:
        save(args.report_dir / "scope.json", {"status": "no_production_changes", "files": []})
        print("No production modules selected in the C++ plugin or TypeScript frontend.")
        return 0
    report, passed = run_crap(files, args)
    if not passed:
        print("CRAP gate failed. Mutation has not run. Fix failing tests, scores above 6, or N/A mappings.", file=sys.stderr)
        return 1
    if args.command == "crap":
        return 0
    return 0 if run_mutation(files, args, report) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"Quality gate could not complete: {error}", file=sys.stderr)
        sys.exit(2)
