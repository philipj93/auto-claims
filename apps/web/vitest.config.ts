import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Unit + integration test config for the web app.
 *
 * - `@vitejs/plugin-react` provides the JSX/Fast-Refresh transform so we can
 *   render React 19 components (including async Server Components) under jsdom.
 * - The `@/*` alias mirrors the path mapping in tsconfig.json.
 * - Playwright specs live in `e2e/` and are excluded here; run them with
 *   `pnpm test:e2e`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.tsx'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/declarations.d.ts',
        'src/app/layout.tsx',
        'src/app/globals.css',
        // Thin shadcn/radix passthrough wrappers with no app logic of their own.
        'src/components/ui/{avatar,card,separator,table}.tsx',
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
