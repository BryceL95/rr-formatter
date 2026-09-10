/**
 * Syntax diagnostics.
 *
 * The parser already reports the first syntax error with a source range, so
 * this is mostly plumbing. It also warns about function names that are called
 * but are not in the documented catalogue -- almost always a typo, and the
 * reason the semantic token provider leaves them uncoloured.
 */

import * as vscode from 'vscode';

import { tokenize } from '../language/lexer.js';
import { ParseError, parseProgram } from '../language/parser.js';
import { canonicalFunctionName, isKnownFunction } from '../language/functions.js';

export function createDiagnosticCollection(): vscode.DiagnosticCollection {
    return vscode.languages.createDiagnosticCollection('rr');
}

function rangeOf(document: vscode.TextDocument, start: number, end: number): vscode.Range {
    return new vscode.Range(document.positionAt(start), document.positionAt(Math.max(end, start + 1)));
}

/**
 * Walks every `name(` in the document once, reporting names that are not in
 * the catalogue (usually typos) and known names written with unusual casing.
 */
function functionNameDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const tokens = tokenize(document.getText());

    for (let i = 0; i < tokens.length - 1; i++) {
        const token = tokens[i];
        if (token.kind !== 'identifier' || tokens[i + 1].kind !== 'lparen') {
            continue;
        }

        const range = rangeOf(document, token.start, token.end);

        if (!isKnownFunction(token.text)) {
            const diagnostic = new vscode.Diagnostic(
                range,
                `"${token.text}" is not a documented RACE RESULT function. If it is a user-defined function, you can ignore this.`,
                vscode.DiagnosticSeverity.Information
            );
            diagnostic.source = 'rr';
            diagnostic.code = 'unknown-function';
            diagnostics.push(diagnostic);
            continue;
        }

        const canonical = canonicalFunctionName(token.text);
        if (canonical !== token.text) {
            const diagnostic = new vscode.Diagnostic(
                range,
                `"${token.text}" is normally written "${canonical}". Formatting the document will fix this.`,
                vscode.DiagnosticSeverity.Hint
            );
            diagnostic.source = 'rr';
            diagnostic.code = 'function-casing';
            diagnostics.push(diagnostic);
        }
    }

    return diagnostics;
}

export function refreshDiagnostics(
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection
): void {
    if (document.languageId !== 'rr') {
        return;
    }

    const enabled = vscode.workspace
        .getConfiguration('rr', document)
        .get<boolean>('diagnostics.enabled', true);

    if (!enabled) {
        collection.delete(document.uri);
        return;
    }

    const diagnostics: vscode.Diagnostic[] = [];

    try {
        parseProgram(document.getText());
        // Only report the softer findings once the file actually parses --
        // otherwise a half-typed line produces a cascade of noise.
        diagnostics.push(...functionNameDiagnostics(document));
    } catch (error) {
        if (error instanceof ParseError) {
            const diagnostic = new vscode.Diagnostic(
                rangeOf(document, error.start, error.end),
                error.message,
                vscode.DiagnosticSeverity.Error
            );
            diagnostic.source = 'rr';
            diagnostics.push(diagnostic);
        }
    }

    collection.set(document.uri, diagnostics);
}
