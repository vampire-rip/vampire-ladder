const fastify = require('fastify')({
  ignoreTrailingSlash: true,
  logger: true,
  trustProxy: '127.0.0.1, 220.113.20.0/24',
});
const crypto = require('crypto');
const https = require('https');
const nanoid = require('nanoid');

/* eslint-disable-next-line import/no-unresolved */
const { Worker } = require('worker_threads');
/* eslint-disable-next-line no-new */
new Worker('./worker/database-cleanup.js', { workerData: {} });

const db = require('./database');
const body = require('./plugin/body');
const cookie = require('./plugin/cookie');
const session = require('./plugin/session');

const GITHUB_CLIENT_ID = '81f2f1b49ca64ed0720b';
const GITHUB_CLIENT_SECRET = '<should be some thing secret>';

fastify.register(body);
fastify.register(cookie);
fastify.register(session);

fastify.addSchema({
  $id: 'nick',
  type: 'string',
  minLength: 3,
  maxLength: 16,
  pattern: '^(?![0-9]*$)(?!.*[@<> ])[^0-9].+$',
});

fastify.addSchema({
  $id: 'email',
  type: 'string',
  format: 'email',
});

fastify.addSchema({
  $id: 'pass',
  type: 'string',
  minLength: 6,
  maxLength: 16,
});

fastify.get('/info', (request, reply) => {
  if (request.session.uid) {
    reply.send({ statusCode: 0, uid: request.session.uid });
  } else {
    reply.status(401).send({ statusCode: 401, error: 'Auth Required' });
  }
});

fastify.post('/login', {
  schema: {
    body: {
      type: 'object',
      required: ['user', 'pass'],
      properties: {
        user: {
          anyOf: ['email#', 'nick#'],
        },
        pass: 'pass#',
      },
    },
  },
}, async (request, reply) => {
  const { user, pass } = request.body;
  const { uid, hash, salt } = await db.only(
    'select uid, hash, salt from users where nick = $1 or email = $1', [user],
  );
  const calculated = crypto.scryptSync(pass, salt || '', 64).toString('base64');
  if (hash === calculated) {
    request.session.uid = uid;
    reply.send({ statusCode: 0, uid });
    return;
  }
  reply.send({
    statusCode: 403,
    error: 'Forbidden',
    message: '\'user\' or \'pass\' is wrong',
  });
});

fastify.post('/register', {
  schema: {
    body: {
      type: 'object',
      required: ['nick', 'pass', 'email'],
      properties: {
        nick: 'nick#',
        pass: 'pass#',
        email: 'email#',
      },
    },
  },
}, async (request, reply) => {
  const { nick, pass, email } = request.body;
  const salt = nanoid(16);
  const hash = crypto.scryptSync(pass, salt, 64).toString('base64');
  const conflicts = await db.query(
    'select email, nick from users where email = $1 or nick = $2',
    [email, nick],
  );
  if (conflicts.rows.length === 2) {
    reply.send({ statusCode: 1, message: '\'email\' and \'nick\' has been taken' });
    return;
  }
  if (conflicts.rows.length === 1) {
    const type = [];
    if (conflicts.rows[0].email === email) type.push('\'email\'');
    if (conflicts.rows[0].nick === nick) type.push('\'nick\'');
    reply.send({ statusCode: 1, message: `${type.join(' and ')} has been taken` });
    return;
  }
  const { uid } = await db.only(
    'insert into users(nick, salt, hash, email) values ($1, $2, $3, $4)'
    + '  on conflict do nothing returning uid',
    [nick, salt, hash, email],
  );
  request.session.uid = uid;
  reply.send({ statusCode: 0, uid });
});

fastify.get('/github/auth', async (request, reply) => {
  const state = nanoid(16);
  await db.query('insert into github_state(state) values ($1)', [state]);
  const authLocation = 'https://github.com/login/oauth/authorize';
  const clientId = GITHUB_CLIENT_ID;
  const { messageType } = request.query;
  reply.header('cache-control', 'no-cache').type('text/html; charset=utf8').send(`<script>
  const url = new URL('auth-confirm',
      window.location.href.replace(/\\?.+$/, '').replace(/\\/$/, ''));
  const keys = new URL(window.location.href).searchParams;
  for (let k of keys) {{
    url.searchParams.append(...k);
  }}
  const uri = url.href;
  url.searchParams.append('redirect', btoa(uri));
  const redirect = encodeURIComponent(url.href);
  setTimeout(function() {{
    document.location = \`${authLocation}?client_id=${clientId}&redirect_uri=\${redirect}&type=${messageType}&state=${state}\`;
  }}, 100);
</script>`);
});

