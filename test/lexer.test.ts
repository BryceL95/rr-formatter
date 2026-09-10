import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/language/lexer.js';

/** Compact view of the token stream: kind:text pairs, EOF dropped. */
function kinds(src: string): string[] {
    return tokenize(src)
        .filter((t) => t.kind !== 'eof')
        .map((t) => `${t.kind}:${t.text}`);
}

describe('tokenize', () => {
    it('reads a simple call', () => {
        expect(kinds('if([Bib]=1;"yes";"no")')).toEqual([
            'identifier:if',
            'lparen:(',
            'field:[Bib]',
            'operator:=',
            'number:1',
            'semicolon:;',
            'string:"yes"',
            'semicolon:;',
            'string:"no"',
            'rparen:)'
        ]);
    });

    it('keeps a dotted field reference as one token', () => {
        expect(kinds('[Contest.Name]')).toEqual(['field:[Contest.Name]']);
    });

    it('keeps braces nested inside a field reference', () => {
        expect(kinds('[Lap{n}]')).toEqual(['field:[Lap{n}]']);
    });

    it('does not split a string on a semicolon or a language block', () => {
        expect(kinds('"a;b" & "{EN:yes|ES:si}"')).toEqual([
            'string:"a;b"',
            'operator:&',
            'string:"{EN:yes|ES:si}"'
        ]);
    });

    it('matches multi-character comparison operators as one token', () => {
        expect(kinds('a<>b')).toEqual(['identifier:a', 'operator:<>', 'identifier:b']);
        expect(kinds('a<=b')).toEqual(['identifier:a', 'operator:<=', 'identifier:b']);
        expect(kinds('a>=b')).toEqual(['identifier:a', 'operator:>=', 'identifier:b']);
        expect(kinds('a<b')).toEqual(['identifier:a', 'operator:<', 'identifier:b']);
    });

    it('recognises word operators but not words that merely contain them', () => {
        expect(kinds('[a] AND [b]')).toEqual(['field:[a]', 'keyword-operator:AND', 'field:[b]']);
        expect(kinds('[a] and [b]')).toEqual(['field:[a]', 'keyword-operator:and', 'field:[b]']);
        // The old grammar highlighted the AND inside RANDOM.
        expect(kinds('RANDOM')).toEqual(['identifier:RANDOM']);
    });

    it('reads the time operator between numbers', () => {
        expect(kinds('1:30')).toEqual(['number:1', 'operator::', 'number:30']);
    });

    it('reads decimals but leaves a trailing dot alone', () => {
        expect(kinds('1.5')).toEqual(['number:1.5']);
        expect(kinds('1.')).toEqual(['number:1', 'operator:.']);
    });

    it('reads block comments', () => {
        expect(kinds('/* note */ [Bib]')).toEqual(['comment:/* note */', 'field:[Bib]']);
    });

    it('takes a full-text expression to the end of the line', () => {
        expect(kinds('#Name: [Firstname] [Lastname]\n[Bib]')).toEqual([
            'fulltext:#Name: [Firstname] [Lastname]',
            'field:[Bib]'
        ]);
    });

    it('flags unterminated constructs instead of throwing', () => {
        expect(tokenize('"abc')[0].unterminated).toBe(true);
        expect(tokenize('[abc')[0].unterminated).toBe(true);
        expect(tokenize('/* abc')[0].unterminated).toBe(true);
    });

    it('counts line breaks between tokens', () => {
        const tokens = tokenize('[a]\n\n[b]');
        expect(tokens[1].newlinesBefore).toBe(2);
    });
});
