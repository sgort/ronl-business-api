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
  // The per-file 80% branch floor, enforced rather than remembered.
  //
  // v2026.09.2 took 53 files below the line to none across all five tested
  // workspaces, and nothing mechanical held it afterwards: a file could drop
  // to 40% branches and fail no run, no hook and no pipeline. Issue #80.
  //
  // A GLOB key, not `global`. Jest applies a glob threshold to each matching
  // file individually, which is the unit the campaign was measured in — a
  // package-wide average hides exactly the regression this is for, since one
  // file falling to 40% barely moves 92%.
  //
  // BRANCHES ONLY, deliberately. A functions floor at 80 would fail 31 files
  // across the other four workspaces today (frontend 11, pa-cockpit 10,
  // pa-demo 7, public-site 3; backend happens to be 0). Adding `functions: 80`
  // here would pass and mislead the next person into adding it there.
  //
  // `npm test` is `jest --coverage`, and both backend deploy workflows run it,
  // so this gates CI as well as local runs without a separate coverage job.
  coverageThreshold: {
    './src/**/*.ts': {
      branches: 80,
    },
  },
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
