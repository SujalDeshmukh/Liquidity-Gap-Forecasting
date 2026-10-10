'use strict';
const mongoose = require('mongoose');
const { makeBookSchema } = require('./bookSchema');
const { PRODUCT_TYPES } = require('../config/constants');

module.exports = mongoose.model('Liability', makeBookSchema(PRODUCT_TYPES), 'liabilities');
