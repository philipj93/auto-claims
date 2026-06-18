import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e config.
 *
 * Two web servers are started for the run:
 *  1. `e2e/mock-api/server.mjs` — a deterministic stand-in for the NestJS API.
 *  2. The Next.js app, with `API_URL` pointed at the mock so its server-side
 *     fetches resolve without a real backend or database.
 *
 * Dedicated ports (3100/4100) avoid clashing with a local `pnpm dev` session.
 */
const WEB_PORT = 3100;
const MOCK_API_PORT = 4100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
    },
  ],
  webServer: [
    {
      command: `node e2e/mock-api/server.mjs`,
      port: MOCK_API_PORT,
      env: { MOCK_API_PORT: String(MOCK_API_PORT) },
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
    {
      command: `next dev --port ${WEB_PORT}`,
      port: WEB_PORT,
      env: { API_URL: `http://127.0.0.1:${MOCK_API_PORT}/api` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
