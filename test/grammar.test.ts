/**
 * Runs the generated TextMate grammar through the same engine VS Code uses, so
 * the scopes are verified rather than assumed.
 *
 * Colouring is the headline feature of this extension and a grammar bug is
 * invisible in a unit test of the formatter, so this file exists to catch the
 * specific mistakes the old grammar made: function names highlighted inside
 * strings, `<` shadowing `<=`, and `AND` matching inside `RANDOM`.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';
import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';

const require = createRequire(__filename);
const root = join(__dirname, '..');

let grammar: textmate.IGrammar;

beforeAll(async () => {
    const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
    await oniguruma.loadWASM(readFileSync(wasmPath).buffer as ArrayBuffer);

    const registry = new textmate.Registry({
        onigLib: Promise.resolve({
            createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
            createOnigString: (text) => new oniguruma.OnigString(text)
        }),
        loadGrammar: async (scopeName) => {
            if (scopeName !== 'source.rr') {
                return null;
            }
            const raw = readFileSync(join(root, 'syntaxes', 'rr.tmLanguage.json'), 'utf8');
            return textmate.parseRawGrammar(raw, 'rr.tmLanguage.json');
        }
    });

    const loaded = await registry.loadGrammar('source.rr');
    if (!loaded) {
        throw new Error('failed to load source.rr');
    }
    grammar = loaded;
});

interface Scoped {
    text: string;
    scopes: string[];
}

/** Tokenizes one line and returns each token's text with its scope stack. */
function tokensOf(lineText: string): Scoped[] {
    const result = grammar.tokenizeLine(lineText, textmate.INITIAL);
    return result.tokens.map((token) => ({
        text: lineText.slice(token.startIndex, token.endIndex),
        scopes: token.scopes
    }));
}

/** The scopes applied to the first token whose text is exactly `text`. */
function scopesFor(lineText: string, text: string): string[] {
    const token = tokensOf(lineText).find((t) => t.text === text);
    if (!token) {
        throw new Error(
            `no token "${text}" in: ${tokensOf(lineText)
                .map((t) => JSON.stringify(t.text))
                .join(', ')}`
        );
    }
    return token.scopes;
}

/**
 * Scopes of the first token whose text *contains* `text`. Needed where the
 * correct outcome is that a run was not split -- an unhighlighted name merges
 * with the surrounding whitespace, and a string swallows its whole body.
 */
function scopesAround(lineText: string, text: string): string[] {
    const token = tokensOf(lineText).find((t) => t.text.includes(text));
    if (!token) {
        throw new Error(`no token containing "${text}" in ${JSON.stringify(lineText)}`);
    }
    return token.scopes;
}

const has = (scopes: string[], needle: string): boolean =>
    scopes.some((scope) => scope === needle);

describe('grammar: symbol types get distinct scopes', () => {
    it('separates brackets, parens and the parameter separator', () => {
        const line = 'if([Bib] = 1; "yes"; "no")';
        expect(has(scopesFor(line, '('), 'punctuation.section.parens.begin.rr')).toBe(true);
        expect(has(scopesFor(line, ')'), 'punctuation.section.parens.end.rr')).toBe(true);
        expect(has(scopesFor(line, '['), 'punctuation.definition.field.begin.rr')).toBe(true);
        expect(has(scopesFor(line, ']'), 'punctuation.definition.field.end.rr')).toBe(true);
        expect(has(scopesFor(line, ';'), 'punctuation.separator.parameter.rr')).toBe(true);
    });

    it('separates operator families', () => {
        expect(has(scopesFor('[a] = 1', '='), 'keyword.operator.comparison.rr')).toBe(true);
        expect(has(scopesFor('[a] + 1', '+'), 'keyword.operator.arithmetic.rr')).toBe(true);
        expect(has(scopesFor('[a] & [b]', '&'), 'keyword.operator.concatenation.rr')).toBe(true);
        expect(has(scopesFor('1:30', ':'), 'keyword.operator.time.rr')).toBe(true);
        expect(has(scopesFor('[a] AND [b]', 'AND'), 'keyword.operator.logical.rr')).toBe(true);
        expect(has(scopesFor('[a] IN "1"', 'IN'), 'keyword.operator.array.rr')).toBe(true);
    });

    it('scopes strings, numbers and comments', () => {
        expect(has(scopesFor('"yes"', '"yes"'.slice(0, 1)), 'punctuation.definition.string.begin.rr')).toBe(true);
        expect(has(scopesFor('123', '123'), 'constant.numeric.rr')).toBe(true);
        expect(has(scopesFor('/* note */', '/*'), 'comment.block.rr')).toBe(true);
    });

    it('distinguishes a field namespace from the property after it', () => {
        const line = '[Contest.Name]';
        expect(has(scopesFor(line, 'Contest'), 'support.type.field-prefix.rr')).toBe(true);
        expect(has(scopesFor(line, '.'), 'punctuation.accessor.rr')).toBe(true);
        expect(has(scopesFor(line, 'Name'), 'variable.other.field.rr')).toBe(true);
    });

    it('scopes a language block inside a string', () => {
        const line = '"{EN:yes|ES:si}"';
        expect(has(scopesFor(line, 'EN'), 'entity.name.tag.language.rr')).toBe(true);
        expect(has(scopesFor(line, '|'), 'punctuation.separator.translation.rr')).toBe(true);
    });
});

