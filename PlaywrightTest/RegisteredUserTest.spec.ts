import { test, expect } from '@playwright/test';
import { url } from 'inspector';

test('Registered user Navigation Tests', async ({ page }) => {

  // set variable 
  var urlHome = 'http://localhost:2000/';
   var myOrdersLink = page.getByRole('link', { name: '📋 My Orders' });
   var userNameInput = page.getByRole('textbox', { name: 'User Name' });
   var passwordInput = page.getByRole('textbox', { name: 'Password' });
   var loginButton = page.getByRole('button', { name: 'Login' });
   var menuLink = page.getByRole('link', { name: 'Menu', exact: true });
   var viewFullMenuLink = page.getByRole('link', { name: 'View Full Menu' });
   var homePageLink = page.getByRole('link', { name: 'Homepage' });

  // Navigate to login page
  await page.goto(`${urlHome}login`);

  // Perform login and navigation checks
  await userNameInput.click();
  await userNameInput.fill('User1');
  await passwordInput.fill('123456');
  await loginButton.click();
  await expect(menuLink).toBeVisible();
  await expect(myOrdersLink).toBeVisible();
  await expect(page).toHaveURL(urlHome);
  await viewFullMenuLink.click();
  await page.getByRole('navigation').getByRole('link', { name: 'Homepage' }).click();
  await expect(myOrdersLink).toBeVisible();
  await menuLink.click();
  await homePageLink.nth(1).click();
  await myOrdersLink.click();
  await expect(menuLink).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Homepage' })).toBeVisible();
  await expect(page).toHaveURL(/my-orders/);
  await viewFullMenuLink.click();
  await myOrdersLink.click();
  await homePageLink.nth(1).click();
  await myOrdersLink.click();
  await menuLink.click();

  // add order and submit order by cash payment
  await page.getByRole('heading', { name: 'Espresso Beverage', exact: true }).click();
  await page.getByRole('radio', { name: 'Small - ₱75.00' }).check();
  await page.getByLabel('Espresso Beverage', { exact: true }).locator('select[name="extras"]').selectOption('Hazelnut');
  await page.getByLabel('Espresso Beverage', { exact: true }).locator('select[name="customOption"]').selectOption('Almond Milk');
  await page.getByLabel('Espresso Beverage', { exact: true }).locator('select[name="sugar"]').selectOption('25% sweetness (approx. 4g)');
  await page.getByLabel('Espresso Beverage', { exact: true }).getByRole('button', { name: 'Add to Order' }).click();
  await page.getByRole('link', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: '💵 Cash Payment' }).click();
  await expect(page.getByRole('heading', { name: '✓ Order Placed Successfully!' })).toBeVisible();
  await page.getByText('Payment Method: Cash').click();
  await page.getByText('Pending').click();
  await page.getByRole('heading', { name: '💵 Cash Payment' }).click();
  await page.getByText('Please proceed to the cashier').click();
  await expect(page.getByRole('link', { name: 'View Order Details' })).toBeVisible();
  await page.getByRole('link', { name: 'Place Another Order' }).click();

  // add order and submit order by gcash payment
  await page.getByRole('heading', { name: 'Espresso Beverage (Iced)', exact: true }).click();
  await page.getByText('Small - ₱80.00').click();
  await page.getByLabel('Espresso Beverage (Iced)').locator('select[name="extras"]').selectOption('Crushed Oreo');
  await page.getByLabel('Espresso Beverage (Iced)').getByRole('button', { name: 'Add to Order' }).click();
  await page.getByText('Medium - ₱80.00').click();
  await page.locator('div:nth-child(7) > .btn').click();
  await page.getByLabel('Pastry').getByRole('button', { name: 'Add to Order' }).click();
  await page.getByRole('link', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: '📱 GCash Payment' }).click();
  await expect(page.getByRole('heading', { name: '✓ Order Placed Successfully!' })).toBeVisible();
  await expect(page.locator('body')).toContainText('🎉 Thank You for Your Order!');
  await expect(page.locator('body')).toContainText('We appreciate your business and look forward to serving you again soon.');
  await expect(page.getByRole('link', { name: 'View Order Details' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Place Another Order' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to Menu' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to Menu' }).click();


  //Logout
  await page.getByRole('link', { name: 'Logout' }).click();
  await expect(page.getByRole('heading', { name: 'Member Login' })).toBeVisible();




});