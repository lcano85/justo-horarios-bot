const path = require('node:path');
module.exports = {
  apps: [{
    name: 'justo-bot',
    cwd: __dirname,
    script: path.join(__dirname, 'scheduler.js'),
    interpreter: process.execPath,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    restart_delay: 10000,
    min_uptime: '30s',
    max_restarts: 100,
    max_memory_restart: '300M',
    windowsHide: true,
    time: true,
    out_file: path.join(__dirname, 'reports', 'pm2-out.log'),
    error_file: path.join(__dirname, 'reports', 'pm2-error.log'),
    env: { NODE_ENV: 'production', HEADLESS: 'true' }
  }]
};
