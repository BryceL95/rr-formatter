/**
 * Formatting policy: AST -> Doc -> text.
 *
 * All layout decisions live here. The printer in `doc.ts` knows nothing about
 * RACE RESULT, and the parser knows nothing about layout.
 *
 * Invariants this module is required to hold, and which the tests assert:
 *   - Parentheses are never added or removed.
 *   - String literals are reproduced byte for byte.
 *   - Full-text (`#...`) expressions are reproduced byte for byte.
 *   - Formatting is idempotent.
 */

import type { Comment, Expression, Program } from '../language/ast.js';
import { parseProgram } from '../language/parser.js';
import { canonicalFunctionName } from '../language/functions.js';
import {
    concat,
    group,
    hardline,
    indent,
    line,
    printDoc,
    softline,
    type Doc
} from './doc.js';

export interface FormatOptions {
    printWidth: number;
    tabWidth: number;
    useTabs: boolean;
    eol: string;
    spaceAfterSeparator: boolean;
    spacesAroundOperators: boolean;
    normalizeFunctionCase: boolean;
    uppercaseLogicalOperators: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
    printWidth: 80,
    tabWidth: 4,
    useTabs: false,
    eol: '\n',
    spaceAfterSeparator: true,
    spacesAroundOperators: true,
    normalizeFunctionCase: true,
    uppercaseLogicalOperators: true
};

/** Word operators that get uppercased when the setting is on. */
const WORD_OPERATORS = new Set(['AND', 'OR', 'XOR', 'IN', 'NIN']);

/** The time operator binds its operands tightly and is never spaced or broken. */
const TIME_OPERATOR = ':';

function isWordOperator(operator: string): boolean {
    return WORD_OPERATORS.has(operator.toUpperCase());
}

class Formatter {
    constructor(private readonly options: FormatOptions) {}

    /**
     * How an operator is written out. Word operators keep the author's casing
     * unless the uppercase setting is on; symbols are already canonical.
     */
    private renderOperator(operator: string, sourceText: string): string {
        if (isWordOperator(operator)) {
            return this.options.uppercaseLogicalOperators ? operator.toUpperCase() : sourceText;
        }
        return operator;
    }

    private comment(comment: Comment): Doc {
        return comment.text;
    }

    /** Comments in front of a node, each on its own line if it was written that way. */
    private leading(node: Expression): Doc[] {
        if (!node.leading || node.leading.length === 0) {
            return [];
        }
        return node.leading.map((comment) =>
            concat([this.comment(comment), comment.ownLine ? hardline : ' '])
        );
    }

    /** The node itself plus any same-line trailing comment, but no leading ones. */
    private bareWithTrailing(node: Expression): Doc {
        const body = this.bare(node);
        return node.trailing ? concat([body, ' ', this.comment(node.trailing)]) : body;
    }

    expression(node: Expression): Doc {
        const leading = this.leading(node);
        const body = this.bareWithTrailing(node);
        return leading.length === 0 ? body : concat([...leading, body]);
    }

