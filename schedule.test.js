const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shiftAt, plan, validate } = require('./schedule');
const config = { timezone: 'America/Lima', days: [1], morning: { start: '07:00', end: '11:30', products: ['Waffle'] }, afternoon: { start: '17:00', end: '23:30', excluded: ['Fanta'] }, outside: 'inactive', portal: { confirmed: true, checkedMeans: 'inactive' } };
test('Limites de turnos en Lima y dia no habilitado', () => {
  for (const [time, expected] of [['06:59', 'closed'], ['07:00', 'morning'], ['11:29', 'morning'], ['11:30', 'closed'], ['17:00', 'afternoon'], ['23:29', 'afternoon'], ['23:30', 'closed']]) {
    assert.equal(shiftAt(config, new Date(`2026-10-19T${time}:00-05:00`)), expected);
  }
  assert.equal(shiftAt(config, new Date('2026-10-20T08:00:00-05:00')), 'closed');
});
test('Manana exclusiva, tarde sin Fanta y casilla agotado invertida', () => {
  const products = ['Waffle', 'Fanta', 'Hamburguesa'].map(name => ({ name, checked: false }));
  assert.deepEqual(plan(config, products, 'morning').map(p => p.desiredChecked), [false, true, true]);
  assert.deepEqual(plan(config, products, 'afternoon').map(p => p.desiredChecked), [false, true, false]);
  assert.deepEqual(plan(config, products, 'closed').map(p => p.desiredChecked), [true, true, true]);
  assert.deepEqual(plan(config, products, 'skip'), []);
  assert.throws(() => plan(config, [], 'morning'), /no encontrado/);
});
test('Bloquea configuracion sin confirmar', () => {
  validate(config);
  assert.throws(() => validate({ ...config, days: [] }), /days/);
  assert.throws(() => validate({ ...config, portal: { confirmed: false } }), /validar/);
});
test('Regla literal de la imagen: marcado por la manana y todo salvo Fanta por la tarde', () => {
  const literal = { ...config, stateMode: 'checked' };
  const products = ['Waffle', 'Fanta', 'Hamburguesa'].map(name => ({ name, checked: false }));
  assert.deepEqual(plan(literal, products, 'morning').map(p => p.desiredChecked), [true, false, false]);
  assert.deepEqual(plan(literal, products, 'afternoon').map(p => p.desiredChecked), [true, false, true]);
});
test('Configuracion real: lunes a sabado y conservar estado fuera de turno', () => {
  const actual = require('./config.json');
  validate(actual);
  for (const date of ['2026-10-19', '2026-10-24']) {
    assert.equal(shiftAt(actual, new Date(`${date}T07:00:00-05:00`)), 'morning');
    assert.equal(shiftAt(actual, new Date(`${date}T17:00:00-05:00`)), 'afternoon');
    for (const time of ['06:59','11:30','16:59','23:30']) assert.equal(shiftAt(actual, new Date(`${date}T${time}:00-05:00`)), 'skip');
  }
  assert.equal(shiftAt(actual, new Date('2026-10-25T08:00:00-05:00')), 'skip');
  const products = [...actual.morning.products, 'Fanta', ...Array.from({ length: 29 }, (_, i) => `Otro producto ${i}`)].map(name => ({ name, checked: false }));
  const morning = plan(actual, products, 'morning');
  const afternoon = plan(actual, products, 'afternoon');
  assert.equal(morning.filter(p => p.desiredChecked).length, 63);
  assert.equal(afternoon.filter(p => p.desiredChecked).length, 92);
  assert.equal(afternoon.find(p => p.name === 'Fanta').desiredChecked, false);
});
