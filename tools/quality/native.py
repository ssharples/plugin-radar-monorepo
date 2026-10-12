"""Isolated LLVM coverage builds and opt-in, file-scoped Mull builds.

Nothing installs LLVM/Mull or copies a plugin into the user's host directories.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from .scope import surface_for

TEST_TARGETS = ("PluginChainManager_Tests", "PluginChainManager_WrapperTests")


def _run(args, *, cwd, env=None):
    return subprocess.run(list(args), cwd=cwd, env=env, text=True, capture_output=True, check=False)


def _tool(variable, name, *, root):
    if value := os.environ.get(variable):
        found = shutil.which(value)
        if found:
            return Path(found).absolute()
        raise FileNotFoundError(f"{variable} is not an executable: {value}")
    if sys.platform == "darwin" and name in {"clang", "clang++", "llvm-cov", "llvm-profdata"}:
        result = _run(["xcrun", "--find", name], cwd=root)
        if result.returncode == 0:
            return Path(result.stdout.strip()).absolute()
    if found := shutil.which(name):
        return Path(found).absolute()
    raise FileNotFoundError(f"Missing {name}; set {variable}. No dependencies were installed.")


def _llvm(root):
    result = {key: _tool(key, name, root=root) for key, name in
              (("CLANG", "clang"), ("CLANGXX", "clang++"), ("LLVM_COV", "llvm-cov"), ("LLVM_PROFDATA", "llvm-profdata"))}
    versions = {}
    for key, path in result.items():
        probe = _run([str(path), "--version"], cwd=root)
        version = re.search(r"(?:clang|LLVM) version\s+(\d+)", probe.stdout + probe.stderr, re.I)
        if probe.returncode or not version:
            raise ValueError(f"Cannot determine LLVM version for {key}: {path}")
        versions[key] = int(version[1])
    if len(set(versions.values())) != 1 or len({p.parent for p in result.values()}) != 1:
        raise ValueError(f"Use compiler, llvm-cov and llvm-profdata from one LLVM toolchain: {versions}")
    return result, versions["CLANGXX"]


def _selected(files, root):
    if not files:
        raise ValueError("Select at least one C++ plugin production module")
    paths = []
    for name in files:
        path = (root / name).resolve()
        relative = path.relative_to(root).as_posix()
        if surface_for(relative) != "cpp" or not path.is_file():
            raise ValueError(f"Not a C++ plugin production source: {name}")
        paths.append(path)
    return paths


def _result(output, commands, status="ok", code=0, reports=None, error=None, executed=True):
    result = dict(surface="cpp", projectRoot=str(Path(__file__).resolve().parents[2]), status=status,
                  exit_status=code, reports=reports or [], commands=commands, executed=executed)
    if error:
        result["error"] = error
    (output / "adapter-result.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def _execute(command, root, output, commands, env=None):
    commands.append(list(command))
    result = _run(command, cwd=root, env=env)
    log = output / f"command-{len(commands):02}.log"
    log.write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}); inspect {log}\n{(result.stdout + result.stderr)[-2000:]}")
    return result


def _build_commands(root, output, compiler, flags):
    build = output / "build"
    cmake = str(_tool("CMAKE", "cmake", root=root))
    configure = [cmake, "-S", str(root / "apps/desktop"), "-B", str(build),
                 "-DCMAKE_BUILD_TYPE=Debug", "-DPROCHAIN_COPY_PLUGIN_AFTER_BUILD=OFF",
                 f"-DCMAKE_C_COMPILER={compiler['CLANG']}", f"-DCMAKE_CXX_COMPILER={compiler['CLANGXX']}",
                 f"-DCMAKE_C_FLAGS={flags}", f"-DCMAKE_CXX_FLAGS={flags}",
                 "-DCMAKE_EXE_LINKER_FLAGS=-fprofile-instr-generate"]
    # Reuse downloaded source only; never reuse an unrelated compiled binary.
    for dependency in ("juce", "catch2"):
        cached = root / "apps/desktop/build/_deps" / f"{dependency}-src"
        if (cached / "CMakeLists.txt").is_file():
            configure.append(f"-DFETCHCONTENT_SOURCE_DIR_{dependency.upper()}={cached}")
    return [configure, [cmake, "--build", str(build), "--parallel", "3", "--target", *TEST_TARGETS]]


def run_coverage(surface, files, root, output_dir, test_filter=None):
    root, output = Path(root).resolve(), Path(output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)
    commands = []
    try:
        if surface != "cpp":
            raise ValueError("Native adapter supports only cpp")
        selected = _selected(files, root)
        compiler, _ = _llvm(root)
        profiles = output / "profiles"
        profiles.mkdir(exist_ok=True)
        for stale in [*profiles.glob("*.profraw"), *output.glob("*.coverage.json"), output / "coverage.profdata"]:
            stale.unlink(missing_ok=True)
        flags = "-O0 -g -fprofile-instr-generate -fcoverage-mapping"
        for command in _build_commands(root, output, compiler, flags):
            _execute(command, root, output, commands)
        binaries = [output / "build" / target for target in TEST_TARGETS]
        for index, binary in enumerate(binaries):
            if not binary.is_file():
                raise FileNotFoundError(f"Built test binary missing: {binary}")
            _execute([str(binary), *([test_filter] if test_filter else [])], root, output, commands,
                     {**os.environ, "LLVM_PROFILE_FILE": str(profiles / f"{index}-%p.profraw")})
        raw = sorted(profiles.glob("*.profraw"))
        if not raw:
            raise ValueError("Tests produced no fresh LLVM profiles")
        profdata = output / "coverage.profdata"
        _execute([str(compiler["LLVM_PROFDATA"]), "merge", "-sparse", *map(str, raw), "-o", str(profdata)], root, output, commands)
        reports = []
        for binary in binaries:
            exported = _execute([str(compiler["LLVM_COV"]), "export", str(binary), "--instr-profile", str(profdata),
                                 "--sources", *map(str, selected)], root, output, commands)
            document = json.loads(exported.stdout)
            if document.get("type") != "llvm.coverage.json.export":
                raise ValueError("LLVM export did not return a coverage report")
            report = output / f"{binary.name}.coverage.json"
            report.write_text(exported.stdout)
            reports.append(str(report))
        return _result(output, commands, reports=reports)
    except (OSError, ValueError, RuntimeError) as error:
        return _result(output, commands, "error", 2, error=str(error))


def _mutation_plan(root, output, selected, test_filter):
    config = output / "mull.yml"
    patterns = ["^" + re.escape(str(path)) + "$" for path in selected]
    config.write_text("mutators:\n  - cxx_all\nincludePaths:\n" +
                      "".join("  - " + json.dumps(pattern) + "\n" for pattern in patterns))
    build = output / "build"
    # Placeholders are explicit in the reviewable plan; execution resolves them.
    compiler = {"CLANG": "${CLANG}", "CLANGXX": "${CLANGXX}"}
    flags = "-O0 -g -grecord-command-line -fprofile-instr-generate -fcoverage-mapping -fpass-plugin=${MULL_IR_FRONTEND}"
    commands = _build_commands(root, output, compiler, flags)
    for target in TEST_TARGETS:
        commands.append(["${MULL_RUNNER}", "--workers", "3", "--timeout", "30000", "--include-not-covered",
                         "--reporters", "Elements", "--report-dir", str(output / target),
                         "--report-name", "mutation", "--allow-surviving", "--mutation-score-threshold", "0",
                         str(build / target), *([test_filter] if test_filter else [])])
    plan = dict(environment={"MULL_CONFIG": str(config)}, required_environment=["CLANG", "CLANGXX", "LLVM_COV",
                "LLVM_PROFDATA", "MULL_RUNNER", "MULL_IR_FRONTEND", "MULL_LLVM_MAJOR"], commands=commands,
                note="Mull 0.34; all LLVM tools and the Mull frontend must match MULL_LLVM_MAJOR. The Python policy applies the 80% per-module score after combining both test targets.")
    (output / "plan.json").write_text(json.dumps(plan, indent=2) + "\n")
    return config, plan


def run_mutation(surface, files, root, output_dir, test_filter=None, configure_only=False):
    root, output = Path(root).resolve(), Path(output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)
    commands = []
    try:
        if surface != "cpp":
            raise ValueError("Native adapter supports only cpp")
        selected = _selected(files, root)
        config, plan = _mutation_plan(root, output, selected, test_filter)
        if configure_only:
            return _result(output, plan["commands"], "configured", reports=[str(config), str(output / "plan.json")], executed=False)
        compiler, version = _llvm(root)
        if str(version) != os.environ.get("MULL_LLVM_MAJOR"):
            raise ValueError("Set MULL_LLVM_MAJOR to the installed Mull build's LLVM major and use that same LLVM toolchain")
        frontend = Path(os.environ.get("MULL_IR_FRONTEND", ""))
        if not frontend.is_file():
            raise FileNotFoundError("Set MULL_IR_FRONTEND to an installed matching Mull LLVM plugin; configure only does not install it")
        runner = _tool("MULL_RUNNER", "mull-runner", root=root)
        env = {**os.environ, "MULL_CONFIG": str(config)}
        # Mull instrumentation depends on the selected includePaths; rebuilding
        # avoids reusing objects compiled for a previous file selection.
        shutil.rmtree(output / "build", ignore_errors=True)
        flags = f"-O0 -g -grecord-command-line -fprofile-instr-generate -fcoverage-mapping -fpass-plugin={frontend.resolve()}"
        for command in _build_commands(root, output, compiler, flags):
            _execute(command, root, output, commands, env)
        reports = []
        for target, template in zip(TEST_TARGETS, plan["commands"][2:]):
            report_dir = output / target
            report_dir.mkdir(exist_ok=True)
            for stale in report_dir.glob("*.json"):
                stale.unlink()
            command = [str(runner), *template[1:]]
            _execute(command, root, output, commands, env)
            found = []
            for path in report_dir.glob("*.json"):
                if isinstance(json.loads(path.read_text()).get("files"), dict):
                    found.append(str(path))
            if not found:
                raise ValueError(f"Mull produced no Elements JSON for {target}; inspect command logs")
            reports.extend(found)
        return _result(output, commands, reports=reports)
    except (OSError, ValueError, RuntimeError) as error:
        return _result(output, commands, "error", 2, error=str(error), executed=bool(commands))
