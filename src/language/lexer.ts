/**
 * Tokeniser for RACE RESULT expressions.
 *
 * Every token carries absolute source offsets so the semantic token provider
 * and the diagnostics provider can map straight back to document positions.
 *
 * The lexer is deliberately forgiving: an unterminated string, field reference
 * or comment produces a token flagged `unterminated` rather than throwing, so
 * highlighting still works while you are mid-keystroke. The parser decides
 * whether that is fatal.
 */

export type TokenKind =
    | 'comment'
    | 'string'
    | 'field'
    | 'brace'
    | 'number'
    | 'identifier'
    | 'keyword-operator'
    | 'operator'
    | 'lparen'
    | 'rparen'
    | 'semicolon'
    | 'fulltext'
    | 'eof';

export interface Token {
    kind: TokenKind;
    /** Exact source text, including delimiters for strings/fields/comments. */
    text: string;
    start: number;
    end: number;
    /** Number of line breaks between the previous token and this one. */
    newlinesBefore: number;
    /** True when a string/field/brace/comment ran to end of input unclosed. */
    unterminated?: boolean;
}

/** Word operators, matched case-insensitively on identifier boundaries. */
export const WORD_OPERATORS: readonly string[] = ['AND', 'OR', 'XOR', 'NIN', 'IN'];

/**
 * Symbolic operators, longest first. Order matters: `<=` and `<>` must be
 * tried before `<`, which is the bug the old grammar had.
 */
const SYMBOL_OPERATORS: readonly string[] = [
    '<=', '>=', '<>', '<', '>', '=', '&', '+', '-', '*', '/', '\\', '%', '^', ':'
];

const WORD_OPERATOR_SET = new Set(WORD_OPERATORS);

function isIdentifierStart(ch: string): boolean {
    return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
    return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
}

/**
 * Reads a delimited run starting at `start` (which sits on the opening
 * delimiter). Returns the index just past the closing delimiter, or -1 if the
 * run never closed.
 */
function scanDelimited(src: string, start: number, close: string): number {
    const index = src.indexOf(close, start + 1);
    return index === -1 ? -1 : index + close.length;
}

export function tokenize(src: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    let newlines = 0;

    const push = (kind: TokenKind, start: number, end: number, unterminated?: boolean): void => {
        const token: Token = {
            kind,
            text: src.slice(start, end),
            start,
            end,
            newlinesBefore: newlines
        };
        if (unterminated) {
            token.unterminated = true;
        }
        tokens.push(token);
        newlines = 0;
    };

    while (i < src.length) {
        const ch = src[i];

        // Whitespace: remember how many line breaks we crossed, then skip.
        if (ch === '\n') {
            newlines++;
            i++;
            continue;
        }
        if (ch === '\r' || ch === ' ' || ch === '\t') {
            i++;
            continue;
        }

        // Block comment. RACE RESULT strips these when the expression is pasted in.
        if (ch === '/' && src[i + 1] === '*') {
            const end = scanDelimited(src, i + 1, '*/');
            if (end === -1) {
                push('comment', i, src.length, true);
                i = src.length;
            } else {
                push('comment', i, end);
                i = end;
            }
            continue;
        }

        // Full-text expression: '#' makes the rest of the line literal text.
        if (ch === '#') {
            let end = src.indexOf('\n', i);
            if (end === -1) {
                end = src.length;
            }
            // Trim trailing whitespace so the token text is newline-free.
            while (end > i && (src[end - 1] === '\r' || src[end - 1] === ' ' || src[end - 1] === '\t')) {
                end--;
            }
            push('fulltext', i, end);
            i = end;
            continue;
        }

        if (ch === '"') {
            const end = scanDelimited(src, i, '"');
            if (end === -1) {
                push('string', i, src.length, true);
                i = src.length;
            } else {
                push('string', i, end);
                i = end;
            }
            continue;
        }

        // Field reference. Braces may nest inside, e.g. [Lap{n}], so the
        // closing ']' is the first one not inside a brace.
        if (ch === '[') {
            let j = i + 1;
            let braceDepth = 0;
            let closed = false;
            while (j < src.length) {
                const c = src[j];
                if (c === '{') {
                    braceDepth++;
                } else if (c === '}') {
                    braceDepth = Math.max(0, braceDepth - 1);
                } else if (c === ']' && braceDepth === 0) {
                    closed = true;
                    j++;
                    break;
                } else if (c === '\n') {
                    break; // a field reference never spans lines
                }
                j++;
            }
            push('field', i, j, !closed);
            i = j;
            continue;
        }

        // Standalone brace group: split selectors and record multipliers.
        if (ch === '{') {
            const end = scanDelimited(src, i, '}');
            if (end === -1) {
                push('brace', i, src.length, true);
                i = src.length;
            } else {
                push('brace', i, end);
                i = end;
            }
            continue;
        }

        if (ch === '(') {
            push('lparen', i, i + 1);
            i++;
            continue;
        }
        if (ch === ')') {
            push('rparen', i, i + 1);
            i++;
            continue;
        }
        if (ch === ';') {
            push('semicolon', i, i + 1);
            i++;
            continue;
        }

        // Number. A '.' only continues the number when a digit follows, so the
        // ':' time operator and dotted field paths are unaffected.
        if (isDigit(ch)) {
            let j = i;
            while (j < src.length && isDigit(src[j])) {
                j++;
            }
            if (src[j] === '.' && isDigit(src[j + 1])) {
                j++;
                while (j < src.length && isDigit(src[j])) {
                    j++;
                }
            }
            push('number', i, j);
            i = j;
            continue;
        }

        if (isIdentifierStart(ch)) {
            let j = i;
            while (j < src.length && isIdentifierPart(src[j])) {
                j++;
            }
            const word = src.slice(i, j);
            push(WORD_OPERATOR_SET.has(word.toUpperCase()) ? 'keyword-operator' : 'identifier', i, j);
            i = j;
            continue;
        }

        const symbol = SYMBOL_OPERATORS.find((op) => src.startsWith(op, i));
        if (symbol) {
            push('operator', i, i + symbol.length);
            i += symbol.length;
            continue;
        }

        // Anything else is a stray character. Emit it as an operator token so
        // the parser can report it with an accurate position.
        push('operator', i, i + 1);
        i++;
    }

    push('eof', src.length, src.length);
    return tokens;
}
