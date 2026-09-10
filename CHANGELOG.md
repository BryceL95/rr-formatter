# Change Log

## [2.0.0] - 2026-09-10

Rewrite. The 1.0.0 extension shipped syntax highlighting only — the formatter it
advertised never ran, because `package.json` had no `main` entry and the
provider was registered against a language id (`customlang`) that did not exist.

### Added

- **A real formatter**, built on a lexer, a precedence-climbing parser and a
  Wadler/Prettier document algebra. Expressions that fit stay on one line;
  longer ones expand one argument per line at a configurable print width.
- Range formatting (Format Selection) alongside whole-document formatting.
- A semantic token provider, so a documented function is coloured differently
  from a typo, and a field namespace differently from its property.
- Syntax diagnostics with in-place error positions, plus informational
  diagnostics for unknown function names and non-standard casing.
- Support for `/* ... */` comments, which survive formatting in place.
- Six settings under `rr.*` for print width, spacing, casing and diagnostics.
- A build (`tsconfig.json`, esbuild bundle, npm scripts) and 105 tests, none
  of which need an extension host. The grammar is verified through
  `vscode-textmate`, the same engine VS Code uses.

### Changed

- **Renamed from `rr12` to `rr`** so the extension is not tied to a RACE RESULT
  version: language id `rr`, scope `source.rr`, primary extension `.rr`.
  `.rr12` and `.rr14` still open with the language.
- The TextMate grammar is now **generated** from `src/language/functions.ts`, so
  the function list lives in exactly one place. The catalogue grew from ~140 to
  158 names.
- Every symbol type has its own scope: brackets, braces, parentheses, parameter
  separators, and comparison/arithmetic/logical/concatenation/time operators are
  each distinct.
- `language-configuration.json`: block comments only (RACE RESULT has no line
  comment), braces dropped from bracket matching, and a `wordPattern` so
  `[Contest.Name]` selects as one word.

### Fixed

- Function names written inside string literals are no longer highlighted as
  functions — the grammar now matches strings before function names.
- `<=`, `>=` and `<>` tokenize as single operators. The old alternation tried
  `<` first, so multi-character comparisons never matched as a unit.
- `AND` is no longer matched inside words such as `RANDOM`, and lower-case
  `and` / `or` are now recognised.
- Removed the contributed command `extension.formatCustomLang`, which had no
  implementation and errored with "command not found".
- Removed a dead, malformed `variables` grammar rule.

### Removed

- Stale checked-in build artifacts (`rr12-1.0.0.vsix`, `rr12-1.0.0.zip`) and the
  unmodified Yeoman scaffold notes.

## [1.0.0] - 2023-04-11

- Initial release: TextMate grammar for RACE RESULT 12 functions and operators.
