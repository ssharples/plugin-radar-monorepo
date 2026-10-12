"""Apply the project's mutation policy independently of vendor score formulas."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .coverage_data import canonical

MIN_SCORE = 80.0
TRIVIAL_OPERATORS = {
    "ArithmeticOperator", "EqualityOperator", "LogicalOperator", "BooleanLiteral",
    "ConditionalExpression", "BlockStatement", "StatementDeletion", "UnaryOperator",
    "UpdateOperator", "ReturnValue", "NumericLiteral", "ArrayDeclaration", "ObjectLiteral",
    "AssignmentOperator", "OptionalChaining",
}


def identity(path: str, source: str, mutant: dict) -> str:
    content = {"path": path, "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
               "location": mutant["location"], "replacement": mutant.get("replacement", ""),
               "operator": mutant.get("mutatorName", "")}
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()


def reviewed_equivalents(path: Path | None) -> dict:
    if path is None or not path.is_file():
        return {}
    document = json.loads(path.read_text())
    records = document.get("equivalents", [])
    result = {}
    for record in records:
        if not record.get("reason") or len(record.get("id", "")) != 64:
            raise ValueError("An equivalent needs an exact mutant SHA-256 and a behavioral proof/reason")
        if record["id"] in result:
            raise ValueError("Duplicate equivalent mutant identity")
        result[record["id"]] = record["reason"]
    return result


def trivial(mutant: dict, source: str) -> bool:
    name = mutant.get("mutatorName", "")
    if name in TRIVIAL_OPERATORS or name.startswith("cxx_"):
        return True
    start = mutant["location"]["start"]["line"]
    end = mutant["location"]["end"]["line"]
    changed_context = "\n".join(source.splitlines()[max(0, start - 2):end])
    return name == "StringLiteral" and "return" in changed_context


def normalize(mutant: dict, path: str, source: str, equivalents: dict) -> dict:
    key = identity(path, source, mutant)
    status = mutant.get("status", "Pending")
    reason = equivalents.get(key)
    if status == "Killed":
        outcome = "killed"
    elif reason and status in {"Survived", "NoCoverage"}:
        outcome = "equivalent"
    elif status in {"Survived", "NoCoverage"}:
        outcome = "survived"
    elif status == "CompileError":
        outcome = "invalid"
    else:
        outcome = "unresolved"
    return {"id": key, "vendor_id": mutant.get("id"), "operator": mutant.get("mutatorName"),
            "location": mutant["location"], "replacement": mutant.get("replacement", ""),
            "vendor_status": status, "outcome": outcome, "trivial": trivial(mutant, source),
            "reason": reason or mutant.get("statusReason")}


def module_report(path: str, mutants: list[dict]) -> dict:
    counts = {name: sum(m["outcome"] == name for m in mutants)
              for name in ("killed", "survived", "invalid", "equivalent", "unresolved")}
    eligible = counts["killed"] + counts["survived"]
    score = 100.0 * counts["killed"] / eligible if eligible else None
    trivial_survivors = sum(m["outcome"] == "survived" and m["trivial"] for m in mutants)
    passed = score is not None and score >= MIN_SCORE and not trivial_survivors and not counts["unresolved"]
    return {"path": path, **counts, "eligible": eligible, "score": score,
            "trivial_survivors": trivial_survivors, "status": "pass" if passed else "fail",
            "mutants": mutants}


def analyze_reports(paths: list[Path], root: Path, selected: list[str], equivalents: dict) -> dict:
    by_file: dict[str, dict[str, dict]] = {path: {} for path in selected}
    for report in paths:
        read_elements(json.loads(report.read_text()), root, by_file, equivalents)
    modules = [module_report(path, list(mutants.values())) for path, mutants in by_file.items()]
    return {"threshold": MIN_SCORE, "formula": "killed / (killed + survived)", "modules": modules,
            "status": "pass" if all(module["status"] == "pass" for module in modules) else "fail"}


def read_elements(document: dict, root: Path, by_file: dict, equivalents: dict) -> None:
    if not isinstance(document.get("files"), dict):
        raise ValueError("Mutation tool did not produce a valid Elements/Stryker JSON report")
    project_root = Path(document.get("projectRoot", str(root)))
    for name, source_report in document["files"].items():
        source_path = Path(name) if Path(name).is_absolute() else project_root / name
        path = canonical(str(source_path), root)
        if path not in by_file:
            continue
        source = (root / path).read_text()
        if source_report.get("source") != source:
            raise ValueError(f"Mutation report source differs from current module: {path}")
        for mutant in source_report.get("mutants", []):
            record = normalize(mutant, path, source, equivalents)
            merge_result(by_file[path], record)


def merge_result(records: dict, incoming: dict) -> None:
    # A failing test in either binary kills the mutant. Otherwise preserve any
    # unresolved run; a later passing suite must not hide a timeout or crash.
    rank = {"invalid": 0, "survived": 1, "unresolved": 3, "equivalent": 2, "killed": 4}
    previous = records.get(incoming["id"])
    if previous is None or rank[incoming["outcome"]] > rank[previous["outcome"]]:
        records[incoming["id"]] = incoming
