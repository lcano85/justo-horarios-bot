function validate(config) {
  if (!config.days.length || config.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Configura days: 0=domingo, 1=lunes, ..., 6=sabado.');
  if (!config.morning.products.length) throw new Error('Falta la lista exacta morning.products.');
  if (!['inactive', 'skip'].includes(config.outside)) throw new Error('Configura outside: inactive o skip.');
  if (!config.portal.confirmed || (config.stateMode !== 'checked' && !['active', 'inactive'].includes(config.portal.checkedMeans))) throw new Error('Falta validar selectores y columna del portal.');
  for (const shift of [config.morning, config.afternoon]) {
    if (![shift.start, shift.end].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || shift.start >= shift.end) throw new Error('Horario invalido.');
  }
  if (config.morning.end > config.afternoon.start) throw new Error('Los turnos se superponen.');
}
function shiftAt(config, date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const time = `${parts.hour}:${parts.minute}`;
  if (config.days.includes(day)) {
    for (const key of ['morning', 'afternoon']) if (time >= config[key].start && time < config[key].end) return key;
  }
  return config.outside === 'inactive' ? 'closed' : 'skip';
}
function plan(config, inventory, shift) {
  if (shift === 'skip') return [];
  const required = shift === 'morning' ? config.morning.products : shift === 'afternoon' ? config.afternoon.excluded : [];
  for (const name of required) if (!inventory.some(p => p.name === name)) throw new Error(`Producto configurado no encontrado: ${name}`);
  return inventory.map(p => {
    const active = shift === 'morning' ? config.morning.products.includes(p.name) : shift === 'afternoon' ? !config.afternoon.excluded.includes(p.name) : false;
    if (config.stateMode === 'checked') return { ...p, desiredChecked: active };
    return { ...p, active, desiredChecked: config.portal.checkedMeans === 'inactive' ? !active : active };
  });
}
module.exports = { validate, shiftAt, plan };
