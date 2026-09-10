/**
 * Extension entry point. Registration only -- all behaviour lives in
 * `src/language`, `src/format` and `src/providers`.
 */

import * as vscode from 'vscode';

import {
    LANGUAGE_ID,
    documentFormattingProvider,
    rangeFormattingProvider
} from './providers/formatting.js';
import { SEMANTIC_TOKENS_LEGEND, semanticTokensProvider } from './providers/semantic.js';
import { createDiagnosticCollection, refreshDiagnostics } from './providers/diagnostics.js';

export function activate(context: vscode.ExtensionContext): void {
    const selector: vscode.DocumentSelector = { language: LANGUAGE_ID, scheme: '*' };

    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(selector, documentFormattingProvider),
        vscode.languages.registerDocumentRangeFormattingEditProvider(selector, rangeFormattingProvider),
        vscode.languages.registerDocumentSemanticTokensProvider(
            selector,
            semanticTokensProvider,
            SEMANTIC_TOKENS_LEGEND
        )
    );

    const diagnostics = createDiagnosticCollection();
    context.subscriptions.push(diagnostics);

    const refresh = (document: vscode.TextDocument): void =>
        refreshDiagnostics(document, diagnostics);

    vscode.workspace.textDocuments.forEach(refresh);
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(refresh),
        vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
        vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('rr')) {
                vscode.workspace.textDocuments.forEach(refresh);
            }
        })
    );
}

export function deactivate(): void {
    // Everything is disposed through context.subscriptions.
}
