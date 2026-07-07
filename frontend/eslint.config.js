import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Flat config (ESLint 9). Lint stage per dev-setup.md; keeps the frontend honest
// alongside `tsc --noEmit` and the Vitest suite.
//
// Type-aware: `recommendedTypeChecked` pulls in rules that need the type checker
// (e.g. no-floating-promises) — the reason we run ESLint rather than the faster,
// type-blind oxlint. The generated async API client and the audio player make
// unhandled-promise detection worth the extra pass. `projectService` wires the
// checker up from the nearest tsconfig.
export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
)
