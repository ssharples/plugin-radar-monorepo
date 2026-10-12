import json
import tempfile
import unittest
from pathlib import Path

from tools.quality.coverage_data import function_coverage, owner, read_reports
from tools.quality.crap import analyze_files, passed, score
from tools.quality.mutation import analyze_reports, identity, merge_result, module_report, normalize, reviewed_equivalents


class CoverageMetricsTests(unittest.TestCase):
    def test_branch_coverage_takes_precedence_over_lines(self):
        function = {"name": "f", "start_line": 1, "start_column": 0, "end_line": 8, "end_column": 0}
        data = {"entries": [{"start": (1, 0), "end": (8, 0), "hits": 1}],
                "branches": [{"start": (3, 0), "end": (3, 5), "hits": 1, "arm": 0},
                             {"start": (3, 0), "end": (3, 5), "hits": 0, "arm": 1}],
                "statements": [{"start": (2, 0), "end": (2, 1), "hits": 1}], "segments": []}
        result = function_coverage(function, [function], data)
        self.assertEqual(result["basis"], "branch")
        self.assertEqual(result["coverage"], 0.5)

    def test_branch_hits_cannot_override_an_unexecuted_function_entry(self):
        function = {"name": "f", "start_line": 1, "start_column": 0, "end_line": 5, "end_column": 0}
        data = {"entries": [{"start": (1, 0), "end": (5, 0), "hits": 0}],
                "branches": [{"start": (2, 0), "end": (2, 3), "hits": 1, "arm": 0}],
                "statements": [], "segments": []}
        self.assertEqual(function_coverage(function, [function], data)["coverage"], 0.0)

    def test_instrumented_zero_is_measured_but_unmapped_is_na(self):
        function = {"name": "f", "start_line": 1, "start_column": 0, "end_line": 4, "end_column": 0}
        zero = {"entries": [{"start": (1, 0), "end": (4, 0), "hits": 0}], "branches": [],
                "statements": [{"start": (2, 0), "end": (2, 1), "hits": 0}], "segments": []}
        self.assertEqual(function_coverage(function, [function], zero)["coverage"], 0.0)
        self.assertIsNone(function_coverage(function, [function], None)["coverage"])

    def test_nested_same_line_callback_gets_inner_owner(self):
        outer = {"name": "outer", "start_line": 1, "start_column": 0, "end_line": 1, "end_column": 40}
        inner = {"name": "callback", "start_line": 1, "start_column": 15, "end_line": 1, "end_column": 30}
        self.assertIs(owner((1, 20), [outer, inner]), inner)

    def test_duplicate_llvm_exports_union_hits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "apps/desktop/src/Foo.cpp"
            source.parent.mkdir(parents=True)
            source.write_text("int f() { return 1; }\n")
            payload = lambda hits: {"type": "llvm.coverage.json.export", "version": "2.0.0", "data": [{
                "files": [{"filename": str(source), "segments": [[1, 12, hits, 1, 0, 0], [1, 24, 0, 0, 0, 0]], "branches": []}],
                "functions": [{"name": "f", "count": hits, "filenames": [str(source)], "regions": [[1, 12, 1, 24, hits, 0, 0, 0]]}]
            }]}
            paths = []
            for index, hits in enumerate((0, 2)):
                path = root / f"{index}.json"
                path.write_text(json.dumps(payload(hits)))
                paths.append(path)
            result = read_reports(paths, root)
            self.assertEqual(result["apps/desktop/src/Foo.cpp"]["entries"][0]["hits"], 0)
            self.assertEqual(max(item["hits"] for item in result["apps/desktop/src/Foo.cpp"]["entries"]), 2)
            scored = analyze_files(root, ["apps/desktop/src/Foo.cpp"], result)
            self.assertEqual(scored["functions"][0]["coverage"], 1.0)

    def test_crap_formula_and_threshold(self):
        self.assertEqual(score(2, 1.0), 2.0)
        self.assertAlmostEqual(score(2, 0.0), 6.0)
        self.assertIsNone(score(4, None))

    def test_malformed_or_missing_coverage_is_not_a_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "f.ts"
            source.write_text("function f(x: number) { return x; }\n")
            report = analyze_files(root, ["f.ts"], {})
            self.assertEqual(report["not_available"], 1)
            self.assertFalse(report["issues"])
            self.assertFalse(passed(report))

            malformed = root / "bad.json"
            malformed.write_text("{")
            with self.assertRaises(json.JSONDecodeError):
                read_reports([malformed], root)


