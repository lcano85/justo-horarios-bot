const { test } = require('node:test');
const assert = require('node:assert/strict');
const cron = require('node-cron');
const { expressions, shiftKey } = require('./scheduler');
const config = require('./config.json');
test('Cron se deriva de los horarios y dias configurados', () => {
  assert.deepEqual(expressions(config), ['0 7 * * 1,2,3,4,5,6', '0 17 * * 1,2,3,4,5,6']);
  assert.ok(expressions(config).every(expression => cron.validate(expression)));
});
test('Recuperacion usa fecha Lima y nunca activa turnos vencidos o domingo', () => {
  assert.equal(shiftKey(config, new Date('2026-10-24T07:15:00-05:00')), '2026-10-24:morning');
  assert.equal(shiftKey(config, new Date('2026-10-24T17:15:00-05:00')), '2026-10-24:afternoon');
  assert.equal(shiftKey(config, new Date('2026-10-24T11:30:00-05:00')), null);
  assert.equal(shiftKey(config, new Date('2026-10-24T23:30:00-05:00')), null);
  assert.equal(shiftKey(config, new Date('2026-10-25T07:15:00-05:00')), null);
  assert.equal(shiftKey(config, new Date('2026-10-25T02:00:00Z')), '2026-10-24:afternoon');
});
