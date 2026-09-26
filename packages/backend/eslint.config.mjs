import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
    // Test files
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],

    rules: {
      // Tests frequently use ! after explicit setup/assertions.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  
  // Node build scripts (scripts/*.cjs), added with the OpenAPI document (#200).
  // The '*.js'/'*.mjs' ignores below match package-root files only, so these
  // are linted -- and they run as CommonJS under Node, not as ESM TypeScript.
  // Globals are named here rather than taken from the `globals` package, which
  // this backend does not declare.
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // A build script reports what it wrote; that is its entire output.
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/', 'deploy/', 'node_modules/', 'coverage/', '*.js', '*.mjs'],
  }
);
