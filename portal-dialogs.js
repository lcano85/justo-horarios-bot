async function installOperationalPrompt(page, log = console.log) {
  const button = page.getByRole('button', { name: /^Omitir por 5 minutos$/i });
  let handling = false;
  async function dismiss() {
    if (handling || !await button.isVisible()) return false;
    handling = true;
    try {
      await button.click({ timeout: 15000 });
      await button.waitFor({ state: 'hidden', timeout: 15000 });
      log('Control operativo: se pulso Omitir por 5 minutos.');
      return true;
    } finally { handling = false; }
  }
  // Handles the prompt if it reappears during product changes.
  await page.addLocatorHandler(button, dismiss, { noWaitAfter: true });
  return { button, dismiss };
}

async function openProducts(page, url, portal, prompt) {
  const checkbox = page.locator(portal.rowSelector).locator(portal.checkboxSelector).first();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await prompt.button.or(checkbox).first().waitFor({ timeout: 60000 });
    await prompt.dismiss();
    try {
      await checkbox.waitFor({ timeout: 15000 });
      await prompt.dismiss();
      return;
    } catch (error) {
      // A full-page check-in can redirect away from Disponibilidad.
      // After postponing it, reopen the configured product URL once.
      if (attempt === 1) throw error;
    }
  }
}
module.exports = { installOperationalPrompt, openProducts };
