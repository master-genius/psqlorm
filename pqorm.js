'use strict';

const mo = require ('./model.js');
const pg = require('pg');
const TableTrigger = require('./tableTrigger.js');
const types = require('./dataTypes.js')

let pqorm = function (db) {

  if (!(this instanceof pqorm)) {
    return new pqorm(db);
  }

  this.db = db;

  this.schema = 'public';

  this.setdb = (db) => {
    this.db = db;
  };

  Object.defineProperty(this, '__max__', {
    configurable: false,
    enumerable: false,
    writable: true,
    value: 2560
  });

  Object.defineProperty(this, 'max', {
    get: () => {
      return this.__max__;
    },

    set: (v) => {
      if (typeof v === 'number' && v > 0) {
        this.__max__ = v;
      }
    }
  });

  this.pool = [];

  let self = this;

  this.free = (mdb) => {
    if (self.pool.length < self.__max__) {
      if (mdb.__state__ === mdb.state.USING) {
        mdb.init();
        mdb.resetIdInfo();
        mdb.commitTriggers = [];
        mdb.__state__ = mdb.state.FREE;
        mdb.__transaction__ = false;
        mdb.tableName = '';
        self.pool.push(mdb);
      }
    }
  };

  this.getm = (tablename, schema) => {
    if (self.pool.length > 0) {
      let t = self.pool.pop();
      
      t.odb = t.db = self.db;
      t.tableName = tablename;
      t.__schema__ = t._schema = schema;
      t.__fetch_sql__ = false;
      t.__free_lock__ = false;
      t.__state__ = t.state.USING;
      t.__trigger_commit__ = false;
      return t;
    }

    return null;
  };

  this.tableTrigger = new TableTrigger();

};

pqorm.prototype.ignoreCopyWarning = function (igr=true) {
  process.env.PSQLORM_IGNORE_COPY_WARNING = igr;
};

pqorm.prototype.setSchema = function (name) {
  this.schema = name;
};

pqorm.prototype.model = function (tablename, schema = '') {

  let mdb = this.getm(tablename, schema || this.schema);

  if (mdb) {
    return mdb;
  }

  return new mo(this.db, tablename, schema || this.schema, this, this.tableTrigger);
};

pqorm.prototype.connect = function (tablename = '', schema = '') {
  return this.model(tablename, schema).connect();
};

pqorm.prototype.transaction = async function (callback, schema = '') {

  let m = this.getm('', schema || this.schema);

  if (m) {
    return m.transaction(callback);
  }

  m = new mo(this.db, '', schema || this.schema, this, this.tableTrigger);

  return m.transaction(callback);
};

pqorm.prototype.end = function () {
  this.db.end();
};

pqorm.initORM = (config, schema = null) => {
  let orm = new pqorm(new pg.Pool(config));
  if (schema) orm.schema = schema;
  return orm;
};

pqorm.dataTypes = types;

module.exports = pqorm;
