/**
 * Semantic token provider.
 *
 * It deliberately does *not* re-colour everything the TextMate grammar already
 * gets right (strings, comments, numbers, symbol operators). Semantic tokens
 * override the grammar wherever they apply, so blanket-tokenising a string
 * would wipe out the nested `{EN:..|ES:..}` highlighting.
 *
 * What it adds is the information a regex cannot know:
 *   - whether a called name is a documented RACE RESULT function, so a typo
 *     visibly loses its colour;
 *   - which dotted segments of `[Contest.Name]` are the namespace.
 */

import * as vscode from 'vscode';

import type { Expression, Program } from '../language/ast.js';
import { parseProgram } from '../language/parser.js';
import { isControlFunction, isKnownFunction } from '../language/functions.js';
import { isNamespaceSegment } from '../language/fields.js';

const TOKEN_TYPES = ['function', 'keyword', 'variable', 'property', 'namespace', 'operator'] as const;
const TOKEN_MODIFIERS = ['defaultLibrary'] as const;

export const SEMANTIC_TOKENS_LEGEND = new vscode.SemanticTokensLegend(
    [...TOKEN_TYPES],
    [...TOKEN_MODIFIERS]
);

type TokenType = (typeof TOKEN_TYPES)[number];

/** Splits a `[...]` body into dotted segments, ignoring dots inside braces. */
function fieldSegments(body: string): { text: string; offset: number }[] {
    const segments: { text: string; offset: number }[] = [];
    let depth = 0;
    let start = 0;

    for (let i = 0; i <= body.length; i++) {
        const ch = body[i];
        if (ch === '{') {
            depth++;
        } else if (ch === '}') {
            depth = Math.max(0, depth - 1);
        } else if ((ch === '.' && depth === 0) || i === body.length) {
            segments.push({ text: body.slice(start, i), offset: start });
            start = i + 1;
        }
    }

    return segments;
}

interface CollectedToken {
    start: number;
    end: number;
    type: TokenType;
    modifier?: string;
}

class TokenCollector {
    /**
     * Tokens are gathered here rather than pushed straight to the builder,
     * because an AST walk visits a binary operator before its left operand and
     * the builder expects document order.
     */
    private readonly tokens: CollectedToken[] = [];

    private add(start: number, end: number, type: TokenType, modifier?: string): void {
        if (end > start) {
            this.tokens.push({ start, end, type, modifier });
        }
    }

    /** Sorts, then emits, skipping anything that would span more than one line. */
    flush(document: vscode.TextDocument, builder: vscode.SemanticTokensBuilder): void {
        this.tokens.sort((a, b) => a.start - b.start || a.end - b.end);
        for (const token of this.tokens) {
            const from = document.positionAt(token.start);
            const to = document.positionAt(token.end);
            if (from.line !== to.line) {
                continue;
            }
            builder.push(new vscode.Range(from, to), token.type, token.modifier ? [token.modifier] : []);
        }
    }

    expression(node: Expression): void {
        switch (node.type) {
            case 'Call': {
                const known = isKnownFunction(node.name);
                const type: TokenType = isControlFunction(node.name) ? 'keyword' : 'function';
                this.add(node.nameStart, node.nameEnd, type, known ? 'defaultLibrary' : undefined);
                node.args.forEach((arg) => this.expression(arg));
                break;
            }

            case 'Field': {
                // `raw` includes the brackets; the body starts one char in.
                const bodyStart = node.start + 1;
                const body = node.raw.slice(1, node.raw.endsWith(']') ? -1 : undefined);
                let inNamespace = true;
                for (const segment of fieldSegments(body)) {
                    if (segment.text.length === 0) {
                        continue;
                    }
                    const isNamespace = inNamespace && isNamespaceSegment(segment.text);
                    if (!isNamespace) {
                        inNamespace = false;
                    }
                    this.add(
                        bodyStart + segment.offset,
                        bodyStart + segment.offset + segment.text.length,
                        isNamespace ? 'namespace' : 'property'
                    );
                }
                break;
            }

            case 'Identifier':
                this.add(node.start, node.end, 'variable');
                break;

            case 'Binary':
                // Word operators read as keywords; symbols are already correct
                // from the grammar, so only AND/OR/XOR/IN/NIN are re-marked.
                if (/^[A-Za-z]+$/.test(node.operatorText)) {
                    this.add(node.operatorStart, node.operatorEnd, 'keyword');
                }
                this.expression(node.left);
                this.expression(node.right);
                break;

            case 'Unary':
                this.expression(node.argument);
                break;

            case 'Paren':
                this.expression(node.expression);
                break;

            case 'Number':
            case 'String':
            case 'Brace':
            case 'FullText':
                break;
        }
    }

    program(program: Program): void {
        for (const statement of program.statements) {
            this.expression(statement.expression);
        }
    }
}

export const semanticTokensProvider: vscode.DocumentSemanticTokensProvider = {
    provideDocumentSemanticTokens(document) {
        const builder = new vscode.SemanticTokensBuilder(SEMANTIC_TOKENS_LEGEND);
        try {
            const collector = new TokenCollector();
            collector.program(parseProgram(document.getText()));
            collector.flush(document, builder);
        } catch {
            // Mid-edit the document often does not parse. Fall back to the
            // grammar rather than flickering the whole file's colours.
        }
        return builder.build();
    }
};
