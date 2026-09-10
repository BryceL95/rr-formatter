import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.languages.registerDocumentFormattingEditProvider('customlang', {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
            let edits: vscode.TextEdit[] = [];
            const fullRange = new vscode.Range(
                document.lineAt(0).range.start,
                document.lineAt(document.lineCount - 1).range.end
            );

            let formattedText = formatCode(document.getText());
            edits.push(vscode.TextEdit.replace(fullRange, formattedText));

            return edits;
        }
    });

    context.subscriptions.push(disposable);
}

function formatCode(code: string): string {
    return code.split(/\b/).map(word => {
        if (word.match(/^[a-z_][a-z0-9_]*\s*\(/i)) {
            return word.toLowerCase(); // Example: Convert to lowercase
        }
        return word;
    }).join('');
}


export function deactivate() {}
