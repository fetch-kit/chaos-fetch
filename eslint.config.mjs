import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    // Generated output, never linted.
    ignores: ['coverage/**', 'dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Project overrides, carried over from the previous .eslintrc.json.
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Must stay last: turns off stylistic rules that Prettier owns.
  eslintConfigPrettier,
];
