import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * End-to-end test config. E2E specs boot the Nest application (controllers,
 * pipes, validation, exception mapping) and drive it over HTTP with supertest.
 * TypeORM repositories are replaced with mocks, so no live database is required.
 */
export default defineConfig({
  // See vitest.config.ts: SWC (not Oxc) must do the decorator-metadata transform.
  oxc: false,
  test: {
    globals: true,
    root: './',
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.e2e-spec.ts'],
    // Boot/teardown of a Nest app per file is heavier than a unit test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [swc.vite()],
});
