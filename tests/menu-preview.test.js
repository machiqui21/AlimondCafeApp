const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  try {
    console.log('Opening /menu...');
    await page.goto('http://localhost:2000/menu', { waitUntil: 'networkidle2' });

    // Wait for at least one product card
    await page.waitForSelector('.product-card');

    // Operate on the first product's form
    const firstForm = await page.$('.product-card form');
    if (!firstForm) throw new Error('No product form found');

    // Select first size radio if present (set checked via DOM to avoid click issues)
    const sizeRadio = await firstForm.$('input[name="size"]');
    if (sizeRadio) {
      await page.evaluate(el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }, sizeRadio);
      console.log('Selected size radio');
    }

    // Select a topping if dropdown exists with more than 1 option
    const extrasSelect = await firstForm.$('select[name="extras"]');
    if (extrasSelect) {
      const options = await extrasSelect.$$('option');
      if (options.length > 1) {
        // choose the second option (index 1)
        await page.select('select[name="extras"]', await (await options[1].getProperty('value')).jsonValue());
        console.log('Selected topping');
      }
    }

    // Select sugar radio if present (set checked via DOM)
    const sugarRadio = await firstForm.$('input[name="sugar"]');
    if (sugarRadio) {
      await page.evaluate(el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }, sugarRadio);
      console.log('Selected sugar radio');
    }

    // Set qty to 2
    const qtyInput = await firstForm.$('input[name="qty"]');
    if (qtyInput) {
      await page.evaluate(el => { el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true })); }, qtyInput);
      console.log('Set qty to 2');
    }

    // Read preview spans
    const pricePerItem = await firstForm.$eval('.pricePerItem', el => el.textContent.trim());
    const priceTotal = await firstForm.$eval('.priceTotal', el => el.textContent.trim());
    console.log('Preview values:', pricePerItem, priceTotal);

    if (pricePerItem === '0.00' && priceTotal === '0.00') {
      throw new Error('Preview did not update; both pricePerItem and priceTotal are 0.00');
    }

    // Submit the form by posting the form fields via fetch (URL-encoded) then load order-summary
    const postStatus = await page.evaluate(async form => {
      const fd = new FormData(form);
      const params = new URLSearchParams();
      for (const pair of fd.entries()) params.append(pair[0], pair[1]);
      const resp = await fetch('/order', { method: 'POST', body: params, credentials: 'same-origin' });
      const text = await resp.text();
      return { status: resp.status, statusText: resp.statusText, body: text };
    }, firstForm);
    console.log('POST /order response:', postStatus);
    console.log('POST /order response:', postStatus);

    // Load the order summary page and assert presence of the orders table
    await page.goto('http://localhost:2000/order-summary', { waitUntil: 'networkidle2' });
    await page.waitForSelector('table.menu-table');
    const rows = await page.$$eval('table.menu-table tbody tr, table.menu-table tr', trs => trs.length);
    console.log('Order summary table row count (incl header):', rows);

    // Also verify that the product name appears in the table
    const productName = await firstForm.$eval('input[name="product"]', inp => inp.value);
    const found = await page.$$eval('table.menu-table td', tds => tds.map(td => td.textContent));
    const containsName = found.some(t => t && t.indexOf(productName) !== -1);

    if (!containsName) throw new Error('Persisted order not found in order summary table');

    console.log('Puppeteer test passed: preview updated and order persisted/displayed');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    await browser.close();
    process.exit(2);
  }
})();
