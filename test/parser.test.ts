import { describe, expect, it } from 'vitest';
import { ParseError, parseExpression, parseProgram } from '../src/language/parser.js';
import type { Expression } from '../src/language/ast.js';

/** Renders the tree shape as an s-expression so precedence is easy to assert. */
function shape(node: Expression): string {
    switch (node.type) {
        case 'Number':
        case 'String':
        case 'Field':
        case 'Brace':
        case 'FullText':
            return node.raw;
        case 'Identifier':
            return node.name;
        case 'Unary':
            return `(${node.operator} ${shape(node.argument)})`;
        case 'Paren':
            return `(paren ${shape(node.expression)})`;
        case 'Call':
            return `(${node.name} ${node.args.map(shape).join(' ')})`.replace(' )', ')');
        case 'Binary':
            return `(${node.operator} ${shape(node.left)} ${shape(node.right)})`;
    }
}

describe('parseExpression', () => {
    it('gives multiplication tighter binding than addition', () => {
        expect(shape(parseExpression('1+2*3'))).toBe('(+ 1 (* 2 3))');
    });

    it('gives AND tighter binding than OR', () => {
        expect(shape(parseExpression('[a]=1 AND [b]=2 OR [c]=3'))).toBe(
            '(OR (AND (= [a] 1) (= [b] 2)) (= [c] 3))'
        );
    });

    it('gives concatenation tighter binding than comparison', () => {
        expect(shape(parseExpression('"a" & [b] = "ab"'))).toBe('(= (& "a" [b]) "ab")');
    });

    it('treats ^ as right associative', () => {
        expect(shape(parseExpression('2^3^2'))).toBe('(^ 2 (^ 3 2))');
    });

    it('keeps explicit parentheses in the tree', () => {
        expect(shape(parseExpression('(1+2)*3'))).toBe('(* (paren (+ 1 2)) 3)');
    });

    it('parses nested calls with semicolon-separated parameters', () => {
        expect(shape(parseExpression('if([Bib]=1;left([Name];3);"no")'))).toBe(
            '(if (= [Bib] 1) (left [Name] 3) "no")'
        );
    });

    it('parses a call with no arguments', () => {
        expect(shape(parseExpression('now()'))).toBe('(now)');
    });

    it('parses IN and NIN', () => {
        expect(shape(parseExpression('[Contest] IN "1;2;3"'))).toBe('(IN [Contest] "1;2;3")');
        expect(shape(parseExpression('[Contest] NIN "1"'))).toBe('(NIN [Contest] "1")');
    });

    it('parses unary minus without confusing it for subtraction', () => {
        expect(shape(parseExpression('-[a]'))).toBe('(- [a])');
        expect(shape(parseExpression('1 - -2'))).toBe('(- 1 (- 2))');
    });

    it('parses the time operator', () => {
        expect(shape(parseExpression('1:30:00'))).toBe('(: (: 1 30) 00)');
    });
});

describe('parseProgram', () => {
    it('splits one expression per line', () => {
        const program = parseProgram('[Bib]\n[Lastname]\n');
        expect(program.statements).toHaveLength(2);
        expect(shape(program.statements[0].expression)).toBe('[Bib]');
        expect(shape(program.statements[1].expression)).toBe('[Lastname]');
    });

    it('keeps an already-expanded multi-line expression together', () => {
        const program = parseProgram('if([Bib]=1;\n    "yes";\n    "no"\n)\n');
        expect(program.statements).toHaveLength(1);
        expect(shape(program.statements[0].expression)).toBe('(if (= [Bib] 1) "yes" "no")');
    });

    it('records blank lines between expressions', () => {
        const program = parseProgram('[a]\n\n[b]\n[c]');
        expect(program.statements.map((s) => s.blankLineBefore)).toEqual([false, true, false]);
    });

    it('attaches a leading comment to the expression that follows it', () => {
        const program = parseProgram('/* note */\n[Bib]');
        expect(program.statements[0].expression.leading?.[0].text).toBe('/* note */');
        expect(program.statements[0].expression.leading?.[0].ownLine).toBe(true);
    });

    it('attaches a same-line comment as a trailing comment', () => {
        const expression = parseExpression('[Bib] /* the number */');
        expect(expression.trailing?.text).toBe('/* the number */');
    });

    it('keeps comments that come after the last expression', () => {
        const program = parseProgram('[Bib]\n/* done */');
        expect(program.trailingComments?.[0].text).toBe('/* done */');
    });

    it('reports an unterminated string with a position', () => {
        expect(() => parseProgram('if([a]=1;"yes)')).toThrow(ParseError);
        try {
            parseProgram('"abc');
        } catch (error) {
            expect(error).toBeInstanceOf(ParseError);
            expect((error as ParseError).start).toBe(0);
        }
    });

    it('reports a missing closing parenthesis', () => {
        expect(() => parseProgram('if([a]=1;"y";"n"')).toThrow(ParseError);
    });

    it('does not crash on random punctuation', () => {
        expect(() => parseProgram('@@@')).toThrow(ParseError);
    });
});
