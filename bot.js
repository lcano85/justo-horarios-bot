const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { chromium } = require('playwright');
const { validate, shiftAt, plan } = require('./schedule');
const { installOperationalPrompt, openProducts } = require('./portal-dialogs');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const config = require('./config.json');
const command = process.argv[2] || 'plan';
const reportDir = path.join(__dirname, 'reports');
const session = path.join(__dirname, 'session.json');
function report(name, data) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, `${name}.json`), JSON.stringify({ at: new Date().toISOString(), ...data }, null, 2));
}
async function enter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { await rl.question(message); } finally { rl.close(); }
}
async function diagnose(page, error) {
  fs.mkdirSync(reportDir, { recursive: true });
  await page.screenshot({ path: path.join(reportDir, 'inventory-error.png'), fullPage: true }).catch(() => {});
  const rows = await page.locator(config.portal.rowSelector).evaluateAll(elements => elements.slice(0, 8).map(el => ({ text: el.textContent, html: el.outerHTML })));
  report('inventory-debug', { url: page.url(), error: error.message, rowSelector: config.portal.rowSelector, rows });
}
async function inventory(page) {
  const rows = page.locator(config.portal.rowSelector);
  // Justo initially renders loading rows without product checkboxes.
  await rows.locator(config.portal.checkboxSelector).first().waitFor({ timeout: 60000 });
  await page.waitForFunction(({ rowSelector, nameSelector, checkboxSelector, names }) => {
    const elements = Array.from(document.querySelectorAll(rowSelector));
    const labels = elements.map(row => row.querySelector(nameSelector)?.innerText?.trim());
    return elements.length > 0 && elements.every(row => row.querySelector(checkboxSelector)) && names.every(name => labels.includes(name));
  }, { ...config.portal, names: config.morning.products }, { timeout: 60000 });
  const products = [];
  for (let i = 0; i < await rows.count(); i++) {
    const row = rows.nth(i);
    const name = (await row.locator(config.portal.nameSelector).innerText()).trim();
    const checkbox = row.locator(config.portal.checkboxSelector).nth(config.portal.checkboxIndex);
    if (!name || await checkbox.count() !== 1 || !await checkbox.isVisible()) throw new Error(`Fila ${i + 1}: nombre o casilla no valido.`);
    if (products.some(p => p.name === name)) throw new Error(`Nombre duplicado: ${name}. Se necesitan identificadores estables.`);
    products.push({ name, checked: await checkbox.isChecked(), rowIndex: i });
  }
  if (!products.length) throw new Error('No se encontraron productos.');
  return products;
}
async function run() {
  const mutates = ['apply', 'watch'].includes(command);
  if (!['login', 'inventory', 'plan', 'apply', 'watch'].includes(command)) throw new Error('Comando desconocido.');
  if (mutates || command === 'plan') validate(config);
  const url = process.env.JUSTO_PORTAL_URL;
  if (!url || !/^https?:\/\//.test(url)) throw new Error('Configura JUSTO_PORTAL_URL en .env.');
  if (command !== 'login' && !fs.existsSync(session)) throw new Error('Ejecuta npm run login primero.');
  const browser = await chromium.launch({ headless: command !== 'login' && process.env.HEADLESS === 'true' });
  try {
    const context = await browser.newContext(command === 'login' ? {} : { storageState: session });
    const page = await context.newPage();
    const prompt = await installOperationalPrompt(page);
    if (['login', 'inventory'].includes(command)) await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (command === 'login') {
      await enter('Inicia sesion y abre Suspender productos. Presiona ENTER para guardar la sesion: ');
      await prompt.dismiss();
      await context.storageState({ path: session, indexedDB: true });
      report('portal-location', { url: page.url() });
      console.log('Sesion guardada. Usa la URL de Disponibilidad en .env.');
      return;
    }
    if (command === 'inventory') {
      if (process.env.HEADLESS === 'true') throw new Error('Para inspeccionar productos configura HEADLESS=false en .env.');
      await enter('Entra a Suspender productos y espera a ver la lista completa. Vuelve a esta consola y presiona ENTER para leerla: ');
      await prompt.dismiss();
      await context.storageState({ path: session, indexedDB: true });
      report('portal-location', { url: page.url() });
    }
    async function cycle() {
      if (command !== 'inventory' && shiftAt(config) === 'skip') {
        report('plan', { shift: 'skip', actions: [] });
        report('status', { ok: true, shift: 'skip', changed: 0, verified: 0, message: 'Fuera de turno: conservar estado.' });
        console.log('Fuera de turno: no se modifican productos.');
        return;
      }
      if (command !== 'inventory') await openProducts(page, url, config.portal, prompt);
      const products = await inventory(page);
      await prompt.dismiss();
      if (command === 'inventory') {
        report('inventory', { url: page.url(), products });
        report('status', { ok: true, command, count: products.length });
        console.table(products);
        return;
      }
      const shift = shiftAt(config);
      const actions = plan(config, products, shift);
      report('plan', { shift, actions });
      if (!mutates) { console.table(actions); return; }
      let changed = 0;
      for (const action of actions) {
        if (shiftAt(config) !== shift) throw new Error('Cambio de turno durante la ejecucion; se recalculara en la siguiente revision.');
        if (action.checked === action.desiredChecked) continue;
        // Re-identify the row by exact name in case the portal reorders it.
        const rows = page.locator(config.portal.rowSelector);
        let target;
        for (let i = 0; i < await rows.count(); i++) {
          const row = rows.nth(i);
          if ((await row.locator(config.portal.nameSelector).innerText()).trim() === action.name) {
            if (target) throw new Error(`Fila ambigua: ${action.name}`);
            target = row;
          }
        }
        if (!target) throw new Error(`Producto desaparecido: ${action.name}`);
        await target.locator(config.portal.checkboxSelector).nth(config.portal.checkboxIndex).setChecked(action.desiredChecked);
        changed++;
      }
      if (changed && config.portal.saveButtonSelector) await page.locator(config.portal.saveButtonSelector).click();
      await openProducts(page, url, config.portal, prompt);
      const actual = await inventory(page);
      for (const action of actions) {
        if (actual.find(p => p.name === action.name)?.checked !== action.desiredChecked) throw new Error(`Cambio no persistido: ${action.name}`);
      }
      if (actions.length && actual.length !== products.length) throw new Error('Cambio el catalogo durante la ejecucion.');
      const sessionTemp = session + '.tmp';
      await context.storageState({ path: sessionTemp, indexedDB: true });
      fs.renameSync(sessionTemp, session);
      report('status', { ok: true, shift, changed, verified: actions.length });
      console.log(`${new Date().toISOString()} turno=${shift}, cambios=${changed}, verificados=${actions.length}`);
    }
    if (command !== 'watch') {
      try { await cycle(); }
      catch (error) {
        if (command === 'inventory') {
          await diagnose(page, error).catch(diagnosticError => console.error('No se pudo completar el diagnostico:', diagnosticError.message));
          console.error('No se pudo leer el inventario:', error.message);
          console.error('Revisar reports/inventory-debug.json e inventory-error.png. No se modificaron productos.');
          await enter('El navegador seguira abierto para revisar. Presiona ENTER para cerrar: ');
        }
        throw error;
      }
      return;
    }
    console.log('Control cada 30 segundos. Ctrl+C para terminar.');
    while (true) {
      try { await cycle(); } catch (error) { report('status', { ok: false, error: error.message }); console.error(error.message); }
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  } finally { await browser.close(); }
}
run().catch(error => { report('status', { ok: false, error: error.message }); console.error(error.message); process.exitCode = 1; });
