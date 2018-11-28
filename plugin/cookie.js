const fp = require('fastify-plugin');

module.exports = fp((fastify, opts, _next) => {
  fastify.decorateRequest('cookie', undefined);
  fastify.decorateReply('setCookie', undefined);

  fastify.addHook('preHandler', (request, reply, next) => {
    const cookie = {};
    request.cookie = cookie;

    const requestCookie = request.headers.cookie || '';

    requestCookie.split(/\s*;\s*/).forEach((each) => {
      const pair = each.split(/\s*=\s*/);
      cookie[pair[0]] = pair.splice(1).join('=');
    });

    reply.setCookie = (cookies) => {
      const result = [];
      Reflect.ownKeys(cookies).forEach((key) => {
        result.push(`${key}=${cookies[key]}; Max-Age=233333; Path=/; HttpOnly`);
      });
      reply.header('set-cookie', result);
    };

    return next();
  });

  _next();
});
