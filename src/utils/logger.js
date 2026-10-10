'use strict';
const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.logLevel,
  base: { service: 'liquid-plus-api' },
  redact: ['req.headers.authorization', 'password', '*.password'],
  transport: config.env === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});

module.exports = logger;
