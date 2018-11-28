// worker script
/* eslint-disable no-console */
/* eslint-disable-next-line import/no-unresolved */
const { workerData } = require('worker_threads');
const db = require('../database');

new Promise((resolve, reject) => {
  const k = () => {
    Promise.all([
      db.query('delete from session where expire < current_timestamp'),
      db.query('delete from github_state where expire < current_timestamp'),
    ]).then(() => {
      console.log('worker script finished normally');
    }).catch(reject);
  };
  k(workerData);
  setInterval(k, 21600000, workerData);
}).catch(() => {
  process.exit(-1);
});
