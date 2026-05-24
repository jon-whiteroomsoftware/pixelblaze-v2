import type * as monacoType from 'monaco-editor'

export const PIXELBLAZE_LANG_ID = 'pixelblaze'

const RENDER_FNS = ['render', 'render2D', 'beforeRender', 'afterRender']

const COLOR_FNS = ['hsv', 'rgb']

const WAVEFORM_FNS = ['time', 'wave', 'triangle', 'square', 'clamp', 'map']

const MATH_FNS = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan2',
  'abs', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'log', 'log2',
  'min', 'max', 'random',
]

const CONSTANTS = ['PI', 'E', 'pixelCount']

const NAMESPACES = ['sdf', 'color', 'noise', 'coord', 'anim']

const BUILTINS = [...RENDER_FNS, ...COLOR_FNS, ...WAVEFORM_FNS, ...MATH_FNS, ...CONSTANTS]

const JS_KEYWORDS = [
  'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof',
  'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var',
  'void', 'while', 'with', 'export', 'true', 'false', 'null', 'undefined',
]

export function registerPixelblazeLanguage(monaco: typeof monacoType): void {
  if (monaco.languages.getLanguages().some((l) => l.id === PIXELBLAZE_LANG_ID)) return

  monaco.languages.register({ id: PIXELBLAZE_LANG_ID, extensions: ['.pb'] })

  monaco.languages.setMonarchTokensProvider(PIXELBLAZE_LANG_ID, {
    keywords: JS_KEYWORDS,
    builtins: BUILTINS,
    namespaces: NAMESPACES,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4})/,
    symbols: /[=><!~?:&|+*/^%-]+/,
    operators: [
      '=', '>', '<', '!', '~', '?', ':',
      '==', '<=', '>=', '!=', '&&', '||', '++', '--',
      '+', '-', '*', '/', '%', '&', '|', '^',
      '+=', '-=', '*=', '/=', '%=',
    ],
    tokenizer: {
      root: [
        [
          /[a-zA-Z_$][\w$]*/,
          {
            cases: {
              '@builtins': 'support.function',
              '@namespaces': 'support.class',
              '@keywords': 'keyword',
              '@default': 'identifier',
            },
          },
        ],
        { include: '@whitespace' },
        [/[{}()[\]]/, '@brackets'],
        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
        [/\d*\.\d+([eE][+-]?\d+)?/, 'number.float'],
        [/0[xX][0-9a-fA-F]+/, 'number.hex'],
        [/\d+/, 'number'],
        [/[;,.]/, 'delimiter'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, { token: 'string.quote', bracket: '@open', next: '@string_double' }],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/'/, { token: 'string.quote', bracket: '@open', next: '@string_single' }],
      ],
      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\*/, 'comment', '@block_comment'],
        [/\/\/.*$/, 'comment'],
      ],
      block_comment: [
        [/[^/*]+/, 'comment'],
        [/\/\*/, 'comment', '@push'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
      string_double: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],
      string_single: [
        [/[^\\']+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],
    },
  } as monacoType.languages.IMonarchLanguage)

  monaco.editor.defineTheme('pixelblaze-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'support.function', foreground: '4FC1FF', fontStyle: 'bold' },
      { token: 'support.class',    foreground: 'C8A4FF' },
      { token: 'keyword',          foreground: 'C586C0' },
      { token: 'comment',          foreground: '6A9955', fontStyle: 'italic' },
      { token: 'string',           foreground: 'CE9178' },
      { token: 'string.quote',     foreground: 'CE9178' },
      { token: 'string.escape',    foreground: 'D7BA7D' },
      { token: 'number',           foreground: 'B5CEA8' },
      { token: 'number.float',     foreground: 'B5CEA8' },
      { token: 'number.hex',       foreground: 'B5CEA8' },
      { token: 'operator',         foreground: 'D4D4D4' },
      { token: 'identifier',       foreground: '9CDCFE' },
      { token: 'delimiter',        foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background':                  '#09090B',
      'editor.foreground':                  '#F4F4F5',
      'editorLineNumber.foreground':        '#52525B',
      'editorLineNumber.activeForeground':  '#A1A1AA',
      'editor.selectionBackground':         '#264F78',
      'editor.lineHighlightBackground':     '#18181B',
      'editorCursor.foreground':            '#4FC1FF',
      'editor.inactiveSelectionBackground': '#3A3D41',
    },
  })
}
