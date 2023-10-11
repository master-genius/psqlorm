'use strict'

const pqmodel = require('./pqmodel');
const pqorm = require('./pqorm');

pqorm.Model = pqmodel;
pqorm.PostgreModel = pqmodel;

module.exports = pqorm;

