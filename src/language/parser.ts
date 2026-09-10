/**
 * Precedence-climbing parser for RACE RESULT expressions.
 *
 * Two things are worth knowing about the design:
 *
 * 1. `( ... )` groups become `Paren` nodes rather than being folded away. The
 *    formatter therefore reproduces the author's parentheses exactly and can
 *    never change what an expression means by re-associating it. That also
 *    means the precedence table below only affects internal tree shape, not
 *    output, so an imperfect precedence guess is harmless.
 *
 * 2. A scratch file holds many expressions with no statement terminator. We
 *    split them at a line break that is not a continuation -- see
 *    `startsNewStatement`.
 */

import type { Comment, Expression, Program, Statement } from './ast.js';
import { tokenize, type Token } from './lexer.js';

export class ParseError extends Error {
    constructor(
        message: string,
        readonly start: number,
        readonly end: number
    ) {
        super(message);
        this.name = 'ParseError';
    }
}

/** Binding power per binary operator. Higher binds tighter. */
const PRECEDENCE = new Map<string, number>([
    ['OR', 1],
    ['XOR', 1],
    ['AND', 2],
    ['IN', 3],
    ['NIN', 3],
    ['=', 4],
    ['<>', 4],
    ['<', 4],
    ['>', 4],
    ['<=', 4],
    ['>=', 4],
    ['&', 5],
    ['+', 6],
    ['-', 6],
    ['*', 7],
    ['/', 7],
    ['\\', 7],
    ['%', 7],
    ['^', 8],
    [':', 9]
]);

/** `^` is the only right-associative operator. */
const RIGHT_ASSOCIATIVE = new Set(['^']);

function operatorKey(token: Token): string | undefined {
    if (token.kind === 'operator') {
        return PRECEDENCE.has(token.text) ? token.text : undefined;
    }
    if (token.kind === 'keyword-operator') {
        const upper = token.text.toUpperCase();
        return PRECEDENCE.has(upper) ? upper : undefined;
    }
    return undefined;
}

/**
 * `follower` is the token after the comment. A comment "owns its line" when a
 * line break follows it -- that is what decides whether the formatter puts a
 * hard break or a single space after it.
 */
function toComment(token: Token, follower: Token | undefined): Comment {
    return {
        text: token.text,
        start: token.start,
        end: token.end,
        ownLine: (follower?.newlinesBefore ?? 1) > 0
    };
}

class Parser {
    private pos = 0;
    private pending: Comment[] = [];
    /** Line breaks that preceded the first comment currently in `pending`. */
    private pendingLead = 0;

    constructor(private readonly tokens: Token[]) {}

    /** The token at the cursor, comments included. Never drains anything. */
    private rawPeek(): Token {
        return this.tokens[this.pos];
    }

    /**
     * The next significant token. Any comments in front of it are drained into
     * `pending` so they can be attached to whichever node consumes the token.
     */
    private peek(): Token {
        while (this.tokens[this.pos].kind === 'comment') {
            if (this.pending.length === 0) {
                this.pendingLead = this.tokens[this.pos].newlinesBefore;
            }
            this.pending.push(toComment(this.tokens[this.pos], this.tokens[this.pos + 1]));
            this.pos++;
        }
        return this.tokens[this.pos];
    }

    private next(): Token {
        const token = this.peek();
        if (token.kind !== 'eof') {
            this.pos++;
        }
        return token;
    }

    private takePending(): Comment[] | undefined {
        if (this.pending.length === 0) {
            return undefined;
        }
        const comments = this.pending;
        this.pending = [];
        this.pendingLead = 0;
        return comments;
    }

    /**
     * Attaches a comment sitting on the same line immediately after `node`.
     * We look at the raw stream because peeking would swallow it into
     * `pending` and it would resurface as a *leading* comment on the next node.
     */
    private attachTrailing(node: Expression): void {
        const token = this.rawPeek();
        if (token.kind === 'comment' && token.newlinesBefore === 0) {
            // A trailing comment sits on the node's own line by definition.
            node.trailing = { text: token.text, start: token.start, end: token.end, ownLine: false };
            this.pos++;
        }
    }

    atEnd(): boolean {
        return this.peek().kind === 'eof';
    }

    /** Comments left over after the final expression, so none are ever dropped. */
    drainComments(): Comment[] {
        this.peek();
        return this.takePending() ?? [];
    }

    /**
     * True when a blank line precedes whatever comes next, comments included.
     * Comments may already have been drained into `pending` by an earlier peek,
     * so the answer has to come from `pendingLead` in that case.
     */
    blankLineAhead(): boolean {
        return this.pending.length > 0
            ? this.pendingLead > 1
            : this.rawPeek().newlinesBefore > 1;
    }

    /**
     * True when the upcoming token begins a new top-level expression rather
     * than continuing the current one: it is on a later line and is not a
     * connector. A line starting with an operator is treated as a continuation,
     * which is by far the more common intent in real files.
     */
    startsNewStatement(): boolean {
        const token = this.peek();
        if (token.kind === 'eof' || token.newlinesBefore === 0) {
            return false;
        }
        return (
            operatorKey(token) === undefined &&
            token.kind !== 'rparen' &&
            token.kind !== 'semicolon'
        );
    }

