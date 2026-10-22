const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const cron = require('node-cron');
const { validate, shiftAt } = require('./schedule');
const config = require('./config.json');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const dir = path.join(__dirname, 'reports');
const statePath = path.join(dir, 'scheduler-state.json');
const lockPath = path.join(dir, 'scheduler.lock');
function expressions(c) {
  return ['morning', 'afternoon'].map(key => {
    const [hour, minute] = c[key].start.split(':').map(Number);
    return `${minute} ${hour} * * ${c.days.join(',')}`;
  });
}
function shiftKey(c, date = new Date()) {
  const shift = shiftAt(c, date);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: c.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(p => [p.type, p.value]));
  return shift === 'skip' ? null : `${parts.year}-${parts.month}-${parts.day}:${shift}`;
}
function write(file, data) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(file + '.tmp', file);
}
function start() {
  validate(config);
  fs.mkdirSync(dir, { recursive: true });
  try { fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(fs.readFileSync(lockPath, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw Error('Lock invalido; revisar reports/scheduler.lock.');
    try { process.kill(pid, 0); throw Error('Ya existe un scheduler activo.'); }
    catch (check) { if (check.code !== 'ESRCH') throw check; }
    fs.unlinkSync(lockPath);
    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  }
  process.on('exit', () => { try { if (fs.readFileSync(lockPath, 'utf8') === String(process.pid)) fs.unlinkSync(lockPath); } catch {} });
  let state = {};
  if (fs.existsSync(statePath)) state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  let child;
  let stopped = false;
  function reconcile() {
    if (child || stopped) return;
    const key = shiftKey(config);
    if (!key || state.completedKey === key) return;
    console.log(new Date().toISOString(), 'Ejecutando', key);
    child = spawn(process.execPath, [path.join(__dirname, 'bot.js'), 'apply'], {
      cwd: __dirname, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, HEADLESS: 'true' }
    });
    const startedAt = new Date().toISOString();
    let failure;
    child.once('error', error => { failure = error.message; });
    const timer = setTimeout(() => { failure = 'Tiempo maximo de ejecucion excedido'; child.kill(); }, 15 * 60000);
    child.once('close', code => {
      clearTimeout(timer);
      child = undefined;
      let status;
      try { status = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8')); } catch {}
      const expectedShift = key.split(':')[1];
      const ok = code === 0 && !failure && status?.ok === true && status.shift === expectedShift && status.verified > 0 && status.at >= startedAt;
      state = { ...state, at: new Date().toISOString(), key, ok, error: ok ? null : failure || 'Turno no verificado; se reintentara dentro del horario.' };
      if (ok) state.completedKey = key;
      write(statePath, state);
      console.log(state.at, ok ? 'Turno verificado' : state.error);
    });
  }
  const tasks = expressions(config).map(expression => {
    if (!cron.validate(expression)) throw Error(`Cron invalido: ${expression}`);
    return cron.schedule(expression, reconcile, { timezone: config.timezone, noOverlap: true });
  });
  tasks.push(cron.schedule('*/5 * * * *', reconcile, { timezone: config.timezone, noOverlap: true }));
  console.log('Cron Justo:', expressions(config), 'zona:', config.timezone);
  console.log('Recuperacion al iniciar y cada 5 minutos; cada turno exitoso se ejecuta una vez al dia.');
  reconcile();
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    stopped = true;
    tasks.forEach(task => task.stop());
    if (child) { child.once('close', () => process.exit(0)); child.kill(); }
    else process.exit(0);
  });
}
if (require.main === module) { try { start(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { expressions, shiftKey };
