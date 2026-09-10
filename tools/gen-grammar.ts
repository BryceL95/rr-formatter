/**
 * Generates `syntaxes/rr.tmLanguage.json` from the shared catalogues in
 * `src/language/`, so the function list exists in exactly one place.
 *
 * Run with `npm run gen:grammar`.
 *
 * Pattern order in `patterns` is significant and is the thing the old grammar
 * got wrong: strings must be matched before function names, or a function name
 * written inside a string literal gets highlighted as a function.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Explicit .ts specifiers: this script runs directly under Node's type
// stripping, which does not remap .js back to .ts the way a bundler does.
import { FUNCTIONS_BY_CATEGORY } from '../src/language/functions.ts';
import { INDEXED_ROOT_PATTERN, NAMESPACE_ROOTS } from '../src/language/fields.ts';

// npm always runs scripts from the package root, which is what this resolves
// against. Run it through `npm run gen:grammar` rather than directly.
const outputPath = resolve('syntaxes', 'rr.tmLanguage.json');

/** Escapes a name for use inside a regex alternation. */
const escape = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds an alternation with longer names first, so `TSum` cannot be shadowed
 * by a shorter prefix like `T`.
 */
function alternation(names: readonly string[]): string {
    return [...names]
        .sort((a, b) => b.length - a.length || a.localeCompare(b))
        .map(escape)
        .join('|');
}

const { control, ...libraryCategories } = FUNCTIONS_BY_CATEGORY;
const libraryFunctions = Object.values(libraryCategories).flat();

const grammar = {
    $schema:
        'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: 'RACE RESULT',
    scopeName: 'source.rr',
    patterns: [
        { include: '#comment' },
        { include: '#fulltext' },
        { include: '#string' },
        { include: '#field' },
        { include: '#brace' },
        { include: '#number' },
        { include: '#control' },
        { include: '#library-function' },
        { include: '#unknown-function' },
        { include: '#word-operator' },
        { include: '#symbol-operator' },
        { include: '#punctuation' }
    ],
    repository: {
        comment: {
            name: 'comment.block.rr',
            begin: '/\\*',
            end: '\\*/',
            beginCaptures: { 0: { name: 'punctuation.definition.comment.begin.rr' } },
            endCaptures: { 0: { name: 'punctuation.definition.comment.end.rr' } }
        },

        // A '#' expression is literal text to end of line, except for the
        // field references embedded in it.
        fulltext: {
            name: 'meta.fulltext.rr',
            begin: '#',
            end: '$',
            beginCaptures: { 0: { name: 'punctuation.definition.fulltext.rr' } },
            patterns: [{ include: '#field' }],
            contentName: 'string.unquoted.fulltext.rr'
        },

        string: {
            name: 'string.quoted.double.rr',
            begin: '"',
            end: '"',
            beginCaptures: { 0: { name: 'punctuation.definition.string.begin.rr' } },
            endCaptures: { 0: { name: 'punctuation.definition.string.end.rr' } },
            patterns: [{ include: '#translation' }]
        },

        // Multi-language strings such as {EN:yes|ES:si}.
        translation: {
            name: 'constant.language.translation.rr',
            begin: '\\{(?=[A-Za-z]{2}:)',
            end: '\\}',
            beginCaptures: { 0: { name: 'punctuation.definition.translation.begin.rr' } },
            endCaptures: { 0: { name: 'punctuation.definition.translation.end.rr' } },
            patterns: [
                { name: 'entity.name.tag.language.rr', match: '(?<=[{|])[A-Za-z]{2}(?=:)' },
                { name: 'punctuation.separator.translation.rr', match: '\\|' }
            ]
        },

        field: {
            name: 'meta.field.rr',
            begin: '\\[',
            end: '\\]',
            beginCaptures: { 0: { name: 'punctuation.definition.field.begin.rr' } },
            endCaptures: { 0: { name: 'punctuation.definition.field.end.rr' } },
            contentName: 'variable.other.field.rr',
            patterns: [
                {
                    name: 'support.type.field-prefix.rr',
                    match: `(?i)(?<![A-Za-z0-9_])(?:${alternation(NAMESPACE_ROOTS)}|${INDEXED_ROOT_PATTERN})(?=\\.)`
                },
                { name: 'punctuation.accessor.rr', match: '\\.' },
                { include: '#brace' }
            ]
        },

        // Record multipliers and split selectors, e.g. {n} or {LastSplit}.
        brace: {
            name: 'meta.brace.rr',
            begin: '\\{',
            end: '\\}',
            beginCaptures: { 0: { name: 'punctuation.definition.brace.begin.rr' } },
            endCaptures: { 0: { name: 'punctuation.definition.brace.end.rr' } },
            contentName: 'variable.other.selector.rr'
        },

        number: {
            name: 'constant.numeric.rr',
            match: '(?<![A-Za-z0-9_.])[0-9]+(?:\\.[0-9]+)?'
        },

        control: {
            name: 'keyword.control.conditional.rr',
            match: `(?i)\\b(?:${alternation(control)})\\b(?=\\s*\\()`
        },

        // Documented functions get their own scope so a typo, which falls
        // through to #unknown-function, is visibly a different colour.
        'library-function': {
            name: 'support.function.rr',
            match: `(?i)\\b(?:${alternation(libraryFunctions)})\\b(?=\\s*\\()`
        },

        'unknown-function': {
            name: 'entity.name.function.rr',
            match: '\\b[A-Za-z_][A-Za-z0-9_]*\\b(?=\\s*\\()'
        },

        'word-operator': {
            patterns: [
                { name: 'keyword.operator.logical.rr', match: '(?i)\\b(?:AND|OR|XOR)\\b' },
                { name: 'keyword.operator.array.rr', match: '(?i)\\b(?:NIN|IN)\\b' }
            ]
        },

        // Longest first: '<=' and '<>' must beat '<'.
        'symbol-operator': {
            patterns: [
                { name: 'keyword.operator.comparison.rr', match: '<=|>=|<>|<|>|=' },
                { name: 'keyword.operator.concatenation.rr', match: '&' },
                { name: 'keyword.operator.time.rr', match: ':' },
                { name: 'keyword.operator.arithmetic.rr', match: '\\+|\\-|\\*|/|\\\\|%|\\^' }
            ]
        },

        punctuation: {
            patterns: [
                { name: 'punctuation.separator.parameter.rr', match: ';' },
                { name: 'punctuation.section.parens.begin.rr', match: '\\(' },
                { name: 'punctuation.section.parens.end.rr', match: '\\)' }
            ]
        }
    }
};

writeFileSync(outputPath, JSON.stringify(grammar, null, 2) + '\n', 'utf8');

const total = Object.values(FUNCTIONS_BY_CATEGORY).flat().length;
process.stdout.write(`Wrote ${outputPath} (${total} functions)\n`);
