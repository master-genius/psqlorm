'use strict';

const mo = require ('./model.js');

var pqorm = function (db) {
  if (!(this instanceof pqorm)) {
    return new pqorm(db);
  }

  this.db = db;

  this.setdb = (db) => {
    this.db = db;
  };

};

pqorm.prototype.model = function (tablename) {
  return new mo(this.db, tablename);
};

module.exports = pqorm;

