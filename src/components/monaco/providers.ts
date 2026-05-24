import type * as monacoType from 'monaco-editor'
import { BUILTIN_FUNCTIONS, BUILTIN_CONSTANTS, resolveSignatureContext } from '@/engine/builtins'
import { PIXELBLAZE_LANG_ID } from './pixelblazeLanguage'

export function registerProviders(monaco: typeof monacoType): void {
  registerCompletion(monaco)
  registerSignatureHelp(monaco)
}

function registerCompletion(monaco: typeof monacoType): void {
  monaco.languages.registerCompletionItemProvider(PIXELBLAZE_LANG_ID, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range: monacoType.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const fnItems = BUILTIN_FUNCTIONS.map((fn) => {
        const hasParams = fn.params.length > 0
        const snippetBody = hasParams
          ? `${fn.name}(${fn.params.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})$0`
          : `${fn.name}()`
        return {
          label: fn.name,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: snippetBody,
          insertTextRules: hasParams
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          range,
        }
      })

      const constItems = BUILTIN_CONSTANTS.map((c) => ({
        label: c.name,
        kind: monaco.languages.CompletionItemKind.Constant,
        insertText: c.name,
        range,
      }))

      return { suggestions: [...fnItems, ...constItems] }
    },
  })
}

function registerSignatureHelp(monaco: typeof monacoType): void {
  monaco.languages.registerSignatureHelpProvider(PIXELBLAZE_LANG_ID, {
    signatureHelpTriggerCharacters: ['('],
    signatureHelpRetriggerCharacters: [','],

    provideSignatureHelp(model, position): monacoType.languages.SignatureHelpResult | null {
      const line = model.getLineContent(position.lineNumber)
      const ctx = resolveSignatureContext(line, position.column - 1)
      if (!ctx) return null

      const fn = BUILTIN_FUNCTIONS.find((f) => f.name === ctx.fnName)
      if (!fn || fn.params.length === 0) return null

      const label = `${fn.name}(${fn.params.join(', ')})`
      const parameters = fn.params.map((p) => ({ label: p }))

      return {
        value: {
          signatures: [{ label, parameters }],
          activeSignature: 0,
          activeParameter: Math.min(ctx.activeParam, fn.params.length - 1),
        },
        dispose() {},
      }
    },
  })
}
