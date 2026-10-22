const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { installOperationalPrompt, openProducts } = require('./portal-dialogs');
test('Omite el aviso inicial y recurrente sin iniciar operaciones; continua leyendo productos', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const logs = [];
    const prompt = await installOperationalPrompt(page, text => logs.push(text));
    await page.route('https://justo.test/**', route => route.fulfill({ contentType: 'text/html', body: `
      <div id="prompt" style="position:fixed;inset:0;z-index:100;background:white">
        <button onclick="window.started=true">Iniciar operaciones</button>
        <button onclick="document.querySelector('#prompt').hidden=true">Omitir por 5 minutos</button>
      </div>
      <table><tbody><tr><td>Fanta</td><td><input type="checkbox"></td></tr></tbody></table>` }));
    await openProducts(page, 'https://justo.test/products', { rowSelector: 'tbody tr', checkboxSelector: 'input[type=checkbox]' }, prompt);
    assert.equal(await prompt.button.isVisible(), false);
    // Reappears immediately before a product action: locator handler must dismiss it.
    await page.evaluate(() => { document.querySelector('#prompt').hidden = false; });
    await page.locator('input').setChecked(true);
    assert.equal(await page.locator('input').isChecked(), true);
    assert.equal(await page.evaluate(() => Boolean(window.started)), false);
    assert.equal(logs.length, 2);
    // Absence is a no-op, and reloading still handles a new prompt.
    assert.equal(await prompt.dismiss(), false);
    await openProducts(page, 'https://justo.test/products', { rowSelector: 'tbody tr', checkboxSelector: 'input[type=checkbox]' }, prompt);
    assert.equal(logs.length, 3);
  } finally { await browser.close(); }
});
