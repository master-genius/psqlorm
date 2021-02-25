'use strict';

const mo = require ('./model.js');
const pqmodel = require('./pqmodel');

var pqorm = function (db) {
  if (!(this instanceof pqorm)) {
    return new pqorm(db);
  }

  this.db = db;

  this.schema = 'public';

  this.setdb = (db) => {
    this.db = db;
  };

  this.max = 2048;

  this.pool = [];

  let self = this;

  this.free = (mdb) => {
    if (self.pool.length < self.max) {
      mdb.init();
      self.pool.push(mdb);
    }
  };

  this.getm = (tablename, schema) => {
    if (self.pool.length > 0) {
      let t = self.pool.pop();
      t.odb = t.db = self.db;
      t.tableName = tablename;
      t.schema = schema;
      t.fetchSql = false;
      return t;
    }
    return null;
  };

};

pqorm.prototype.setSchema = function (name) {
  this.schema = name;
};

pqorm.prototype.model = function (tablename, schema = '') {

  let mdb = this.getm(tablename, schema || this.schema);
  if (mdb) {
    return mdb;
  }

  return new mo(this.db, tablename, schema || this.schema, this);
};

pqorm.prototype.transaction = async function (callback, schema = '') {

  let m = this.getm('', schema || this.schema);

  if (m) {
    return m.transaction(callback);
  }

  return (new mo(this.db, '', schema || this.schema, this)).transaction(callback);
};

pqorm.prototype.end = function () {
  this.db.end();
};

pqorm.Model = pqmodel;

module.exports = pqorm;
