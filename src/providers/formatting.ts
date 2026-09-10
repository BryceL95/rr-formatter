/**
 * Document and range formatting providers.
 *
 * Both return zero edits when the source does not parse. A formatter that
 * mangles input on a syntax error is worse than one that declines, and the
 * diagnostics provider already shows the user where the problem is.
 */

import * as vscode from 'vscode';

import { DEFAULT_FORMAT_OPTIONS, formatDocument, type FormatOptions } from '../format/format.js';
import { ParseError } from '../language/parser.js';

export const LANGUAGE_ID = 'rr';

/** Reads the user's settings and the editor's own indent/EOL choices. */
export function resolveFormatOptions(
    document: vscode.TextDocument,
    editorOptions: vscode.FormattingOptions
): FormatOptions {
    const config = vscode.workspace.getConfiguration('rr', document);

    return {
        ...DEFAULT_FORMAT_OPTIONS,
        printWidth: config.get<number>('format.printWidth', DEFAULT_FORMAT_OPTIONS.printWidth),
        tabWidth: editorOptions.tabSize,
        useTabs: !editorOptions.insertSpaces,
        eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
        spaceAfterSeparator: config.get<boolean>(
            'format.spaceAfterSeparator',
            DEFAULT_FORMAT_OPTIONS.spaceAfterSeparator
        ),
        spacesAroundOperators: config.get<boolean>(
            'format.spacesAroundOperators',
            DEFAULT_FORMAT_OPTIONS.spacesAroundOperators
        ),
        normalizeFunctionCase: config.get<boolean>(
            'format.normalizeFunctionCase',
            DEFAULT_FORMAT_OPTIONS.normalizeFunctionCase
        ),
        uppercaseLogicalOperators: config.get<boolean>(
            'format.uppercaseLogicalOperators',
            DEFAULT_FORMAT_OPTIONS.uppercaseLogicalOperators
        )
    };
}

/**
 * Formats `text`, returning `undefined` when it cannot be parsed. Any other
 * error is also swallowed into `undefined`: a bug in the formatter must never
 * destroy someone's file.
 */
function tryFormat(text: string, options: FormatOptions): string | undefined {
    try {
        return formatDocument(text, options);
    } catch (error) {
        if (!(error instanceof ParseError)) {
            console.error('[rr] formatter failed unexpectedly', error);
        }
        return undefined;
    }
}

export const documentFormattingProvider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(document, editorOptions) {
        const options = resolveFormatOptions(document, editorOptions);
        const formatted = tryFormat(document.getText(), options);
        if (formatted === undefined) {
            return [];
        }

        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }
};

export const rangeFormattingProvider: vscode.DocumentRangeFormattingEditProvider = {
    provideDocumentRangeFormattingEdits(document, range, editorOptions) {
        // Expand to whole lines so a partial selection still yields a
        // self-contained chunk to parse.
        const expanded = new vscode.Range(
            range.start.line,
            0,
            range.end.line,
            document.lineAt(range.end.line).text.length
        );

        const options = resolveFormatOptions(document, editorOptions);
        const selected = document.getText(expanded);
        const formatted = tryFormat(selected, options);
        if (formatted === undefined) {
            return [];
        }

        // formatDocument always ends with a newline; a range replacement must
        // not introduce one that was not selected.
        const trimmed = formatted.endsWith(options.eol)
            ? formatted.slice(0, -options.eol.length)
            : formatted;

        // Re-indent the block to sit at the selection's original indent.
        const baseIndent = document.lineAt(expanded.start.line).text.match(/^[ \t]*/)?.[0] ?? '';
        const reindented = baseIndent
            ? trimmed
                  .split(options.eol)
                  .map((lineText, index) => (index === 0 || lineText === '' ? lineText : baseIndent + lineText))
                  .join(options.eol)
            : trimmed;

        return [vscode.TextEdit.replace(expanded, baseIndent + reindented)];
    }
};
