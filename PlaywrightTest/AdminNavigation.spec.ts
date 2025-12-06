import { test, expect } from '@playwright/test';

// Base URL for the application
const BASE_URL = 'http://localhost:2000';

test.describe('Admin Navigation Tests', () => {
  test('should handle admin login with valid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByRole('textbox', { name: 'User Name' }).click();
    await page.getByRole('textbox', { name: 'User Name' }).fill('Admin');
    await page.getByRole('textbox', { name: 'User Name' }).press('Tab');
    await page.getByRole('textbox', { name: 'Password' }).fill('12345');
    await page.getByRole('button', { name: 'Login' }).click();

    // Wait for navigation or response
    await page.waitForLoadState('networkidle');

    // Check if redirected to admin dashboard or menu
    const url = page.url();
    expect(url).toContain('admin/dashboard');
  });

  test('admin should access queue page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByRole('textbox', { name: 'User Name' }).click();
    await page.getByRole('textbox', { name: 'User Name' }).fill('Admin');
    await page.getByRole('textbox', { name: 'User Name' }).press('Tab');
    await page.getByRole('textbox', { name: 'Password' }).fill('12345');
    await page.getByRole('button', { name: 'Login' }).click();
    // Navigate to admin queue
    await page.getByRole('link', { name: 'Order Queue' }).click();
    const url = page.url();
    // Verify queue page loaded
    await expect(url).toContain('admin/queue');
    await expect(page.getByRole('navigation')).toMatchAriaSnapshot(`
    - navigation:
      - strong: Order Queue
      - text: 🔐 admin
      - link "All Orders":
        - /url: /admin/dashboard
      - link "Order Queue":
        - /url: /admin/queue
      - link "Menu":
        - /url: /menu
      - link "Logout":
        - /url: /logout
    `);
    await expect(page.getByRole('heading')).toContainText('Order Queue');
  });
});
