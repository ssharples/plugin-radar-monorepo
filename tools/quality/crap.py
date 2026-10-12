"""Calculate function-level CRAP and retain unmapped functions as N/A."""

from __future__ import annotations

from pathlib import Path

from .coverage_data import function_coverage
from .crap_syntax import analyze_source

MAX_CRAP = 6.0


def score(complexity: int, coverage: float | None) -> float | None:
    if complexity < 1:
        raise ValueError("Function complexity must be at least one")
    if coverage is None:
        return None
    if not 0.0 <= coverage <= 1.0:
        raise ValueError("Function coverage must be between zero and one")
    return complexity**2 * (1.0 - coverage)**3 + complexity


def analyze_files(root: Path, files: list[str], coverage: dict[str, dict]) -> dict:
    results = []
    issues = []
    for path in files:
        parsed = analyze_source(path, (root / path).read_text())
        issues.extend({"path": path, "reason": issue} for issue in parsed["issues"])
        for function in parsed["functions"]:
            measured = function_coverage(function, parsed["functions"], coverage.get(path))
            if parsed["issues"]:
                measured = {"coverage": None, "basis": None, "covered": None, "total": None,
                            "reason": "source contains syntax the parser cannot reliably analyze"}
            results.append({"path": path, **function, **measured,
                            "crap": score(function["complexity"], measured["coverage"])})
    results.sort(key=sort_key)
    return {"threshold": MAX_CRAP, "functions": results, "issues": issues,
            "above_threshold": sum(row["crap"] is not None and row["crap"] > MAX_CRAP for row in results),
            "not_available": sum(row["crap"] is None for row in results)}


def sort_key(function: dict) -> tuple:
    value = function["crap"]
    return (value is None, -value if value is not None else 0, function["path"], function["start_line"])


def passed(report: dict) -> bool:
    return not (report["above_threshold"] or report["not_available"] or report["issues"])


def table(report: dict) -> str:
    lines = ["CRAP      CC  Coverage  Basis   Function"]
    for row in report["functions"]:
        metric = f"{row['crap']:.3f}" if row["crap"] is not None else "N/A"
        coverage = f"{row['coverage']:.1%}" if row["coverage"] is not None else "N/A"
        location = f"{row['path']}:{row['start_line']}:{row['start_column'] + 1} {row['name']}"
        lines.append(f"{metric:>8}  {row['complexity']:>2}  {coverage:>8}  {row['basis'] or '-':<6}  {location}")
        if row["reason"]:
            lines.append(f"          N/A reason: {row['reason']}")
    lines.append(f"{len(report['functions'])} functions; {report['above_threshold']} above {MAX_CRAP:g}; "
                 f"{report['not_available']} N/A; {len(report['issues'])} parse issues")
    return "\n".join(lines)
