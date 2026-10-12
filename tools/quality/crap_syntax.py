"""AST-only syntax and cyclomatic-complexity checks for frontend and C++."""
from __future__ import annotations

import importlib
import re
from pathlib import Path
from typing import Any, Iterable

_EXTENSIONS = {".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
               ".ts": "typescript", ".tsx": "tsx", ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp",
               ".h": "cpp", ".hh": "cpp", ".hpp": "cpp", ".c": "cpp"}
_JUCE_MACROS = (b"JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR", b"START_JUCE_APPLICATION",
                b"forEachXmlChildElementWithTagName")


def _point(node: Any, end: bool = False) -> tuple[int, int]:
    point = node.end_point if end else node.start_point
    return point[0] + 1, point[1]


def _record(name: str, node: Any, body: Any, complexity: int, language: str, source: bytes) -> dict[str, Any]:
    sl, sc = _point(node); el, ec = _point(node, True)
    bs, bc = _point(body) if body is not None else (el, ec)
    if language in {"javascript", "typescript", "tsx"}:
        def utf16(line: int, column: int) -> int:
            line_bytes = source.splitlines(keepends=True)[line - 1][:column]
            return len(line_bytes.decode("utf-8", errors="replace").encode("utf-16-le")) // 2
        sc, ec, bc = utf16(sl, sc), utf16(el, ec), utf16(bs, bc)
    return {"name": name, "start_line": sl, "start_column": sc, "end_line": el, "end_column": ec,
            "body_start_line": bs, "body_start_column": bc, "complexity": complexity, "language": language}


def _children(node: Any) -> Iterable[Any]:
    return (child for child in node.children if child.is_named)


def _descendants(node: Any) -> Iterable[Any]:
    for child in _children(node):
        yield child
        yield from _descendants(child)


def _all_descendants(node: Any) -> Iterable[Any]:
    for child in node.children:
        yield child
        yield from _all_descendants(child)


def _text(node: Any, source: bytes) -> str:
    return source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _field(node: Any, *names: str) -> Any | None:
    for name in names:
        found = node.child_by_field_name(name)
        if found is not None:
            return found
    return None


def _is_function(node: Any) -> bool:
    return node.type in {"function_declaration", "generator_function_declaration", "function_expression",
        "generator_function", "method_definition", "arrow_function", "function_definition", "lambda_expression"}


def _body(node: Any) -> Any | None:
    direct = _field(node, "body", "block", "compound_statement", "value")
    if direct is not None:
        return direct
    for child in reversed(list(_children(node))):
        if "statement" in child.type or child.type in {"block", "compound_statement", "closure_body", "body"}:
            return child
    return None


def _function_name(node: Any, source: bytes) -> str:
    kind = node.type.lower()
    anonymous_kind = any(token in kind for token in ("arrow_function", "lambda", "closure_expression"))
    named = None if anonymous_kind else _field(node, "name", "property", "declarator")
    if named is not None:
        if named.type in {"identifier", "property_identifier", "type_identifier", "field_identifier", "operator_name"}:
            return _text(named, source)
        for child in _descendants(named):
            if child.type in {"qualified_identifier", "nested_name_specifier"}:
                identifiers = [x for x in _descendants(child) if x.type in {"identifier", "field_identifier", "property_identifier"}]
                if identifiers:
                    return _text(identifiers[-1], source)
            if child.type in {"identifier", "property_identifier", "field_identifier", "operator_name"}:
                return _text(child, source)
    for token, name in (("initializer", "init"), ("deinitializer", "deinit"), ("getter", "get"), ("setter", "set")):
        if token in kind:
            return name
    line, col = _point(node)
    return f"anonymous@{line}:{col}"


def _is_nested_function(node: Any) -> bool:
    return _is_function(node)


def _complexity(node: Any, source: bytes) -> int:
    kind = node.type.lower()
    score = 1
    if kind in {"if_statement", "if_expression", "guard_statement", "conditional_expression", "ternary_expression"}:
        score += 1
        clauses = [x for x in _children(node) if "else" in x.type.lower()]
        if clauses and not any(any(y.type in {"if_statement", "if_expression"} for y in _children(e)) for e in clauses):
            score += 1
    elif kind == "optional_chain" or kind in {"assignment_pattern", "object_assignment_pattern"}:
        score += 1
    elif kind == "required_parameter" and _field(node, "value") is not None:
        score += 1
    elif kind in {"for_statement", "for_range_loop", "for_in_statement", "while_statement", "do_statement", "repeat_while_statement"}:
        score += 1
    elif "catch_clause" in kind or kind in {"catch_block", "except_clause"}:
        score += 1
    elif kind in {"case", "case_clause", "switch_case", "case_statement", "match_case", "switch_default"}:
        score += 1
    elif kind in {"binary_expression", "logical_expression", "infix_expression"}:
        score += sum(_text(x, source).strip() in {"&&", "||", "??", "and", "or"} for x in node.children)
    for child in _children(node):
        if _is_nested_function(child):
            continue
        score += _complexity(child, source) - 1
    return score


