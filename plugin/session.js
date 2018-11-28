const fp = require('fastify-plugin');
const nanoid = require('nanoid');
const db = require('../database');

const hasUpdate = Symbol('hasUpdate');

const proxyHandler = {
  get(obj, prop) {
    return prop in obj ? obj[prop] : undefined;
  },
  set(obj, prop, value) {
    if (obj[prop] === value) return true;
    obj[hasUpdate] = true;
    obj[prop] = value;
    return true;
  },
  ownKeys(obj) {
    return Object.keys(obj);
  },
};

module.exports = fp((fastify, opts, _next) => {
  fastify.decorateRequest('session', undefined);

  fastify.addHook('preHandler', async (request, reply) => {
    const token = request.cookie ? request.cookie.sid : '';
    if (token) {
      const { session } = await db.only(
        'select * from session where token = $1 and expire > now()',
        [token],
      );
      if (session) {
        request.session = new Proxy(session, proxyHandler);
        return;
      }
    }
    request.session = new Proxy({}, proxyHandler);
  });

  fastify.addHook('onSend', async (request, reply) => {
    if (request.session && request.session[hasUpdate]) {
      let token = request.cookie.sid;
      const sts = Date.now().toString(36);
      if (!token) {
        token = nanoid();
        reply.setCookie({
          sid: token,
          sts,
        });
      }
      await db.query(
        'insert into session (session, expire, token) values ($1, now() + \'240000 seconds\', $2)'
        + ' on conflict (token) do update set session = $1, expire = now() + \'240000 seconds\'',
        [JSON.stringify(request.session), token],
      );
    }
  });

  _next();
});
