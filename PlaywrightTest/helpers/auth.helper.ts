import { Page } from '@playwright/test';

const BASE_URL = 'http://localhost:2000';

/**
 * Reusable authentication helpers
 */
export class AuthHelper {
  constructor(private page: Page) {}

  /**
   * Login as admin user
   */
  async loginAsAdmin() {
    await this.page.goto(`${BASE_URL}/login`);
    await this.page.fill('input[name="username"], input[type="text"]', 'admin');
    await this.page.fill('input[name="password"], input[type="password"]', '12345');
    await this.page.click('button[type="submit"], input[type="submit"]');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Login as regular user
   */
  async loginAsUser(username: string, password: string) {
    await this.page.goto(`${BASE_URL}/login`);
    await this.page.fill('input[name="username"], input[type="text"]', username);
    await this.page.fill('input[name="password"], input[type="password"]', password);
    await this.page.click('button[type="submit"], input[type="submit"]');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Register new user
   */
  async registerUser(username: string, password: string, email?: string) {
    await this.page.goto(`${BASE_URL}/register`);
    await this.page.fill('input[name="username"]', username);
    await this.page.fill('input[name="password"]', password);
    if (email) {
      await this.page.fill('input[name="email"]', email);
    }
    await this.page.click('button[type="submit"]');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Logout current user
   */
  async logout() {
    const logoutButton = this.page.locator('a:has-text("Logout"), button:has-text("Logout")');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Check if user is logged in
   */
  async isLoggedIn(): Promise<boolean> {
    const logoutButton = this.page.locator('a:has-text("Logout"), button:has-text("Logout")');
    return await logoutButton.isVisible();
  }
}