fastify.get('/github/auth-confirm', async (request, reply) => {
  const {
    code, state, redirect, messageType,
  } = request.query;
  const { exists } = await db.only(
    'delete from github_state where state = $1 returning expire > current_timestamp as exists ',
    [state],
  );
  const clientId = GITHUB_CLIENT_ID;
  const clientSecret = GITHUB_CLIENT_SECRET;
  if (exists) {
    const redirectUri = Buffer.from(redirect, 'base64').toString();
    const authPromise = await new Promise((resolve, reject) => {
      const requestBody = `client_id=${clientId}&client_secret=${clientSecret}&code=${code}&redirect_uri=${redirectUri}&state=${state}`;
      const req = https.request('https://github.com/login/oauth/access_token', {
        method: 'post',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(requestBody),
          Accept: 'application/json',
        },
      }, (res) => {
        res.setEncoding('utf8');
        let json = '';
        res.on('data', (chunk) => {
          json += chunk;
        });
        res.on('end', () => {
          try {
            json = JSON.parse(json);
            resolve(json);
          } catch (e) {
            reject(e);
          }
        }); // res end callback
      }); // req callback
      req.write(requestBody);
      req.end();
    }); // end promise auth
    const accessToken = authPromise.access_token;
    if (accessToken) {
      const jsonText = await new Promise((resolve) => {
        const req = https.request('https://api.github.com/user', {
          method: 'get',
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/json',
            'User-Agent': 'vampire-auth',
          },
        }, (res) => {
          res.setEncoding('utf8');
          let json = '';
          res.on('data', (chunk) => {
            json += chunk;
          });
          res.on('end', () => {
            resolve(json);
          }); // res end callback
        }); // req callback
        req.end();
      }); // end promise get info
      let json;
      try {
        json = JSON.parse(jsonText);
        const { login, id, email } = json;
        let uid;
        const ret = await db.query('select uid, gid from users where gid = $1 or nick = $2', [id, login]);
        if (ret.rows.length === 1) {
          if (ret.rows[0].gid === id) {
            ([{ uid }] = ret.rows);
          } else {
            ({ uid } = await db.only(
              'insert into users (email, gid) values ($1, $2) returning uid',
              [email, id],
            ));
          }
        } else if (ret.rows.length === 2) {
          uid = ret.rows[0].gid === id ? ret.rows[0].uid : ret.rows[1].uid;
        } else {
          ({ uid } = await db.only(
            'insert into users (nick, email, gid) values ($1, $2, $3) returning uid',
            [login, email, id],
          ));
        }
        request.session.uid = uid;
        reply.header('cache-control', 'no-cache').type('text/html; chaset=utf8').send(`<script>
window.opener.postMessage({type: ${messageType}, payload: ${jsonText}})
</script>`);
        return;
      } catch (e) {
        // fall through
      }
    } // if access token
  } // if status exists
  reply.send('failed');
});

fastify.put('/add-problem', async (request, reply) => {
  const {from, spid, score, level} = request.body;
});

fastify.patch('/edit-problem', async (request, reply) => {
  const {pid, score, level} = request.body;
});

fastify.delete('/delete-problem/:pid', async (request, reply) => {
  const {pid} = request.params;
});

fastify.put('/edit-system', async (request, reply) => {
  const {from, pid, score, level} = request.body;
});

fastify.put('/edit-user', async (request, reply) => {
  const {from, pid, score, level} = request.body;
});

fastify.put('/submit', async (request, reply) => {
  const {pid, lid, code} = request.body;
});

fastify.listen(3000)
  .then(address => console.log(`server listening on ${address}`))
  .catch((err) => {
    console.log('Error in server:', err);
    process.exit(1);
  });
