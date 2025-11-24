import { test as base } from '@playwright/test';
import { AuthHelper } from '../helpers/auth.helper';
import { NavigationHelper } from '../helpers/navigation.helper';
import { OrderHelper } from '../helpers/order.helper';

/**
 * Custom fixtures that extend Playwright's base test
 * This allows you to use helper classes directly in your tests
 */
type CustomFixtures = {
  auth: AuthHelper;
  nav: NavigationHelper;
  order: OrderHelper;
};

/**
 * Extended test with custom fixtures
 * Usage: import { test, expect } from './fixtures/base.fixture';
 */
export const test = base.extend<CustomFixtures>({
  auth: async ({ page }, use) => {
    await use(new AuthHelper(page));
  },
  nav: async ({ page }, use) => {
    await use(new NavigationHelper(page));
  },
  order: async ({ page }, use) => {
    await use(new OrderHelper(page));
  },
});

export { expect } from '@playwright/test';
