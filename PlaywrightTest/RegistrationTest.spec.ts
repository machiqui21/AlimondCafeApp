import { test, expect } from '@playwright/test';

test('User Registration Tests', async ({ page }) => {
  // Navigate to register page
  await page.goto('http://localhost:2000/register');
  
  // Wait for page to load
  await page.waitForSelector('#registerForm');
  
  // Generate unique username
  const timestamp = Date.now();
  const testUser = {
    firstName: 'Test',
    lastName: 'User',
    username: `testuser${timestamp}`,
    email: `test${timestamp}@example.com`,
    mobilePhone: '1234567890',
    password: 'password123'
  };
  
  console.log('Testing registration with username:', testUser.username);
  
  // Fill in the form
  await page.fill('input[name="firstName"]', testUser.firstName);
  await page.fill('input[name="lastName"]', testUser.lastName);
  await page.fill('input[name="username"]', testUser.username);
  await page.fill('input[name="email"]', testUser.email);
  await page.fill('input[name="mobilePhone"]', testUser.mobilePhone);
  await page.fill('input[name="password"]', testUser.password);
  
  // Wait a moment for username check
  await page.waitForTimeout(1000);
  
  // Check if username is available
  const hint = await page.textContent('#userHint');
  console.log('Username availability hint:', hint);
  
  // Submit the form
  await page.click('button[type="submit"]');
  
  // Wait for navigation or error message
  await page.waitForTimeout(2000);
  
  // Check if we got to success page or got an error
  const url = page.url();
  const pageContent = await page.content();
  
  console.log('Current URL:', url);
  
  if (pageContent.includes('Registration failed')) {
    const errorDiv = await page.textContent('div[style*="background:#fee"]');
    console.log('Registration error:', errorDiv);
    throw new Error('Registration failed: ' + errorDiv);
  }
  
  // Should be on success page or redirected
  await expect(url).toContain('/register');
  await expect(page.getByRole('heading', { name: 'Registration Successful' })).toBeVisible();
  console.log('✓ Registration successful!');
  await page.getByRole('link', { name: 'Logout' }).click();
  const myButton = page.getByRole('link', { name: 'Logout' });
  await expect(myButton).toBeTruthy();
});
