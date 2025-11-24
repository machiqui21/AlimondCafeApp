import { test, expect } from '../fixtures/base.fixture';

/**
 * Example test file showing how to use reusable helpers
 */
test.describe('Example: Using Reusable Helpers', () => {
  
  test('login as admin using helper', async ({ auth, nav }) => {
    // Use navigation helper
    await nav.goToLogin();
    
    // Use auth helper
    await auth.loginAsAdmin();
    
    // Verify login
    expect(await auth.isLoggedIn()).toBe(true);
  });

  test('add item to cart using helper', async ({ nav, order }) => {
    // Navigate to menu
    await nav.goToMenu();
    
    // Add item to cart
    await order.addFirstItemToCart();
    
    // Verify item added
    const count = await order.getCartItemCount();
    expect(count).toBeGreaterThan(0);
  });

  test('complete user flow with helpers', async ({ auth, nav, order }) => {
    // 1. Login
    await auth.loginAsUser('testuser', 'password123');
    
    // 2. Go to menu
    await nav.goToMenu();
    
    // 3. Add items
    await order.addFirstItemToCart();
    await order.setQuantity(2);
    
    // 4. Checkout
    await order.proceedToCheckout();
    
    // 5. Submit order
    await order.submitOrder();
  });

  test('admin workflow with helpers', async ({ auth, nav, page }) => {
    // Login as admin
    await auth.loginAsAdmin();
    
    // Navigate to admin pages
    await nav.goToAdminQueue();
    
    // Verify we're on admin page
    expect(page).toHaveURL(/\/admin\/queue/);
  });
});