def _tree_sitter_language(language_name: str) -> Any:
    from tree_sitter import Language
    modules = {"cpp": ("tree_sitter_cpp", "language"), "javascript": ("tree_sitter_javascript", "language"),
               "typescript": ("tree_sitter_typescript", "language_typescript"), "tsx": ("tree_sitter_typescript", "language_tsx")}
    module_name, function_name = modules[language_name]
    return Language(getattr(importlib.import_module(module_name), function_name)())


def _analyse_tree_sitter(source: str, language_name: str) -> tuple[list[dict[str, Any]], list[str]]:
    from tree_sitter import Parser
    parser = Parser(_tree_sitter_language(language_name)); raw = source.encode("utf-8"); tree = parser.parse(raw)
    if language_name == "cpp":
        masked = bytearray(raw); changed = False
        offset = 0
        for line in raw.splitlines(keepends=True):
            content = line.lstrip()
            payload = content.rstrip(b"\r\n")
            declaration = re.fullmatch(rb"(?:JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR|START_JUCE_APPLICATION)\s*\(\s*[A-Za-z_][A-Za-z_0-9:]*\s*\)\s*;?", payload)
            # This known JUCE loop is only rewritten for simple identifier and
            # literal arguments. Expressions that could contain decisions stay
            # unsupported rather than disappearing from the complexity count.
            loop = re.match(rb'forEachXmlChildElementWithTagName\(\s*[A-Za-z_]\w*\s*,\s*[A-Za-z_]\w*\s*,\s*"[^"\\]*"\s*\)', content)
            if declaration or loop:
                start = offset
                if loop:
                    prefix = len(line) - len(content)
                    end = prefix + loop.end()
                    replacement = b"for (;false;)"
                    for index in range(start + prefix, start + end):
                        masked[index] = replacement[index - start - prefix] if index - start - prefix < len(replacement) else 32
                else:
                    for index in range(start, start + len(line)):
                        if masked[index] not in (10, 13):
                            masked[index] = 32
                changed = True
            offset += len(line)
        if changed:
            recovered = parser.parse(bytes(masked))
            if not recovered.root_node.has_error:
                tree = recovered
    # Recover a known type-query grammar gap. Mask only the
    # reported error span, byte-for-byte, then retain the recovered tree's
    # original coordinates.  Other errors remain visible to callers.
    if tree.root_node.has_error and language_name in {"typescript", "tsx"}:
        masked = bytearray(raw); changed = False
        for error in _all_descendants(tree.root_node):
            if error.type != "ERROR":
                continue
            chunk = raw[error.start_byte:error.end_byte]
            replacement = None
            parent = error.parent
            type_only = parent is not None and parent.type == "type_annotation"
            if language_name == "typescript" and type_only and chunk.startswith(b"import(") and b")." in chunk:
                replacement = b"any" + b" " * (len(chunk) - 3)
            if replacement is not None:
                masked[error.start_byte:error.end_byte] = replacement
                changed = True
        if changed:
            recovered = parser.parse(bytes(masked))
            if not recovered.root_node.has_error:
                tree = recovered
    issues: list[str] = []
    if tree.root_node.has_error:
        errors = [n for n in [tree.root_node, *_all_descendants(tree.root_node)] if n.type == "ERROR" or n.is_missing]
        filtered = []
        for error in errors:
            # JUCE's calling-convention macros can leave a spurious missing
            # ``::`` token in tree-sitter-cpp; the surrounding function is
            # still fully represented and is safe to analyse.
            parent = error.parent
            macro_function = False
            while parent is not None:
                if parent.type == "function_definition":
                    macro_function = "JUCE_CALLTYPE" in _text(parent, raw)
                    break
                parent = parent.parent
            macro_recovery = error.type == "::" and error.parent is not None and error.parent.type == "qualified_identifier" and macro_function
            if not macro_recovery:
                filtered.append(error)
        issues = [f"syntax error at line {_point(n)[0]} column {_point(n)[1]}: {n.type}" for n in filtered[:20]]
        if not issues and filtered:
            issues = ["syntax error: grammar reported an invalid source tree"]
    records: list[dict[str, Any]] = []
    def visit(node: Any) -> None:
        body = _body(node)
        if _is_function(node) and body is not None:
            complexity = _complexity(node, raw)
            records.append(_record(_function_name(node, raw), node, body, complexity, language_name, raw))
        for child in _children(node):
            visit(child)
    visit(tree.root_node)
    records.sort(key=lambda item: (item["start_line"], item["start_column"], item["name"]))
    return records, issues


def analyze_source(path: str, source: str) -> dict[str, Any]:
    language = _EXTENSIONS.get(Path(path).suffix.lower())
    if language is None:
        return {"functions": [], "issues": [f"unsupported source language for {path}"]}
    try:
        functions, issues = _analyse_tree_sitter(source, language)
    except (ImportError, ModuleNotFoundError) as exc:
        functions, issues = [], [f"parser unavailable for {language}: {exc}"]
    except Exception as exc:
        functions, issues = [], [f"parser failure for {language}: {exc}"]
    return {"functions": functions, "issues": issues}
