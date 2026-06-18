import { expect, test } from '@playwright/test';

// These tests exercise the logged-out flow, so ignore the project's saved
// storage state (the authenticated cookie from auth.setup.ts).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login flow', () => {
  test('unauthenticated visit to / redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('signing in lands on the policyholders list', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Username').fill('demo');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/$/);
    // The signed-in user also shows in the header, so scope to <main> to assert
    // the policyholder list specifically.
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Policyholders' })).toBeVisible();
    await expect(main.getByText('Alice Nguyen')).toBeVisible();
  });
});
