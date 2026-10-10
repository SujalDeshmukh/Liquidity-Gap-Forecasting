'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, LOCATIONS } = require('../config/constants');

const UserSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true },
    // Required for LOCATION_USER; null for SUPPORT (cross-location access)
    location: {
      type: String,
      enum: [...LOCATIONS, null],
      default: null,
      validate: {
        validator(v) { return this.role !== ROLES.LOCATION_USER || Boolean(v); },
        message: 'Location users must have an assigned location',
      },
    },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true, versionKey: false }
);

UserSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};
UserSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, 12);

UserSchema.methods.toPublic = function toPublic() {
  return { userId: this.userId, name: this.name, role: this.role, location: this.location };
};

module.exports = mongoose.model('User', UserSchema, 'users');
