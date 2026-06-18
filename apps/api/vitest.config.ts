import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit / integration test config.
 *
 * NestJS leans heavily on `emitDecoratorMetadata` for dependency injection.
 * Vitest transpiles with esbuild, which does NOT emit that metadata, so we run
 * everything through SWC (which does) via `unplugin-swc`. Decorator settings
 * live in `.swcrc`.
 */
export default defineConfig({
  // Vitest 4 transforms with Oxc by default, which (like esbuild) cannot emit
  // decorator metadata. Disable it so SWC is the sole transformer.
  oxc: false,
  test: {
    globals: true,
    root: './',
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/database/**',
        'src/entities/**',
        'src/**/*.module.ts',
      ],
    },
  },
  plugins: [swc.vite()],
});
