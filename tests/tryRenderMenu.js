const ejs = require('ejs');
const path = require('path');
const db = require('../dbConfig');

function q(sql) { return new Promise((res, rej) => db.query(sql, (err, rows) => err ? rej(err) : res(rows))); }

(async () => {
  try {
  const productQuery = "SELECT * FROM products WHERE Category = 'Standard'";
    const sizeQuery = "SELECT * FROM size_prices";
    const customQuery = "SELECT * FROM custom_prices";

    const [products, sizePrices, customPricelist] = await Promise.all([
      q(productQuery), q(sizeQuery), q(customQuery)
    ]);

    const plainProducts = (products||[]).map(r=>({ ...r }));
    const plainSizePricelist = (sizePrices||[]).map(r=>({ ...r }));
    const plainCustomPricelist = (customPricelist||[]).map(r=>({ ...r }));

    const locals = { ProductData: plainProducts, PriceData: [], SizePriceData: plainSizePricelist, ExtraPriceData: [], CustomPriceData: plainCustomPricelist, orders: [] };
    const file = path.join(__dirname, '..', 'views', 'menu.ejs');
    ejs.renderFile(file, locals, {}, function(err, str) {
      if (err) {
        console.error('EJS render error:');
        console.error(err);
        process.exit(2);
      }
      console.log('Render OK: length', (str||'').length);
      console.log(str.substring(0,200));
      process.exit(0);
    });
  } catch (e) {
    console.error('DB or render preparation error:', e);
    process.exit(3);
  }
})();
