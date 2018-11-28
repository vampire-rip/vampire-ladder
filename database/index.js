const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  user: 'sunrisefox',
  database: 'acmladder',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const query = (...args) => pool.query(...args)
  .then((results) => {
    console.log('db query', args, 'success with', results.rows);
    return results;
  }).catch((error) => {
    console.log('db query', args, 'failed with', error);
    throw error;
  });

const only = (...args) => query(...args).then((results) => {
  if (results.rows.length > 1) {
    throw new TypeError('the query result length is not less than 1');
  }
  return results.rows[0] || false;
});

query('SELECT NOW() as now')
  .then(res => console.log('database connected at', res.rows[0].now));

module.exports = {
  query,
  only,
};
