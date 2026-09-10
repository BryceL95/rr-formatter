/**
 * Fixture test: formats `fixtures/input.rr` and compares it against
 * `fixtures/input.expected.rr`.
 *
 * The point of this test, over the focused unit tests, is that the expected
 * file is readable output you can eyeball in review. To accept a deliberate
 * change in behaviour, delete the expected file and run the tests once: it is
 * regenerated, and the diff shows exactly what moved.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatDocument } from '../src/format/format.js';
import { tokenize } from '../src/language/lexer.js';
import { canonicalFunctionName } from '../src/language/functions.js';

const fixturesDir = join(__dirname, 'fixtures');
const inputPath = join(fixturesDir, 'input.rr');
const expectedPath = join(fixturesDir, 'input.expected.rr');

/** Meaning-carrying tokens only, so layout changes are invisible here. */
function meaning(src: string): string {
    return tokenize(src)
        .filter((t) => t.kind !== 'eof' && t.kind !== 'comment')
        .map((t) =>
            t.kind === 'identifier'
                ? canonicalFunctionName(t.text)
                : t.kind === 'keyword-operator'
                  ? t.text.toUpperCase()
                  : t.text
        )
        .join(' ');
}

describe('fixtures', () => {
    const input = readFileSync(inputPath, 'utf8').replace(/\r\n/g, '\n');
    const actual = formatDocument(input);

    it('matches the recorded output', () => {
        if (!existsSync(expectedPath)) {
            writeFileSync(expectedPath, actual, 'utf8');
        }
        const expected = readFileSync(expectedPath, 'utf8').replace(/\r\n/g, '\n');
        expect(actual).toBe(expected);
    });

    it('is idempotent', () => {
        expect(formatDocument(actual)).toBe(actual);
    });

    it('preserves meaning', () => {
        expect(meaning(actual)).toBe(meaning(input));
    });

    it('leaves no trailing whitespace', () => {
        for (const lineText of actual.split('\n')) {
            expect(lineText, 'trailing whitespace').toBe(lineText.trimEnd());
        }
    });
});

describe('shipped example', () => {
    // examples/scratch.rr is opened automatically by the F5 launch config, so
    // it must parse and must already be in formatted form.
    const examplePath = join(__dirname, '..', 'examples', 'scratch.rr');
    const source = readFileSync(examplePath, 'utf8').replace(/\r\n/g, '\n');

    it('parses and is stable under formatting', () => {
        const formatted = formatDocument(source);
        expect(formatDocument(formatted)).toBe(formatted);
        expect(meaning(formatted)).toBe(meaning(source));
    });
});
