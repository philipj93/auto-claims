import { expect, test } from '@playwright/test';

test.describe('Auto Claims Portal', () => {
  // The signed-in user (the seeded demo account) shares "Alice Nguyen" with a
  // policyholder, and the layout header now renders that name — so scope
  // content assertions to <main> to avoid colliding with the header.
  test('home page lists policyholders', async ({ page }) => {
    await page.goto('/');
    const main = page.getByRole('main');

    await expect(main.getByRole('heading', { name: 'Policyholders' })).toBeVisible();
    await expect(main.getByText('Alice Nguyen')).toBeVisible();
    await expect(main.getByText('Bob Smith')).toBeVisible();
    await expect(main.getByText('1 claim', { exact: true })).toBeVisible();
    await expect(main.getByText('0 claims')).toBeVisible();
  });

  test('navigates from a policyholder to a claim detail', async ({ page }) => {
    await page.goto('/');
    const main = page.getByRole('main');

    // Home -> user detail.
    await main.getByText('Alice Nguyen').click();
    await expect(page.getByRole('heading', { name: 'Alice Nguyen' })).toBeVisible();
    await expect(page.getByText('alice@example.com')).toBeVisible();

    // User detail -> claim detail.
    await page.getByRole('link', { name: 'CLM-2026-0001' }).click();
    await expect(page.getByRole('heading', { name: 'CLM-2026-0001' })).toBeVisible();
    await expect(page.getByText('Under Review')).toBeVisible();
    await expect(page.getByText('Injury reported')).toBeVisible();
    await expect(page.getByText('1HGCM82633A004352')).toBeVisible();
    await expect(page.getByText('POL-55512')).toBeVisible();

    // Back link returns to the owner's page.
    await page.getByRole('link', { name: /Alice Nguyen's claims/ }).click();
    await expect(page).toHaveURL(/\/users\/u-alice$/);
  });

  test('unknown claim renders the 404 page', async ({ page }) => {
    const res = await page.goto('/claims/does-not-exist');
    expect(res?.status()).toBe(404);
    // Next.js renders its default not-found page ("This page could not be found.").
    await expect(page.getByText(/could not be found/i)).toBeVisible();
  });
});
