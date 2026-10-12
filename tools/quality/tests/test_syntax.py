import unittest
from pathlib import Path

from tools.quality.crap_syntax import analyze_source


FIXTURES = Path(__file__).parent / "fixtures"


class TreeSitterSyntaxTests(unittest.TestCase):
    def _fixture(self, name):
        path = FIXTURES / name
        return analyze_source(str(path), path.read_text())

    def test_javascript_arrow_and_callback(self):
        result = self._fixture("sample.js")
        names = [item["name"] for item in result["functions"]]
        self.assertEqual(result["issues"], [])
        self.assertIn("run", names)
        self.assertTrue(any(name.startswith("anonymous@") for name in names))
        self.assertEqual(next(item["complexity"] for item in result["functions"] if item["name"] == "run"), 3)
        self.assertEqual(next(item["complexity"] for item in result["functions"] if item["name"] == "anonymous@18:19"), 3)

    def test_javascript_control_flow_hand_calculation(self):
        result = self._fixture("sample.js")
        self.assertEqual(next(item["complexity"] for item in result["functions"] if item["name"] == "decisions"), 13)
        anonymous = [item for item in result["functions"] if item["name"].startswith("anonymous@")]
        self.assertGreaterEqual(len(anonymous), 4)

    def test_nested_arrow_body_scores_independently_and_unicode_columns_are_utf16(self):
        nested = analyze_source("nested.js", "const outer = x => y => y ? x : 0;\n")
        arrows = [item for item in nested["functions"] if item["name"].startswith("anonymous@")]
        self.assertEqual([item["complexity"] for item in arrows], [1, 2])
        unicode = analyze_source("unicode.js", "const café = () => 1;\n")
        self.assertEqual(unicode["functions"][0]["start_column"], 13)
        self.assertEqual(unicode["functions"][0]["body_start_column"], 19)

    def test_malformed_juce_calltype_body_is_not_suppressed(self):
        result = analyze_source("broken.cpp", "int JUCE_CALLTYPE broken() { if (true) { return 1; }\n")
        self.assertTrue(result["issues"])

    def test_known_juce_macro_lines_are_masked_with_offsets_preserved(self):
        result = analyze_source("macro.cpp", "class Thing {\n  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(Thing)\n};\nSTART_JUCE_APPLICATION(App)\n")
        self.assertEqual(result["issues"], [])

    def test_typescript_getter_and_overload_declaration(self):
        result = self._fixture("sample.ts")
        names = [item["name"] for item in result["functions"]]
        self.assertEqual(result["issues"], [])
        self.assertIn("value", names)
        self.assertIn("implemented", names)
        self.assertEqual(names.count("declared"), 1)

    def test_optional_types_strings_and_comments_are_not_decisions(self):
        result = analyze_source("optional.ts", '''function optional(value?: string) { // && || ??
  return "&& || ?? ?";
}
''')
        self.assertEqual(result["issues"], [])
        self.assertEqual(result["functions"][0]["complexity"], 1)

    def test_typescript_import_type_query_is_recovered(self):
        result = analyze_source("query.ts", "function find(nodes: import('../api/types').ChainNodeUI[]): number | null { return null; }\n")
        self.assertEqual(result["issues"], [])
        self.assertEqual(result["functions"][0]["name"], "find")

    def test_tsx_text_ampersand_remains_a_parse_issue(self):
        result = analyze_source("text.tsx", "export function View() { return <p>Save & share</p>; }\n")
        self.assertTrue(result["issues"])

    def test_juce_loop_macro_counts_as_a_loop(self):
        result = analyze_source("loop.cpp", '''void scan() {
  forEachXmlChildElementWithTagName(xml, e, "BINDING") { value++; }
}
''')
        self.assertEqual(result["issues"], [])
        self.assertEqual(result["functions"][0]["complexity"], 2)

    def test_malformed_ampersand_code_is_not_suppressed(self):
        result = analyze_source("broken.tsx", "function Broken() { return <p>{value && other} &</p>; }\n")
        self.assertTrue(result["issues"])

    def test_cpp_qualified_method_name(self):
        result = analyze_source("qualified.cpp", "int ChainProcessor::method() { return 1; }\n")
        self.assertEqual(result["issues"], [])
        self.assertEqual(result["functions"][0]["name"], "method")

    def test_cpp_lambda_and_overloads(self):
        result = self._fixture("sample.cpp")
        names = [item["name"] for item in result["functions"]]
        self.assertEqual(result["issues"], [])
        self.assertGreaterEqual(names.count("overloaded"), 2)
        self.assertTrue(any(name.startswith("anonymous@") for name in names))
        self.assertEqual(next(item["complexity"] for item in result["functions"] if item["name"] == "run"), 3)

    def test_cpp_control_flow_hand_calculation(self):
        result = self._fixture("sample.cpp")
        self.assertEqual(next(item["complexity"] for item in result["functions"] if item["name"] == "decisions"), 12)

    def test_optional_chains_and_default_arguments_are_decisions(self):
        for extension in ('js', 'ts'):
            result = analyze_source('defaults.' + extension, 'function f(a = 1) { return a?.x?.y ?? 0; }')
            self.assertEqual(result['issues'], [])
            self.assertEqual(result['functions'][0]['complexity'], 5)
        conditional = analyze_source('default.ts', 'function f(a = flag ? 1 : 2) { return a; }')
        self.assertEqual(conditional['functions'][0]['complexity'], 3)

    def test_tree_sitter_malformed_source_has_issue(self):
        result = analyze_source("broken.js", "function broken( {\n")
        self.assertTrue(result["issues"])


if __name__ == "__main__":
    unittest.main()
