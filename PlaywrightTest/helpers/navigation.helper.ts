import { Page } from '@playwright/test';

const BASE_URL = 'http://localhost:2000';

/**
 * Reusable navigation helpers
 */
export class NavigationHelper {
  constructor(private page: Page) {}

  /**
   * Navigate to homepage
   */
  async goToHomepage() {
    await this.page.goto(BASE_URL);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to menu page
   */
  async goToMenu() {
    await this.page.goto(`${BASE_URL}/menu`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to login page
   */
  async goToLogin() {
    await this.page.goto(`${BASE_URL}/login`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to register page
   */
  async goToRegister() {
    await this.page.goto(`${BASE_URL}/register`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to order summary
   */
  async goToOrderSummary() {
    await this.page.goto(`${BASE_URL}/orderSummary`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to admin dashboard
   */
  async goToAdminDashboard() {
    await this.page.goto(`${BASE_URL}/admin/dashboard`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to admin queue
   */
  async goToAdminQueue() {
    await this.page.goto(`${BASE_URL}/admin/queue`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click menu link from navbar
   */
  async clickMenuLink() {
    const menuLink = this.page.getByRole('link', { name: /menu/i });
    await menuLink.click();
    await this.page.waitForLoadState('networkidle');
  }
}
