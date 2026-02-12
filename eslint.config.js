import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Bun globals
        Bun: 'readonly',
        // Node.js/Bun shared globals
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        Timer: 'readonly',
        Response: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Disable rules that are too strict for this project
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      // Bun-specific: console.log is OK in CLI tools
      'no-console': 'off',
      // Allow unused assignments in some cases (e.g., reassigning for type narrowing)
      'no-useless-assignment': 'warn',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.smithers/**',
      '.takopi-smithers/**',
      'dist/**',
      '*.config.js',
    ],
  },
  prettier,
];
