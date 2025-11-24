import { Page, expect } from '@playwright/test';

/**
 * Reusable order/cart helpers
 */
export class OrderHelper {
  constructor(private page: Page) {}

  /**
   * Add first available item to cart
   */
  async addFirstItemToCart() {
    const addButton = this.page.locator('button:has-text("Add"), button:has-text("Order")').first();
    await expect(addButton).toBeVisible();
    await addButton.click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Add specific item to cart by name
   */
  async addItemByName(itemName: string) {
    const itemCard = this.page.locator(`text=${itemName}`).locator('..');
    const addButton = itemCard.locator('button:has-text("Add"), button:has-text("Order")');
    await addButton.click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Set quantity for an item
   */
  async setQuantity(quantity: number) {
    const qtyInput = this.page.locator('input[name="quantity"], input[type="number"]').last();
    await qtyInput.fill(quantity.toString());
  }

  /**
   * Proceed to checkout
   */
  async proceedToCheckout() {
    const checkoutButton = this.page.locator('button:has-text("Checkout"), a:has-text("Checkout")');
    await checkoutButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get cart item count
   */
  async getCartItemCount(): Promise<number> {
    const cartBadge = this.page.locator('.cart-count, .badge, [data-cart-count]');
    if (await cartBadge.isVisible()) {
      const text = await cartBadge.textContent();
      return parseInt(text || '0', 10);
    }
    return 0;
  }

  /**
   * Clear cart
   */
  async clearCart() {
    const clearButton = this.page.locator('button:has-text("Clear"), button:has-text("Empty")');
    if (await clearButton.isVisible()) {
      await clearButton.click();
    }
  }

  /**
   * Submit order
   */
  async submitOrder() {
    const submitButton = this.page.locator('button:has-text("Submit"), button:has-text("Place Order")');
    await submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Verify order total
   */
  async verifyOrderTotal(expectedTotal: number) {
    const totalElement = this.page.locator('.total, .order-total, [data-total]');
    const totalText = await totalElement.textContent();
    const total = parseFloat(totalText?.replace(/[^0-9.]/g, '') || '0');
    expect(total).toBeCloseTo(expectedTotal, 2);
  }
}
