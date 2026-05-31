import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    // `src/engine/maps/sources/*.js` are intentionally bare `function(pixelCount){…}`
    // expressions consumed verbatim via Vite `?raw` (ADR-0008), not ES modules — they
    // can't be parsed standalone and must not be wrapped in `export`.
    ignores: [
      'dist',
      'node_modules',
      'src/pixelblaze/lib',
      'src/pixelblaze/demos',
      'src/engine/maps/sources/**',
      'test/divergence-harness/probe.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
)