    private bare(node: Expression): Doc {
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
                // No space: `-1`, not `- 1`.
                return concat([node.operator, this.expression(node.argument)]);

            case 'Paren':
                return group(
                    concat([
                        '(',
                        indent(concat([softline, this.expression(node.expression)])),
                        softline,
                        ')'
                    ])
                );

            case 'Call':
                return this.call(node);

            case 'Binary':
                return this.binary(node);
        }
    }

    private call(node: Extract<Expression, { type: 'Call' }>): Doc {
        const name = this.options.normalizeFunctionCase
            ? canonicalFunctionName(node.name)
            : node.name;

        if (node.args.length === 0 && !node.danglingComments) {
            return concat([name, '()']);
        }

        // `; ` between arguments when flat, `;` then a newline when broken.
        const separator = concat([
            ';',
            this.options.spaceAfterSeparator ? line : softline
        ]);

        const args: Doc[] = [];
        node.args.forEach((arg, index) => {
            if (index > 0) {
                args.push(separator);
            }
            args.push(this.expression(arg));
        });

        if (node.danglingComments) {
            for (const comment of node.danglingComments) {
                args.push(comment.ownLine ? hardline : ' ', this.comment(comment));
            }
        }

        return group(
            concat([name, '(', indent(concat([softline, ...args])), softline, ')'])
        );
    }

    /**
     * Renders a run of same-precedence binary operators as one group, so a long
     * concatenation chain breaks all at once rather than nesting deeper on each
     * operand. Continuation lines are indented and start with the operator:
     *
     *     [Firstname]
     *         & " "
     *         & [Lastname]
     */
    private binary(node: Extract<Expression, { type: 'Binary' }>): Doc {
        if (node.operator === TIME_OPERATOR) {
            // `1:30:00` -- never spaced, never broken.
            return concat([
                this.expression(node.left),
                TIME_OPERATOR,
                this.expression(node.right)
            ]);
        }

        const chain = this.flattenChain(node);
        const first = chain.operands[0];

        // A leading comment on the first operand is hoisted out of the group.
        // Left inside, its hard break would force the whole chain to expand
        // even when the expression itself comfortably fits on one line.
        const hoisted = this.leading(first);
        const head = this.bareWithTrailing(first);
        const tail: Doc[] = [];

        for (let i = 1; i < chain.operands.length; i++) {
            const { key, text } = chain.operators[i - 1];
            const operator = this.renderOperator(key, text);
            // Word operators must always be spaced or they would fuse with
            // their operands; only symbols honour the spacing setting.
            const spaced = this.options.spacesAroundOperators || isWordOperator(key);
            tail.push(
                spaced ? line : softline,
                operator,
                spaced ? ' ' : '',
                this.expression(chain.operands[i])
            );
        }

        const chainDoc = group(concat([head, indent(concat(tail))]));
        return hoisted.length === 0 ? chainDoc : concat([...hoisted, chainDoc]);
    }

    /**
     * Collects a left-leaning tree of operators at the same precedence into a
     * flat operand/operator list. Word operators are only chained with other
     * word operators so `AND`/`OR` mixes keep their tree shape.
     */
    private flattenChain(node: Extract<Expression, { type: 'Binary' }>): {
        operands: Expression[];
        operators: { key: string; text: string }[];
    } {
        const operands: Expression[] = [];
        const operators: { key: string; text: string }[] = [];

        const walk = (current: Expression): void => {
            if (
                current.type === 'Binary' &&
                current.operator === node.operator &&
                !current.leading &&
                !current.trailing
            ) {
                walk(current.left);
                operators.push({ key: current.operator, text: current.operatorText });
                operands.push(current.right);
                return;
            }
            operands.push(current);
        };

        walk(node.left);
        operators.push({ key: node.operator, text: node.operatorText });
        operands.push(node.right);

        return { operands, operators };
    }

    /**
     * Detaches comments sitting at the very start of an expression by walking
     * down its left spine. Those comments end with a hard break, and a hard
     * break trapped inside a group forces the group to expand -- which would
     * make a one-line expression sprawl just because it has a comment above it.
     *
     * Mutates the tree, which is safe: the AST is re-parsed on every format.
     */
    private hoistLeadingComments(node: Expression): Comment[] {
        const collected: Comment[] = [];
        let current: Expression | undefined = node;

        while (current) {
            if (current.leading && current.leading.length > 0) {
                collected.push(...current.leading);
                current.leading = undefined;
            }
            // Do not descend into a call's arguments or inside parentheses:
            // a comment there is genuinely nested, not leading the statement.
            if (current.type === 'Binary') {
                current = current.left;
            } else if (current.type === 'Unary') {
                current = current.argument;
            } else {
                current = undefined;
            }
        }

        return collected;
    }

    program(program: Program): Doc {
        const parts: Doc[] = [];

        program.statements.forEach((statement, index) => {
            if (index > 0) {
                parts.push(hardline);
                if (statement.blankLineBefore) {
                    parts.push(hardline);
                }
            }
            for (const comment of this.hoistLeadingComments(statement.expression)) {
                parts.push(this.comment(comment), comment.ownLine ? hardline : ' ');
            }
            parts.push(this.expression(statement.expression));
        });

        if (program.trailingComments) {
            for (const comment of program.trailingComments) {
                if (parts.length > 0) {
                    parts.push(hardline);
                }
                parts.push(this.comment(comment));
            }
        }

        return concat(parts);
    }
}

/** Formats a whole document. Throws `ParseError` if the source is not valid. */
export function formatDocument(source: string, options: Partial<FormatOptions> = {}): string {
    const resolved: FormatOptions = { ...DEFAULT_FORMAT_OPTIONS, ...options };
    const program = parseProgram(source);

    if (program.statements.length === 0 && !program.trailingComments) {
        return '';
    }

    const formatter = new Formatter(resolved);
    const text = printDoc(formatter.program(program), {
        width: resolved.printWidth,
        tabWidth: resolved.tabWidth,
        useTabs: resolved.useTabs,
        eol: resolved.eol
    });

    return text + resolved.eol;
}
