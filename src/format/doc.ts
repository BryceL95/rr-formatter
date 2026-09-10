/**
 * A small Wadler-style document algebra, the same idea Prettier uses.
 *
 * You build a tree describing *where a line break could go* rather than
 * emitting strings directly. The printer then decides, per `group`, whether
 * the whole group fits in the remaining width: if it does the group prints
 * flat and every `line` inside becomes its separator text; if it does not,
 * every `line` directly inside that group becomes a real newline.
 *
 * Doing it this way is what makes "only break when the expression is too long"
 * behave correctly through arbitrary nesting -- hand-rolled width arithmetic
 * gets the nested cases wrong.
 */

export type Doc =
    | string
    | { kind: 'concat'; parts: Doc[] }
    | { kind: 'group'; contents: Doc; shouldBreak: boolean }
    | { kind: 'indent'; contents: Doc }
    | { kind: 'line'; soft: boolean; hard: boolean }
    | { kind: 'if-break'; broken: Doc; flat: Doc };

export function concat(parts: Doc[]): Doc {
    return { kind: 'concat', parts };
}

/**
 * Marks a region that prints flat when it fits. `shouldBreak` forces it to
 * break regardless -- used when a comment inside would otherwise be swallowed.
 */
export function group(contents: Doc, shouldBreak = false): Doc {
    return { kind: 'group', contents, shouldBreak };
}

export function indent(contents: Doc): Doc {
    return { kind: 'indent', contents };
}

/** A space when flat, a newline when broken. */
export const line: Doc = { kind: 'line', soft: false, hard: false };

/** Nothing when flat, a newline when broken. */
export const softline: Doc = { kind: 'line', soft: true, hard: false };

/** Always a newline, and forces every enclosing group to break. */
export const hardline: Doc = { kind: 'line', soft: false, hard: true };

/** Prints `broken` when the enclosing group breaks, `flat` when it does not. */
export function ifBreak(broken: Doc, flat: Doc = ''): Doc {
    return { kind: 'if-break', broken, flat };
}

export function join(separator: Doc, parts: Doc[]): Doc {
    const result: Doc[] = [];
    parts.forEach((part, index) => {
        if (index > 0) {
            result.push(separator);
        }
        result.push(part);
    });
    return concat(result);
}

/** True when the doc contains a hardline, which must force enclosing groups. */
function containsHardline(doc: Doc): boolean {
    if (typeof doc === 'string') {
        return false;
    }
    switch (doc.kind) {
        case 'concat':
            return doc.parts.some(containsHardline);
        case 'group':
            return doc.shouldBreak || containsHardline(doc.contents);
        case 'indent':
            return containsHardline(doc.contents);
        case 'line':
            return doc.hard;
        case 'if-break':
            return containsHardline(doc.broken);
    }
}

type Mode = 'flat' | 'break';
type Command = [indentLevel: number, mode: Mode, doc: Doc];

/**
 * Does `next` plus the already-queued rest of the line fit in `width`?
 * Measures in flat mode until it reaches a break-mode newline.
 */
function fits(next: Command, restCommands: Command[], width: number): boolean {
    let remaining = width;
    const queue: Command[] = [next];
    let restIndex = restCommands.length;

    while (remaining >= 0) {
        if (queue.length === 0) {
            if (restIndex === 0) {
                return true;
            }
            restIndex--;
            queue.push(restCommands[restIndex]);
            continue;
        }

        const [indentLevel, mode, doc] = queue.pop()!;

        if (typeof doc === 'string') {
            remaining -= doc.length;
            continue;
        }

        switch (doc.kind) {
            case 'concat':
                for (let i = doc.parts.length - 1; i >= 0; i--) {
                    queue.push([indentLevel, mode, doc.parts[i]]);
                }
                break;
            case 'group':
                queue.push([indentLevel, doc.shouldBreak ? 'break' : mode, doc.contents]);
                break;
            case 'indent':
                queue.push([indentLevel + 1, mode, doc.contents]);
                break;
            case 'if-break':
                queue.push([indentLevel, mode, mode === 'break' ? doc.broken : doc.flat]);
                break;
            case 'line':
                if (mode === 'break' || doc.hard) {
                    return true; // the line ends here, so everything so far fits
                }
                remaining -= doc.soft ? 0 : 1;
                break;
        }
    }

    return false;
}

export interface PrintOptions {
    /** Target maximum line length. */
    width: number;
    /** Spaces per indent level. */
    tabWidth: number;
    /** Indent with a tab character instead of spaces. */
    useTabs?: boolean;
    /** Line terminator. */
    eol?: string;
}

export function printDoc(doc: Doc, options: PrintOptions): string {
    const { width, tabWidth, useTabs = false, eol = '\n' } = options;
    const out: string[] = [];
    let position = 0;

    const commands: Command[] = [[0, 'break', doc]];

    const indentString = (level: number): string =>
        useTabs ? '\t'.repeat(level) : ' '.repeat(level * tabWidth);

    while (commands.length > 0) {
        const [indentLevel, mode, current] = commands.pop()!;

        if (typeof current === 'string') {
            out.push(current);
            position += current.length;
            continue;
        }

        switch (current.kind) {
            case 'concat':
                for (let i = current.parts.length - 1; i >= 0; i--) {
                    commands.push([indentLevel, mode, current.parts[i]]);
                }
                break;

            case 'indent':
                commands.push([indentLevel + 1, mode, current.contents]);
                break;

            case 'if-break':
                commands.push([indentLevel, mode, mode === 'break' ? current.broken : current.flat]);
                break;

            case 'group': {
                const forced = current.shouldBreak || containsHardline(current.contents);
                if (!forced && fits([indentLevel, 'flat', current.contents], commands, width - position)) {
                    commands.push([indentLevel, 'flat', current.contents]);
                } else {
                    commands.push([indentLevel, 'break', current.contents]);
                }
                break;
            }

            case 'line': {
                if (mode === 'flat' && !current.hard) {
                    if (!current.soft) {
                        out.push(' ');
                        position += 1;
                    }
                    break;
                }
                // Trim trailing spaces before the break.
                while (out.length > 0 && /^[ \t]+$/.test(out[out.length - 1])) {
                    out.pop();
                }
                const prefix = indentString(indentLevel);
                out.push(eol + prefix);
                position = prefix.length;
                break;
            }
        }
    }

    return out.join('');
}
