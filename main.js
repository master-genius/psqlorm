'use strict'

const PostgreModel = require('./pqmodel.js');
const PsqlORM = require('./pqorm.js');

PsqlORM.Model = PostgreModel;
PsqlORM.PostgreModel = PostgreModel;

module.exports = PsqlORM;