    parseExpression(minPrecedence = 0): Expression {
        let left = this.parseUnary();

        for (;;) {
            const token = this.peek();
            const op = operatorKey(token);
            if (op === undefined) {
                break;
            }
            const precedence = PRECEDENCE.get(op)!;
            if (precedence < minPrecedence) {
                break;
            }

            this.next();
            const nextMin = RIGHT_ASSOCIATIVE.has(op) ? precedence : precedence + 1;
            const right = this.parseExpression(nextMin);
            const node: Expression = {
                type: 'Binary',
                operator: op,
                operatorText: token.text,
                operatorStart: token.start,
                operatorEnd: token.end,
                left,
                right,
                start: left.start,
                end: right.end
            };
            this.attachTrailing(node);
            left = node;
        }

        return left;
    }

    private parseUnary(): Expression {
        const token = this.peek();
        if (token.kind === 'operator' && (token.text === '-' || token.text === '+')) {
            const leading = this.takePending();
            this.next();
            const argument = this.parseUnary();
            const node: Expression = {
                type: 'Unary',
                operator: token.text,
                operatorStart: token.start,
                operatorEnd: token.end,
                argument,
                start: token.start,
                end: argument.end
            };
            if (leading) {
                node.leading = leading;
            }
            return node;
        }
        return this.parsePrimary();
    }

    private parsePrimary(): Expression {
        const token = this.peek();
        const leading = this.takePending();

        const finish = (node: Expression): Expression => {
            if (leading) {
                node.leading = leading;
            }
            this.attachTrailing(node);
            return node;
        };

        switch (token.kind) {
            case 'number':
                this.next();
                return finish({ type: 'Number', raw: token.text, start: token.start, end: token.end });

            case 'string':
                if (token.unterminated) {
                    throw new ParseError('Unterminated string literal.', token.start, token.end);
                }
                this.next();
                return finish({ type: 'String', raw: token.text, start: token.start, end: token.end });

            case 'field':
                if (token.unterminated) {
                    throw new ParseError('Unterminated field reference: missing "]".', token.start, token.end);
                }
                this.next();
                return finish({ type: 'Field', raw: token.text, start: token.start, end: token.end });

            case 'brace':
                if (token.unterminated) {
                    throw new ParseError('Unterminated "{" group: missing "}".', token.start, token.end);
                }
                this.next();
                return finish({ type: 'Brace', raw: token.text, start: token.start, end: token.end });

            case 'fulltext':
                this.next();
                return finish({ type: 'FullText', raw: token.text, start: token.start, end: token.end });

            case 'lparen': {
                this.next();
                const inner = this.parseExpression();
                const close = this.peek();
                if (close.kind !== 'rparen') {
                    throw new ParseError('Expected ")".', close.start, close.end);
                }
                this.next();
                return finish({ type: 'Paren', expression: inner, start: token.start, end: close.end });
            }

            case 'identifier':
                return finish(this.parseIdentifierOrCall(token));

            default:
                throw new ParseError(
                    token.kind === 'eof' ? 'Unexpected end of expression.' : `Unexpected "${token.text}".`,
                    token.start,
                    token.end
                );
        }
    }

    private parseIdentifierOrCall(nameToken: Token): Expression {
        this.next();

        if (this.peek().kind !== 'lparen') {
            return {
                type: 'Identifier',
                name: nameToken.text,
                start: nameToken.start,
                end: nameToken.end
            };
        }

        this.next(); // consume '('
        const args: Expression[] = [];

        if (this.peek().kind !== 'rparen') {
            for (;;) {
                args.push(this.parseExpression());
                if (this.peek().kind !== 'semicolon') {
                    break;
                }
                this.next();
                // A ';' directly before ')' means an intentionally empty final
                // parameter, which RACE RESULT accepts.
                if (this.peek().kind === 'rparen') {
                    break;
                }
            }
        }

        const close = this.peek();
        const dangling = this.takePending();
        if (close.kind !== 'rparen') {
            throw new ParseError(
                `Expected ";" or ")" in call to "${nameToken.text}".`,
                close.start,
                close.end
            );
        }
        this.next();

        const call: Expression = {
            type: 'Call',
            name: nameToken.text,
            nameStart: nameToken.start,
            nameEnd: nameToken.end,
            args,
            start: nameToken.start,
            end: close.end
        };
        if (dangling && dangling.length > 0) {
            call.danglingComments = dangling;
        }
        return call;
    }
}

/**
 * Parses a whole document into a list of top-level expressions.
 *
 * Throws `ParseError` on the first syntax error. Callers are expected to treat
 * that as "leave the document alone" rather than attempt a partial format.
 */
export function parseProgram(src: string): Program {
    const parser = new Parser(tokenize(src));
    const statements: Statement[] = [];

    for (;;) {
        // Read before `atEnd()`: that peeks, and peeking drains any comments
        // in front of the next expression -- taking with them the record of
        // the blank line that preceded them.
        const blankLineBefore = statements.length > 0 && parser.blankLineAhead();
        if (parser.atEnd()) {
            break;
        }

        const expression = parser.parseExpression();
        statements.push({ expression, blankLineBefore });

        if (!parser.atEnd() && !parser.startsNewStatement()) {
            const stray = parser.parseExpression();
            throw new ParseError('Expected a line break between expressions.', stray.start, stray.end);
        }
    }

    const trailingComments = parser.drainComments();
    return trailingComments.length > 0 ? { statements, trailingComments } : { statements };
}

/** Parses a single expression, for callers that already isolated one. */
export function parseExpression(src: string): Expression {
    const program = parseProgram(src);
    if (program.statements.length !== 1) {
        throw new ParseError('Expected exactly one expression.', 0, src.length);
    }
    return program.statements[0].expression;
}
