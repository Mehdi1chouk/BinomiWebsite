// pm2 process config — currently a single instance ("fork" mode, not
// "cluster"). Running more than one instance would need the Socket.io Redis
// adapter (see socketio.js) to actually work correctly, since each instance
// would otherwise only know about its own connected clients. Bump
// `instances` (and set REDIS_URL) later if/when that's wanted — until then,
// this is purely "restart the app automatically if it crashes."
module.exports = {
  apps: [
    {
      name: 'binomy-backend',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // pm2's own file-watcher duplicates what nodemon already does in dev
      // and has no place in production (an uploaded photo landing in
      // UsersImages/ would otherwise trigger a restart) — restarts here are
      // meant to be "it crashed," not "a file changed."
      watch: false,
      // A slow leak eating all the VPS's RAM is worse than a clean restart.
      // Adjust based on what the app actually uses in practice.
      max_memory_restart: '300M',
    },
  ],
};
