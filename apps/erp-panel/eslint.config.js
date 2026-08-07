import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'scripts', '*.config.js', '*.config.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // `@/mock` is the localStorage database. Everything reaches it through the api.ts seam, so
    // that swapping the seam's internals for HTTP calls is a change in one directory rather
    // than a hunt through the pages. A page importing it directly would keep writing to
    // localStorage after the cutover, and nothing would fail — the data would simply stop
    // being the data everyone else sees.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/services/**', 'src/mock/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/mock', '@/mock/*'],
          message: 'Reach the data through @/services/api, not the mock database directly.',
        }],
      }],
    },
  },
);
