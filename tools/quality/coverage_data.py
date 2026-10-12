"""Read original-source Istanbul and LLVM coverage without inventing missing hits."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def point(location: dict[str, int]) -> tuple[int, int]:
    if not isinstance(location.get("line"), int) or not isinstance(location.get("column"), int):
        raise ValueError("Coverage has no trustworthy source start position")
    return location["line"], location["column"]


def optional_end(location: dict) -> tuple[int, int] | None:
    # Istanbul source maps can omit end columns. Ownership uses the exact start;
    # retain the missing endpoint instead of inventing a range or dropping hits.
    if not isinstance(location.get("line"), int) or not isinstance(location.get("column"), int):
        return None
    return point(location)


def span(record: dict[str, Any]) -> tuple[tuple[int, int], tuple[int, int]]:
    return (record["start_line"], record["start_column"]), (record["end_line"], record["end_column"])


def owner(position: tuple[int, int], functions: list[dict]) -> dict | None:
    containing = [function for function in functions if span(function)[0] <= position < span(function)[1]]
    return min(containing, key=lambda function: (span(function)[1][0] - span(function)[0][0], span(function)[1][1] - span(function)[0][1]), default=None)


def canonical(path: str, root: Path) -> str | None:
    file = Path(path)
    try:
        return (file if file.is_absolute() else root / file).resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return None


def file_record() -> dict:
    return {"entries": [], "branches": [], "segments": [], "statements": [], "formats": set()}


def interval(start: tuple[int, int], end: tuple[int, int], hits: int) -> dict:
    if hits < 0 or (end is not None and start > end):
        raise ValueError("Coverage contains an invalid interval or execution count")
    return {"start": start, "end": end, "hits": hits}


def read_reports(paths: list[Path], root: Path) -> dict[str, dict]:
    files: dict[str, dict] = {}
    for path in paths:
        document = json.loads(path.read_text())
        if not isinstance(document, dict):
            raise ValueError("Coverage report must be a JSON object")
        if document.get("type") == "llvm.coverage.json.export":
            read_llvm(document, root, files)
        else:
            read_istanbul(document, root, files)
    return files


def read_istanbul(document: dict, root: Path, files: dict) -> None:
    for name, coverage in document.items():
        if not isinstance(coverage, dict) or "fnMap" not in coverage:
            raise ValueError("Expected original-source Istanbul coverage-final.json or LLVM export JSON")
        relative = canonical(coverage.get("path", name), root)
        if relative is None:
            continue
        target = files.setdefault(relative, file_record())
        target["formats"].add("istanbul")
        read_istanbul_functions(coverage, target)
        read_istanbul_branches(coverage, target)
        for identifier, statement in coverage.get("statementMap", {}).items():
            target["statements"].append(interval(point(statement["start"]), optional_end(statement["end"]), coverage["s"][identifier]))


def read_istanbul_functions(coverage: dict, target: dict) -> None:
    for identifier, function in coverage["fnMap"].items():
        location = function["loc"]
        entry = interval(point(location["start"]), optional_end(location["end"]), coverage["f"][identifier])
        if function.get("decl", {}).get("start"):
            entry["anchor"] = point(function["decl"]["start"])
        target["entries"].append(entry)


def read_istanbul_branches(coverage: dict, target: dict) -> None:
    for identifier, branch in coverage.get("branchMap", {}).items():
        location = branch.get("loc")
        if not location or not location.get("start") or not location.get("end"):
            raise ValueError("Istanbul branch has no trustworthy original-source range")
        for index, count in enumerate(coverage["b"][identifier]):
            entry = interval(point(location["start"]), optional_end(location["end"]), count)
            entry["arm"] = index
            target["branches"].append(entry)


def read_llvm(document: dict, root: Path, files: dict) -> None:
    if str(document.get("version", "")).split(".")[0] not in {"2", "3"}:
        raise ValueError("Unsupported LLVM coverage JSON version; update the adapter before trusting it")
    for unit in document["data"]:
        for source in unit.get("files", []):
            read_llvm_file(source, root, files)
        for function in unit.get("functions", []):
            read_llvm_function(function, root, files)


def read_llvm_file(source: dict, root: Path, files: dict) -> None:
    relative = canonical(source["filename"], root)
    if relative is None:
        return
    target = files.setdefault(relative, file_record())
    target["formats"].add("llvm")
    segments = source.get("segments", [])
    for first, last in zip(segments, segments[1:]):
        if first[3] and not (len(first) > 5 and first[5]):
            target["segments"].append(interval((first[0], first[1] - 1), (last[0], last[1] - 1), first[2]))
    for branch in source.get("branches", []):
        for arm, count in enumerate(branch[4:6]):
            item = interval((branch[0], branch[1] - 1), (branch[2], branch[3] - 1), count)
            item["arm"] = arm
            target["branches"].append(item)


def read_llvm_function(function: dict, root: Path, files: dict) -> None:
    regions = [region for region in function.get("regions", []) if len(region) >= 8 and region[7] == 0]
    if not regions:
        return
    # The initial code region is the function body. Later regions may be branches,
    # macro expansions or nested code and cannot stand in for another function.
    first = regions[0]
    relative = canonical(function["filenames"][first[5]], root)
    if relative is None:
        return
    target = files.setdefault(relative, file_record())
    target["formats"].add("llvm")
    target["entries"].append(interval((first[0], first[1] - 1), (first[2], first[3] - 1), function["count"]))


def unique_hits(items: list[dict], with_arm: bool = False) -> dict[tuple, int]:
    result: dict[tuple, int] = {}
    for item in items:
        key = (item["start"], item["end"], item.get("arm") if with_arm else None)
        result[key] = max(result.get(key, 0), item["hits"])
    return result


def function_coverage(function: dict, functions: list[dict], data: dict | None) -> dict:
    if data is None:
        return missing("source file absent from the coverage report")
    entries = [entry for entry in data["entries"] if owner(entry.get("anchor", entry["start"]), functions) is function]
    if not entries:
        return missing("no instrumented function entry maps to this source function")
    branches = [entry for entry in data["branches"] if owner(entry["start"], functions) is function]
    if branches:
        hits = unique_hits(branches, with_arm=True).values()
        covered = sum(hit > 0 for hit in hits) if any(entry["hits"] > 0 for entry in entries) else 0
        return measured(covered, len(hits), "branch")
    lines = owned_lines(function, functions, data)
    if not lines:
        return missing("function entry found, but no executable source lines map to it")
    if not any(entry["hits"] > 0 for entry in entries):
        return measured(0, len(lines), "line")
    return measured(sum(hit > 0 for hit in lines.values()), len(lines), "line")


def owned_lines(function: dict, functions: list[dict], data: dict) -> dict[int, int]:
    lines: dict[int, int] = {}
    for item in data["statements"]:
        if owner(item["start"], functions) is function:
            line = item["start"][0]
            lines[line] = max(lines.get(line, 0), item["hits"])
    for item in data["segments"]:
        add_segment_lines(lines, item, function, functions)
    return lines


def add_segment_lines(lines: dict, item: dict, function: dict, functions: list[dict]) -> None:
    first, last = span(function)
    start, end = max(first, item["start"]), min(last, item["end"])
    if start >= end:
        return
    final_line = end[0] if end[1] > 0 else end[0] - 1
    for line in range(start[0], final_line + 1):
        location = (line, start[1] if line == start[0] else 0)
        if owner(location, functions) is function:
            lines[line] = max(lines.get(line, 0), item["hits"])


def measured(covered: int, total: int, basis: str) -> dict:
    return {"coverage": covered / total, "basis": basis, "covered": covered, "total": total, "reason": None}


def missing(reason: str) -> dict:
    return {"coverage": None, "basis": None, "covered": None, "total": None, "reason": reason}
