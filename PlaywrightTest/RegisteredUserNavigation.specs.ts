import { test, expect } from '@playwright/test';

test('Registered user Navigation Tests', async ({ page }) => {
  // Navigate to register page
  await page.goto('http://localhost:2000/login');

  // Perform login
    await page.getByRole('textbox', { name: 'User Name' }).click();
    await page.getByRole('textbox', { name: 'User Name' }).fill('User1');
    await page.getByRole('textbox', { name: 'Password' }).fill('123456');
    await page.getByRole('button', { name: 'Login' }).click();
});