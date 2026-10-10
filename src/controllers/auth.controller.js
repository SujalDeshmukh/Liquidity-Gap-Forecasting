'use strict';
const { User } = require('../models');
const AppError = require('../utils/AppError');
const { signToken } = require('../middleware/auth');
const { audit } = require('../services/audit.service');

async function login(req, res) {
  const { userId, password, role } = req.valid.body;
  const user = await User.findOne({ userId: userId.toLowerCase(), active: true }).select('+passwordHash');
  const ok = user && (await user.verifyPassword(password));
  if (!ok) {
    audit(req, 'LOGIN', { userId }, 'FAILURE');
    throw AppError.unauthorized('Incorrect user ID or password');
  }
  // The login screen lets users pick "Support" or "Location-based"; it must match the stored role.
  if (role && role !== user.role) {
    audit(req, 'LOGIN', { userId, reason: 'role mismatch' }, 'FAILURE');
    throw AppError.forbidden(`This account is not a ${role === 'SUPPORT' ? 'support' : 'location-based'} user`);
  }
  user.lastLoginAt = new Date();
  await user.save();
  const pub = user.toPublic();
  req.user = pub;
  audit(req, 'LOGIN', { userId: pub.userId });
  res.json({ token: signToken(pub), user: pub });
}

function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, me };