class MutationMetricsTests(unittest.TestCase):
    def mutant(self, status="Survived", operator="cxx_add_to_sub"):
        return {"id": "vendor", "mutatorName": operator, "status": status,
                "location": {"start": {"line": 1, "column": 1}, "end": {"line": 1, "column": 2}},
                "replacement": "-"}

    def test_per_file_score_and_obvious_survivor_fail(self):
        source = "return 1\n"
        record = normalize(self.mutant(), "f.cpp", source, {})
        report = module_report("f.cpp", [record, normalize(self.mutant("Killed"), "f.cpp", source, {})])
        self.assertEqual(report["score"], 50.0)
        self.assertEqual(report["trivial_survivors"], 1)
        self.assertEqual(report["status"], "fail")

    def test_unresolved_and_no_mutants_fail(self):
        source = "return 1\n"
        unresolved = normalize(self.mutant("Timeout", "Other"), "f.cpp", source, {})
        self.assertEqual(module_report("f.cpp", [unresolved])["status"], "fail")
        empty = module_report("empty.cpp", [])
        self.assertIsNone(empty["score"])
        self.assertEqual(empty["status"], "fail")

    def test_killed_wins_merge_but_unresolved_replaces_survivor(self):
        source = "return 1\n"
        killed = normalize(self.mutant("Killed", "Other"), "f.cpp", source, {})
        survived = normalize(self.mutant("Survived", "Other"), "f.cpp", source, {})
        records = {}
        merge_result(records, survived)
        merge_result(records, killed)
        self.assertEqual(records[killed["id"]]["outcome"], "killed")
        unresolved = normalize(self.mutant("Timeout", "Other"), "f.cpp", source, {})
        merge_result(records, unresolved)
        self.assertEqual(records[killed["id"]]["outcome"], "killed")
        pending_mutant = {**self.mutant("Survived", "Other"), "location": {"start": {"line": 1, "column": 3}, "end": {"line": 1, "column": 4}}}
        timeout_mutant = {**pending_mutant, "status": "Timeout"}
        pending = normalize(pending_mutant, "f.cpp", source, {})
        timeout = normalize(timeout_mutant, "f.cpp", source, {})
        merge_result(records, pending)
        merge_result(records, timeout)
        self.assertEqual(records[timeout["id"]]["outcome"], "unresolved")

    def test_equivalent_requires_exact_hash_reason_and_source_staleness_fails(self):
        source = "return 1\n"
        mutant = self.mutant("Survived", "Other")
        mutant_id = identity("f.cpp", source, mutant)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "equivalents.json"
            path.write_text(json.dumps({"equivalents": [{"id": mutant_id, "reason": "proved equivalent"}]}))
            self.assertIn(mutant_id, reviewed_equivalents(path))
            report = Path(directory) / "elements.json"
            (Path(directory) / "f.cpp").write_text(source)
            report.write_text(json.dumps({"projectRoot": directory, "files": {"f.cpp": {"source": "stale", "mutants": []}}}))
            with self.assertRaises(ValueError):
                analyze_reports([report], Path(directory), ["f.cpp"], {})


if __name__ == "__main__":
    unittest.main()

class AdditionalPolicyRegressions(unittest.TestCase):
    def test_95_percent_with_an_obvious_survivor_still_fails(self):
        item = MutationMetricsTests().mutant()
        survivors = [normalize(item, 'f.cpp', 'return a+b;', {})]
        killed = [normalize({**item, 'status': 'Killed', 'id': str(i)}, 'f.cpp', 'return a+b;', {}) for i in range(19)]
        report = module_report('f.cpp', killed + survivors)
        self.assertEqual(report['score'], 95.0)
        self.assertEqual(report['status'], 'fail')

    def test_modules_are_not_pooled_and_timeout_is_not_a_kill(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for file in ('good.cpp', 'bad.cpp'):
                (root / file).write_text('return 1;')
            item = MutationMetricsTests().mutant(operator='Other')
            good = [{**item, 'status': 'Killed', 'replacement': str(i)} for i in range(99)]
            report = root / 'report.json'
            report.write_text(json.dumps({'files': {'good.cpp': {'source': 'return 1;', 'mutants': good}, 'bad.cpp': {'source': 'return 1;', 'mutants': [item]}}}))
            result = analyze_reports([report], root, ['good.cpp', 'bad.cpp'], {})
            self.assertEqual([m['score'] for m in result['modules']], [100, 0])
            self.assertEqual(result['status'], 'fail')
        for status in ('Timeout', 'RuntimeError', 'Ignored'):
            record = normalize({**item, 'status': status}, 'a.cpp', 'return 1;', {})
            self.assertEqual(record['outcome'], 'unresolved')
            self.assertEqual(module_report('a.cpp', [record])['killed'], 0)

    def test_unresolved_survives_a_later_passing_binary(self):
        source = 'return 1;'; item = MutationMetricsTests().mutant(operator='Other')
        unresolved = normalize({**item, 'status': 'Timeout'}, 'f.cpp', source, {})
        survived = normalize(item, 'f.cpp', source, {})
        records = {}; merge_result(records, unresolved); merge_result(records, survived)
        self.assertEqual(records[unresolved['id']]['outcome'], 'unresolved')

    def test_null_istanbul_end_column_keeps_exact_declaration_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); file = root / 'source.ts'
            source = 'const f = () => 1;'; file.write_text(source)
            report = root / 'coverage.json'
            report.write_text(json.dumps({str(file): {'path': str(file), 'fnMap': {'0': {'decl': {'start': {'line': 1, 'column': 10}}, 'loc': {'start': {'line': 1, 'column': 15}, 'end': {'line': 1, 'column': None}}}}, 'f': {'0': 1}, 'statementMap': {'0': {'start': {'line': 1, 'column': 15}, 'end': {'line': 1, 'column': None}}}, 's': {'0': 1}, 'branchMap': {}, 'b': {}}}))
            result = analyze_files(root, ['source.ts'], read_reports([report], root))
            self.assertTrue(passed(result), result)
            self.assertEqual(result['functions'][0]['coverage'], 1)

    def test_llvm_v3_and_unknown_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); file = root / 'coverage.json'
            file.write_text(json.dumps({'type': 'llvm.coverage.json.export', 'version': '3.0.1', 'data': []}))
            self.assertEqual(read_reports([file], root), {})
            file.write_text(json.dumps({'type': 'llvm.coverage.json.export', 'version': '99.0.1', 'data': []}))
            with self.assertRaises(ValueError): read_reports([file], root)
            file.write_text('[]')
            with self.assertRaises(ValueError): read_reports([file], root)

class EquivalentExecutionPolicyTests(unittest.TestCase):
    def test_proof_does_not_mask_a_timeout(self):
        item = MutationMetricsTests().mutant('Timeout', 'Other')
        source = 'return 1;'; key = identity('f.cpp', source, item)
        result = normalize(item, 'f.cpp', source, {key: 'Equivalent for all domain inputs'})
        self.assertEqual(result['outcome'], 'unresolved')
