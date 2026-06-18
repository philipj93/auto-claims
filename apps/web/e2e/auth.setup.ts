import { expect, test as setup } from '@playwright/test';

// Saved browser context (cookies) for already-authenticated specs. The
// `chromium` project depends on this `setup` project and loads this file as its
// `storageState`, so specs like `claims.spec.ts` start signed in.
const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('demo');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The login server action sets the cookie and redirects to the home page.
  await expect(page.getByRole('heading', { name: 'Policyholders' })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
