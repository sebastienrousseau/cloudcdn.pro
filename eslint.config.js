// ESLint flat config.
//
// Complexity ceilings per function (see ~/Code/AGENTS.md §0): cyclomatic 10,
// cognitive 15, Halstead difficulty 30, 60 lines; 500 lines per file.
// Existing offenders live in eslint-suppressions.json, the committed
// baseline. It may only shrink: CI fails on a new violation and on a
// suppression that no longer matches (run `npm run lint:prune` after
// fixing one).

import js from '@eslint/js';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import halstead from './eslint-rules/halstead.js';

const complexityRules = {
  complexity: ['error', 10],
  'sonarjs/cognitive-complexity': ['error', 15],
  'local/halstead-difficulty': ['error', 30],
  'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
  'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/coverage/**',
      'vendor/**',
      '**/*.min.js',
      'playwright-report/**',
      'test-results/**',
      '.wrangler/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    plugins: {
      sonarjs,
      local: { rules: { 'halstead-difficulty': halstead } },
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.serviceworker },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: complexityRules,
  },
  {
    // Classic browser scripts served from the CDN.
    files: ['cdn/**/*.js'],
    ignores: ['cdn/en/api-reference/clients/javascript.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['cdn/en/api-reference/clients/javascript.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Cloudflare Workers runtime global.
    files: ['functions/**/*.js', 'workers/**/*.js'],
    languageOptions: { globals: { WebSocketPair: 'readonly' } },
  },
  {
    // Tests run under happy-dom; describe()/it() wrappers are not units of
    // code, so the per-function line ceiling does not apply to them. Every
    // other ceiling still does.
    files: ['**/tests/**/*.{js,mjs}'],
    languageOptions: { globals: globals.browser },
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['scripts/tests/load.k6.js'],
    languageOptions: { globals: { __ENV: 'readonly' } },
  },
];
