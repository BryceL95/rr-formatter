/** AST node types for RACE RESULT expressions. */

export interface Comment {
    text: string;
    start: number;
    end: number;
    /**
     * True when a line break follows the comment, i.e. it occupies its own
     * line rather than sitting inline before the next token.
     */
    ownLine: boolean;
}

interface NodeBase {
    start: number;
    end: number;
    /** Comments that preceded this node. */
    leading?: Comment[];
    /** A comment that followed this node on the same line. */
    trailing?: Comment;
}

export interface NumberLiteral extends NodeBase {
    type: 'Number';
    raw: string;
}

/** A double-quoted string. `raw` includes the quotes and is never rewritten. */
export interface StringLiteral extends NodeBase {
    type: 'String';
    raw: string;
}

/** A `[Field.Path]` reference. `raw` includes the brackets. */
export interface FieldRef extends NodeBase {
    type: 'Field';
    raw: string;
}

/** A standalone `{...}` group: split selector or record multiplier. */
export interface BraceRef extends NodeBase {
    type: 'Brace';
    raw: string;
}

/** A bare identifier that is not being called, e.g. a user-defined field. */
export interface Identifier extends NodeBase {
    type: 'Identifier';
    name: string;
}

export interface CallExpression extends NodeBase {
    type: 'Call';
    name: string;
    /** Source offsets of the function name itself, for semantic tokens. */
    nameStart: number;
    nameEnd: number;
    args: Expression[];
    /** Comments sitting between the last argument and the closing paren. */
    danglingComments?: Comment[];
}

export interface BinaryExpression extends NodeBase {
    type: 'Binary';
    /** Normalised key: symbols as written, word operators upper-cased. */
    operator: string;
    /** Exactly as the author typed it, so casing can be preserved. */
    operatorText: string;
    operatorStart: number;
    operatorEnd: number;
    left: Expression;
    right: Expression;
}

export interface UnaryExpression extends NodeBase {
    type: 'Unary';
    operator: string;
    operatorStart: number;
    operatorEnd: number;
    argument: Expression;
}

/**
 * An explicit `( ... )` group. Preserved as its own node so the formatter can
 * reproduce the author's parentheses exactly -- it never adds or removes them.
 */
export interface ParenExpression extends NodeBase {
    type: 'Paren';
    expression: Expression;
}

/** A `#...` full-text expression. Reproduced verbatim. */
export interface FullTextExpression extends NodeBase {
    type: 'FullText';
    raw: string;
}

export type Expression =
    | NumberLiteral
    | StringLiteral
    | FieldRef
    | BraceRef
    | Identifier
    | CallExpression
    | BinaryExpression
    | UnaryExpression
    | ParenExpression
    | FullTextExpression;

/** One top-level expression in a scratch file, with the trivia around it. */
export interface Statement {
    expression: Expression;
    /** Blank lines that preceded this statement in the source (capped at 1). */
    blankLineBefore: boolean;
}

export interface Program {
    statements: Statement[];
    /** Comments after the final expression, kept so nothing is ever dropped. */
    trailingComments?: Comment[];
}
