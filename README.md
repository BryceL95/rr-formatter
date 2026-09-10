# RACE RESULT Expressions

Syntax highlighting and formatting for [RACE RESULT](https://www.raceresult.com)
fields, functions and expressions, for scratch files you write in VS Code and
copy into the software.

Open any `.rr` file (`.rr12` and `.rr14` also work) and press **Shift+Alt+F**.

## What it does

**Formats like Prettier.** Short expressions stay on one line. Anything longer
than the print width expands, one argument per line:

```
if([Bib] = 1; "yes"; "no")

if(
    [Contest] = 1;
    TSum("Lap{n}"; 1; [Contest.Laps]);
    TMax("Bonus{n}"; 1; [Contest.Laps])
)
```

Long concatenation chains break with the operator leading the line, so the
structure stays readable:

```
[Firstname]
    & " "
    & [Lastname]
    & " ("
    & [Contest.Name]
    & ")"
```

RACE RESULT accepts these line breaks, so formatted expressions can be pasted
straight back in.

**Colours every symbol type separately.** Brackets, braces, parentheses,
parameter separators, comparison operators, arithmetic operators, string
concatenation, strings, numbers and function names each get their own scope, so
your theme colours them consistently. Field namespaces (`Contest` in
`[Contest.Name]`) are distinguished from the property that follows.

**Knows the function catalogue.** All 158 documented functions are recognised.
A recognised name gets the "library function" colour; a typo does not, which is
usually the fastest way to spot one. Formatting also rewrites known functions to
their official casing, so `tsum(` becomes `TSum(`.

**Declines rather than mangles.** If the file has a syntax error the formatter
makes no edits at all and marks the problem in place. Formatting is idempotent
and never adds, removes or re-associates parentheses.

**Comments.** RACE RESULT has no comment syntax of its own, but `/* ... */`
blocks are supported here and are stripped when the expression is pasted in.
They survive formatting and keep their position.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `rr.format.printWidth` | `80` | Line length the formatter aims for |
| `rr.format.spaceAfterSeparator` | `true` | `; ` rather than `;` between inline parameters |
| `rr.format.spacesAroundOperators` | `true` | `[a] = 1` rather than `[a]=1` |
| `rr.format.normalizeFunctionCase` | `true` | Rewrite known functions to official casing |
| `rr.format.uppercaseLogicalOperators` | `true` | Uppercase `AND`, `OR`, `XOR`, `IN`, `NIN` |
| `rr.diagnostics.enabled` | `true` | Report syntax errors and unknown function names |

Indentation follows the editor's own `tabSize` / `insertSpaces`.

To format on save, add to your settings:

```json
"[rr]": {
    "editor.defaultFormatter": "brycelongacre.rr",
    "editor.formatOnSave": true
}
```

## Development

> **On Windows, work through a mapped drive letter, not a UNC path.** `npm`
> postinstall scripts run through `cmd.exe`, which cannot use `\\server\share`
> as a working directory and fails with "UNC paths are not supported". This
> repo lives on a share mapped to `Z:`, so open `Z:\...\rr-formatter`.

```
npm install
npm test          # vitest, no extension host needed
npm run compile   # regenerates the grammar, then bundles to dist/
npm run typecheck
npm run package   # builds a .vsix
```

Press **F5** to launch a second VS Code window with the extension loaded and
`examples/scratch.rr` open.

### Layout

```
src/language/functions.ts   the function catalogue -- single source of truth
src/language/fields.ts      known field namespaces
src/language/lexer.ts       source -> tokens (with offsets)
src/language/parser.ts      tokens -> AST (precedence climbing)
src/format/doc.ts           Wadler/Prettier document algebra
src/format/format.ts        all layout policy lives here
src/providers/              the VS Code glue
tools/gen-grammar.ts        generates syntaxes/rr.tmLanguage.json
```

`syntaxes/rr.tmLanguage.json` is **generated** — edit `tools/gen-grammar.ts` and
run `npm run gen:grammar`, never the JSON directly. Adding a function means
adding it to `src/language/functions.ts` and nowhere else.

Everything outside `src/providers/` is pure functions over strings, so the
formatter is tested without launching VS Code. The tests assert three invariants
on every fixture: output matches the recorded result, reformatting is a no-op,
and the meaning-carrying tokens are unchanged.

The grammar is tested too — `test/grammar.test.ts` runs it through
`vscode-textmate`, the same engine VS Code uses, and checks the actual scope
assigned to each symbol. Colouring bugs are otherwise invisible until you look
at a file by eye.

To accept a deliberate change in formatting output, delete
`test/fixtures/input.expected.rr` and run the tests once: it is regenerated, and
the diff shows exactly what moved.

## Reference

[Fields, Expressions and Functions](https://www.raceresult.com/en-us/support/kb?id=1192-Fields-Expressions-and-Functions)
