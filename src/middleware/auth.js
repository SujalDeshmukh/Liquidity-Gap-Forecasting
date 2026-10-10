'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/AppError');

/** Verifies "Authorization: Bearer <jwt>" and puts { userId, name, role, location } on req.user. */
function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(AppError.unauthorized());
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = { userId: payload.sub, name: payload.name, role: payload.role, location: payload.location || null };
    return next();
  } catch (err) {
    return next(AppError.unauthorized(err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token'));
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user.userId, name: user.name, role: user.role, location: user.location || null },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

module.exports = { authenticate, signToken };
