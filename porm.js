'use strict';

const mo = require ('./model.js');

var pqorm = function (db) {
  if (!(this instanceof pqorm)) {
    return new pqorm(db);
  }

  this.db = db;

  this.schema = 'public';

  this.setdb = (db) => {
    this.db = db;
  };

};

pqorm.prototype.setSchema = function (name) {
  this.schema = name;
}

pqorm.prototype.model = function (tablename, schema = '') {
  return new mo(this.db, tablename, schema || this.schema);
};

module.exports = pqorm;

