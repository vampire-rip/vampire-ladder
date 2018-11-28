const fp = require('fastify-plugin');
const qs = require('qs');

function formBodyPlugin(fastify, options, next) {
  const opts = { parseAs: 'string', ...options };

  function qsParser(req, body, done) {
    done(null, qs.parse(body.toString()));
  }

  function jsonParser(req, body, done) {
    try {
      const json = JSON.parse(body);
      done(null, json);
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  }

  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    opts,
    qsParser,
  );

  fastify.addContentTypeParser(
    'application/json',
    opts,
    jsonParser,
  );

  next();
}

module.exports = fp(formBodyPlugin, {
  fstify: '^1.0.0',
  name: 'fastify-formbody',
});
