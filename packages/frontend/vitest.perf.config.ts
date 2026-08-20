import { configDefaults, defineConfig } from 'vitest/config';
import baseConfig from './vite.config';

// The mirror of vite.config.ts's test block: same plugins, aliases and setup,
// but *.perf.test.ts is the only thing included rather than the only thing
// excluded, and file parallelism is off.
//
// Wall-clock budgets measure the machine as much as the code. Run alongside 129
// other test files they fail on contention alone, saying nothing about the code
// under test; run alone they mean exactly what they claim. `npm run test:perf`
// uses this config, and CI runs it as its own blocking step.
//
// The test block is spread and overridden rather than passed through
// `mergeConfig`, which concatenates arrays — merging would have kept the base
// `exclude` and hidden the perf specs from their own run.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['src/**/*.perf.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    fileParallelism: false,
  },
});