describe('grammar: functions', () => {
    it('marks a documented function as a library function', () => {
        expect(has(scopesFor('TSum("Lap{n}"; 1; 10)', 'TSum'), 'support.function.rr')).toBe(true);
    });

    it('is case-insensitive about documented names', () => {
        expect(has(scopesFor('tsum(1)', 'tsum'), 'support.function.rr')).toBe(true);
    });

    it('marks control flow separately', () => {
        expect(has(scopesFor('if([a]; 1; 2)', 'if'), 'keyword.control.conditional.rr')).toBe(true);
    });

    it('does not give an unknown name the library-function scope', () => {
        const scopes = scopesFor('TSumm(1)', 'TSumm');
        expect(has(scopes, 'support.function.rr')).toBe(false);
        expect(has(scopes, 'entity.name.function.rr')).toBe(true);
    });

    it('does not treat a bare name as a function without a call', () => {
        // With no scope of its own it merges into the surrounding run.
        expect(has(scopesAround('TSum + 1', 'TSum'), 'support.function.rr')).toBe(false);
    });
});

describe('grammar: regressions from the old grammar', () => {
    it('does not highlight a function name written inside a string', () => {
        // The string body stays one token: nothing inside it was re-scoped.
        const scopes = scopesAround('"tsum(x)"', 'tsum');
        expect(has(scopes, 'support.function.rr')).toBe(false);
        expect(scopes.some((s) => s.startsWith('string.quoted.double'))).toBe(true);
    });

    it('matches <= and <> as single operators rather than <', () => {
        expect(tokensOf('[a]<=1').map((t) => t.text)).toContain('<=');
        expect(tokensOf('[a]<>1').map((t) => t.text)).toContain('<>');
        expect(tokensOf('[a]>=1').map((t) => t.text)).toContain('>=');
    });

    it('does not match AND inside a word such as RANDOM', () => {
        for (const token of tokensOf('[RANDOM]')) {
            expect(has(token.scopes, 'keyword.operator.logical.rr')).toBe(false);
        }
    });

    it('recognises lower-case word operators', () => {
        expect(has(scopesFor('[a] and [b]', 'and'), 'keyword.operator.logical.rr')).toBe(true);
    });

    it('does not scope digits inside an identifier as a number', () => {
        for (const token of tokensOf('instr2("a"; "b")')) {
            if (token.text.includes('2')) {
                expect(has(token.scopes, 'constant.numeric.rr')).toBe(false);
            }
        }
    });

    it('keeps a full-text expression as text apart from its field references', () => {
        const line = '#My name is [Firstname]';
        expect(
            scopesFor(line, 'My name is ').some((s) => s.startsWith('string.unquoted.fulltext'))
        ).toBe(true);
        expect(has(scopesFor(line, 'Firstname'), 'variable.other.field.rr')).toBe(true);
    });
});
