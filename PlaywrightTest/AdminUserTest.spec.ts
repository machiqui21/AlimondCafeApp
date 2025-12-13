// PlaywrightTest/AdminUserTest.spec.ts
import { test, expect } from '@playwright/test';
import { getDecryptedTestPassword } from './helpers/secret.helper';

const BASE_URL = 'http://localhost:2000';
const password = getDecryptedTestPassword(); 

test('admin login with encrypted password', async ({ page }) => {

  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder('User Name').fill('Admin');
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page).toHaveURL(/admin\/dashboard/);
});
test('admin should access queue page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder('User Name').fill('Admin');
    await page.getByPlaceholder('Password').fill(password);
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
