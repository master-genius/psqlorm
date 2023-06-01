'use strict'

const pqmodel = require('./pqmodel');
const pqorm = require('./pqorm');

pqorm.Model = pqmodel;

module.exports = pqorm;

