module.exports = {
  apps: [{
    name: 'ladder',
    script: '.',
    interpreter: 'node',
    node_args: '--experimental-worker',
    log_date_format: 'MM-DD HH:mm:ss',
    max_memory_restart: '600M',
    restart_delay: '1000',

    autorestart: true,
    watch: true,
    ignore_watch: ['test', '.idea', '.git'],
    min_uptime: 5000,
    max_restarts: 3,
    instances: 1,
  }],
};
