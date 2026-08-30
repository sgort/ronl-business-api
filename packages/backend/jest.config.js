/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  // Report every source file, not just the ones a test happens to import, so
  // untested features surface as 0% instead of being omitted from the table.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__fixtures__/**',
    '!src/test-utils/**',
    '!src/types/**',
    '!src/index.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
      },
    }],
  },
  moduleNameMapper: {
    // ts-jest's transform above overrides the project's node16 tsconfig with
    // classic CommonJS module resolution, which does not itself map a '.js'
    // specifier back to its '.ts' source. The real node16/nodenext tsconfig
    // that `tsc --noEmit` uses requires that extension on relative imports
    // (TS2835) -- including in dynamic import() calls, which are always
    // ESM-shaped regardless of the importing file's own module format -- so
    // a source file may write e.g. './config.js'; this strips it back off
    // before Jest's own resolver looks for a module on disk.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@auth/(.*)$': '<rootDir>/src/auth/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@ronl/shared$': '<rootDir>/../shared/src/index',
  },
};
