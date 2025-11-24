import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:2000/');
  await page.getByRole('link', { name: 'Login/Register' }).click();
  await page.getByRole('link', { name: 'Login' }).click();
});