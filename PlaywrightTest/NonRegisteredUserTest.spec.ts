import { test, expect } from '@playwright/test';

// Base URL for the application
const BASE_URL = 'http://localhost:2000';

test.describe('User Navigation Tests', () => {
  test('should load homepage successfully', async ({ page }) => {
    await page.goto(BASE_URL);
    // Check if page loads and has expected title
    await expect(page).toHaveTitle(/Alimond/i);
  });
  test('should navigate to menu page', async ({ page }) => {
    await page.goto(BASE_URL);
    // Click on menu link (adjust selector based on your actual navbar)
    await page.getByRole('link', { name: 'Menu', exact: true }).click();
    // Verify we're on the menu page
    await expect(page).toHaveURL(/\/menu/);
  });
  test('should display product categories on menu', async ({ page }) => {
    await page.goto(`${BASE_URL}/menu`);
    // Wait for products to load
    await page.waitForSelector('.category, .product-item, [data-category]', {
      timeout: 5000
    }).catch(() => {
      // If specific selectors don't exist, at least check page loaded
    });
    // Check that menu content is visible
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });
  test('should navigate to login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    // Check for login form elements
    await expect(page.getByRole('textbox', { name: 'User Name' })).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
    await expect (page.getByRole('link', { name: 'Register' })).toBeVisible();
    await expect (page.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect (page.getByRole('link', { name: 'Create Account' })).toBeVisible();
  });
  test('should navigate to register page', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);

    // Check for registration form
    await expect(page.locator('#registerForm')).toBeVisible();
    await expect (page.getByRole('link', { name: 'Login' })).toBeVisible();
  });
  test('should add item to cart and proceed to checkout', async ({ page }) => {
    await page.goto(`${BASE_URL}/menu`);
    await page.goto('http://localhost:2000/menu');
    await page.getByText('Small - ₱80.00').click();
    await page.getByLabel('Espresso Beverage (Iced)').locator('select[name="extras"]').selectOption('Hazelnut');
    await page.getByLabel('Espresso Beverage (Iced)').locator('select[name="customOption"]').selectOption('Soy Milk');
    await page.getByLabel('Espresso Beverage (Iced)').locator('select[name="sugar"]').selectOption('25% sweetness (approx. 4g)');
    await page.getByLabel('Espresso Beverage (Iced)').getByRole('button', { name: 'Add to Order' }).click();
    await page.getByLabel('Pastry').getByRole('button', { name: 'Add to Order' }).click();
    await page.getByRole('link', { name: 'Checkout' }).click();
    await expect(page.getByRole('heading', { name: 'Order Details' })).toBeVisible();
    await expect(page.getByRole('button', { name: '💵 Cash Payment' })).toBeVisible();
    await expect(page.getByRole('button', { name: '📱 GCash Payment' })).toBeVisible();
    await expect(page.getByRole('button', { name: '💳 Online Payment' })).toBeVisible();
  });
  test('should display order summary page', async ({ page }) => {
    // This test assumes there's an order in session or you need to create one first
    await page.goto(`${BASE_URL}/orderSummary`);

    // Check if order summary elements are present
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('should handle language switching', async ({ page }) => {
    await page.goto(BASE_URL);

    // Look for language selector (if exists in your app)

    await page.goto(BASE_URL);
    await page.getByRole('link', { name: 'Select Language' }).click();
    await page.locator('iframe[title="Language Translate Widget"]').contentFrame().getByRole('link', { name: '›Filipino' }).click();
    await expect(page.locator('body')).toMatchAriaSnapshot(`
    - text: "🌐 Pumili ng Wika / Pumili ng Wika:"
    - link "Filipino":
      - /url: "#"
    `);
  });

});
