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
  
  {
    ignores: ['dist/', 'deploy/', 'node_modules/', 'coverage/', '*.js', '*.mjs'],
  }
);
