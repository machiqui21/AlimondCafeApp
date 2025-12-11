import { test, expect } from '@playwright/test';

// Base URL for the application
const BASE_URL = 'http://localhost:2000';

test.describe('Admin Navigation Tests', () => {
  test.beforeAll(async ({ request }) => {
    // Create or update an admin user for tests via secured test-only endpoint
    await request.post(`${BASE_URL}/__test__/admin`, {
      headers: { 'x-test-token': 'secret-test-token' },
      data: { username: 'Admin', password: '12345', email: 'admin@example.com' },
    });
  });
  test('should handle admin login with valid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder('User Name').fill('Admin');
    await page.getByPlaceholder('Password').fill('12345');
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page).toHaveURL(/admin\/dashboard/);
  });

  test('admin should access queue page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder('User Name').fill('Admin');
    await page.getByPlaceholder('Password').fill('12345');
    await page.getByRole('button', { name: /login/i }).click();

    // Navigate to admin queue
    await page.getByRole('link', { name: 'Order Queue' }).click();
    await expect(page).toHaveURL(/admin\/queue/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Order Queue/i);
    // Quick sanity checks for nav links
    await expect(page.getByRole('link', { name: 'All Orders' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Order Queue' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Menu' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Logout' })).toBeVisible();
  });
});
