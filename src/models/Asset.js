'use strict';
const mongoose = require('mongoose');
const { makeBookSchema } = require('./bookSchema');
const { LOAN_TYPES } = require('../config/constants');

module.exports = mongoose.model('Asset', makeBookSchema(LOAN_TYPES), 'assets');
