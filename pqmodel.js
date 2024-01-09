'use strict';

const makeId = require('./makeId.js');
const randstring = require('./randstring.js');
const makeTimestamp = require('./makeTimestamp.js')

let forbidColumnName = [
  'like', 'ilike'
];

let make_timestamp_func = (typ) => {
  if (!typ) return null;

  let real_typ = typ.trim().toLowerCase()
  if (real_typ === 'bigint') return 'bigint';

  if (real_typ.indexOf('varchar') === 0 || real_typ.indexOf('timestamp') === 0) {
    return () => {
      return (new Date()).toLocaleString().replaceAll('/', '-')
    }
  }

  return null
}

/**
 * 在原型上设计一个支持自动化初始化的函数支持。
 * */

class PostgreModel {

  constructor (pqorm = null, init = true) {
    if (!pqorm) {
      //开发者应该在原型上提供此函数。
      if (this.getORM && typeof this.getORM === 'function') {
        pqorm = this.getORM();
      }

      if (!pqorm) {
        pqorm = this.__pqorm__ || this.__pg__ || this.__pqorm || null;
      }

      if (!pqorm && process.env.PG_HOST && process.env.PG_DATABASE && process.env.PG_USER) {
        let dbconfig = {
          host: process.env.PG_HOST,
          database: process.env.PG_DATABASE,
          user: process.env.PG_USER,
          port: process.env.PG_PORT || 5432,
          max: process.env.PG_MAX || 25,
          password: process.env.PG_PASSWORD || '',
          idleTimeoutMillis: process.env.PG_IDLE_TIMEOUT || 3600_000,
          connectionTimeoutMillis: process.env.PG_CONNECTION_TIMEOUT || 60000,
        }

        let initORM = require('./pqorm.js').initORM
        pqorm = initORM(dbconfig, process.env.PG_SCHEMA || 'public')
        PostgreModel.prototype.__pqorm__ = pqorm
      }
    }

    if (pqorm) {
      this.orm = pqorm;
      this.db = pqorm.db;
      this.odb = pqorm.db;
    }

    this.__auto_id__ = true;

    this.selectField = '*';

    this.tableName = null;

    this.primaryKey = 'id';

    this.lastError = null;

    this.idPre = '';

    this.idLen = 16;

    this.pagesize = 100;

    this.dataTypeMap = {
      'varchar':    'character varying',
      'char':       'character',
      'text':       'text',

      'decimal':    'numeric',
      'numeric':    'numeric',
      'integer':    'integer',
      'int'    :    'integer',
      'smallint':   'smallint',
      'bigint':     'bigint',
      
      'boolean':    'boolean',

      //二进制类型
      'bytea':      'bytea',

      'jsonb': 'jsonb',

      'date':       'date',
      'time':       'time without time zone',
      'timestamp':  'timestamp without time zone',
      'timestamptz': 'timestamp with time zone',
    };

    this.numerics = [
      'smallint','bigint','integer','decimal','numeric', 'int'
    ];

    this.strings = [
      'char', 'varchar', 'text'
    ];

    this.times = [
      'date','time','timestamp','timestampz'
    ];

    //需要携带括号的类型
    this.typeWithBrackets = [
      'character varying', 'character', 'decimal', 'numeric'
    ];

    this.defaultWithType = [
      'varchar', 'char', 'text', 'bytea', 'timestamp', 'timestampz', 'date', 'time'
    ];

    ['defaultWithType', 'typeWithBrackets', 'times', 'strings', 'numerics', 'dataTypeMap'].forEach(a => {
      Object.defineProperty(this, a, {
        value: this[a],
        enumerable: false,
        configurable: false,
        writable: false
      });
    });

    Object.defineProperty(this, '__trigger__', {
      value: {},
      enumerable: false,
      configurable: false,
      writable: true
    });
    
    Object.defineProperties(this, {
      orgMakeId: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: makeId
      },

      _bigId: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: makeId.bigId
      },

      _makeId: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: makeId.serialId
      },
      __pool__: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: []
      },

      maxPool: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: 200
      },

      __pkey_type__: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: 'v'
      },

      __auto_timestamp__: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: {}
      }
    });

    this.makeId = makeId.serialId;
    this.__bind_model__ = null;

    if (init) {
      process.nextTick(async () => {
        await this.__init__();
      });
    }

  }

  async __init__ () {
    this.tableName = this.tableName.trim();
    if (!this.tableName || typeof this.tableName !== 'string') {
      throw new Error('未指定表名称');
    }

    if ((/[A-Z]+/).test(this.tableName)) {
      console.error(`${this.tableName} 表名不支持大写，已自动更改为小写。`);
      this.tableName = this.tableName.toLowerCase();
    }

    if ((/[\s\*\$\@\!\~\%\^\&\(\)\:\.\,\<\>\)\[\]\/\\\|\{\}\=\+]+/).test(this.tableName)) {
      throw new Error(`${this.tableName} 数据表名称不合法，不能包含空白字符和特殊字符，支持字母数字下划线。`);
    }

    if (!this.orm.tableTrigger.hasTable(this.tableName))
      this.initTrigger();

    if (this.primaryKey.indexOf(',') > 0) {
      this.primaryKey = this.primaryKey.split(',').filter(p => p.length > 0);
    }

    if (Array.isArray(this.primaryKey)) {
      if (this.primaryKey.length === 0) this.primaryKey = 'id';
      else if (this.primaryKey.length === 1) this.primaryKey = this.primaryKey[0];
    }

    if (!this.orm.__register__[this.tableName]) {
      this.orm.__register__[this.tableName] = this;
    }

    //把table变成函数对象。
    let _table = (name='') => {
      return this.model(name);
    };

    for (let k in this.table) {
      _table[k] = this.table[k];
    }

    this.table = _table;
    if (!this.table.column || typeof this.table.column !== 'object') {
      throw new Error(`${this.constructor.name} 缺少table.column或table.column不是object，请修改。\n`)
    }

    //判断主键类型并确定生成id的函数。
    if (typeof this.primaryKey === 'string') {
      let pktype = this.table.column[this.primaryKey].type;
      if (pktype && pktype.trim().toLowerCase() === 'bigint') {
        this._makeId = makeId.bigId
        this.__pkey_type__ = 'b'
      }
    }

    //检测是否存在自动生成时间戳
    let _col = null;
    let _timestamp_action = '';
    for (let k in this.table.column) {
      _col = this.table.column[k]
      if (!_col || typeof _col !== 'object') {
        console.error(`${this.tableName}: ${k} 未指定为object类型，请修改。`)
        continue
      }

      if (!_col.timestamp || typeof _col.timestamp !== 'string') {
        continue
      }

      _timestamp_action = _col.timestamp.trim().toLowerCase()
      if (_timestamp_action === 'insert') {
        this.__auto_timestamp__.insert = [
          k,
          _col.timestampCallback || make_timestamp_func(_col.type)
        ];
      } else if (_timestamp_action === 'update') {
        this.__auto_timestamp__.update = [
          k,
          _col.timestampCallback || make_timestamp_func(_col.type)
        ];
      }
    }
  }

  initTrigger () {
    this.orm.tableTrigger.addTable(this.tableName, this.__trigger__);
    let triggers = [
      //'BeforeUpdate', 'BeforeInsert', 'BeforeDelete',
      'Insert', 'Update', 'Delete'
    ];

    triggers.forEach(t => {
      let fname = `trigger${t}`;
      if (this[fname] && typeof this[fname] === 'function') {
        this.__trigger__[ t[0].toLowerCase() + t.substring(1) ] = this[fname];
      }
    });
  }

  timestamp(tobj) {
    return this.model().timestamp(tobj)
  }

  model(tname='') {
    if (tname && this.tableName !== tname && this.orm.__register__[tname]) {
      let pm = this.orm.__register__[tname].model();
      this.__bind_model__ && pm.bind(this.__bind_model__);
      return pm;
    }

    let m = this.orm.model(tname || this.tableName);
    m.__auto_id__ = this.__auto_id__;
    m.__id_len__ = this.idLen;
    m.__id_pre__ = this.idPre;
    m.__primary_key__ = this.primaryKey;
    m.__pkey_type__ = this.__pkey_type__;

    if (!tname || this.tableName === tname) {
      this.__auto_timestamp__.insert && (m.__insert_timestamp__ = this.__auto_timestamp__.insert);
      this.__auto_timestamp__.update && (m.__update_timestamp__ = this.__auto_timestamp__.update);
    }

    this.__bind_model__ && m.bind(this.__bind_model__);
    return m;
  }

  newForTransaction(db) {
    let m = new this.constructor(this.orm, false)
    //model函数会检测此项并自动绑定
    m.__bind_model__ = db
    m.__pool__ = []
    m.getPool = null
    m.freePool = null
    m.__trigger__ = this.__trigger__
    m.__auto_id__ = this.__auto_id__
    m.table = this.table
    m.primaryKey = this.primaryKey
    m._makeId = this._makeId
    m.__pkey_type__ = this.__pkey_type__
    m.__auto_timestamp__ = this.__auto_timestamp__
    return m
  }

  getPool(db) {
    let m = this.__pool__.pop()
    if (m) {
      m.__bind_model__ = db
      return m
    }

    return this.newForTransaction(db)
  }

  freePool(m) {
    this.__bind_model__ = null
    if (this.__pool__.length < this.maxPool) this.__pool__.push(m)
  }

  autoId(b = null) {
    return this.model().autoId(b === null ? this.__auto_id__ : b);
  }

  getSchema() {
    return this.orm ? this.orm.schema : '';
  }

  /**
   * 
   * @param {(string|object)} cond 条件，如果是字符串，args表示字符串中?要替换的参数
   * @param {array} args 
   */
  where(cond, args = []) {
    return this.model().where(cond, args);
  }

  schema(name) {
    return this.model().schema(name);
  }

  _mschema(name = null) {
    let h = this.model();
    return name ? h.schema(name) : h;
  }

  connect() {
    return this.model().connect();
  }

  bind(db) {
    if (this.__bind_model__) return this;

    //要绑定到一个PostgreModel实例，在事务操作中，需要其他模型上的方法，并保证事务操作的原子性。
    if (db && (this !== db) && (db instanceof PostgreModel) && db.__bind_model__) {
      let mdb = this.model();
      mdb.bind(db.__bind_model__);
      return this.getPool(mdb);
    }

    if (db.constructor.name === 'Model')
      return this.model().bind(db);

    throw new Error('db 不是一个可以进行bind操作的对象。');
  }

  trigger(on = true) {
    return this.model().trigger(on);
  }

  triggerCommit(on = true) {
    return this.model().triggerCommit(on);
  }

  returning(r) {
    return this.model().returning(r);
  }

  alias(name) {
    return this.model().alias(name);
  }

  join(m, on, join_type = 'inner') {
    let tname;

    if (typeof m === 'string') {
      tname = m;
    } else {
      tname = m.tableName;
    }

    return this.model(this.tableName).join(tname, on, join_type);
  }

  /**
   * @param m {object|string} - 通过this.relate获取的模型实例或直接指定表名的字符串
   * @param on {string} - join条件
   *
   * */
  innerJoin(m, on) {
    return this.join(m, on, 'inner');
  }

  /**
   * @param m {object|string} 
   *  - 通过this.relate获取的模型实例或直接指定表名的字符串
   * @param on {string} 
   *  - join条件
   * */
  leftJoin(m, on) {
    return this.join(m, on, 'left');
  }

  /**
   * @param m {object|string} - 通过this.relate获取的模型实例或直接指定表名的字符串
   * @param on {string} - join条件
   *
   * */
  rightJoin(m, on, options = {}) {
    return this.join(m, on, 'right');
  }

  /**
   * @param count {number} - 限制返回的条数。
   * @param offset {number} - 偏移量，默认值为0。
   * */
  limit(count, offset=0) {
    return this.model().limit((count && typeof count === 'number' && count > 0) ? count : 100, offset);
  }

  /**
   * 
   * @param data {object} - 要插入的数据对象
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - returning {string} sql语句的returning列。
   * @returns Promise
   */
  async insert(data, options = {schema: null}) {
    this.__auto_timestamp__.insert && makeTimestamp(data, this.__auto_timestamp__.insert);
    this.__auto_timestamp__.update && makeTimestamp(data, this.__auto_timestamp__.update);

    let h = this._mschema(options.schema);

    if (this.primaryKey && typeof this.primaryKey === 'string'
      && data[this.primaryKey] === undefined && this.__auto_id__)
    {
      data[this.primaryKey] = this._makeId(this.idLen, this.idPre);
      h.returning(this.primaryKey);
    }
    
    options.returning && (h = h.returning(options.returning));
    return h.insert(data);
  }

  /**
   * 
   * @param data {array} - 要插入的数据对象
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - returning {string} sql语句的returning列。
   * @returns Promise
   */
  async insertAll(data, options = {schema: null}) {
    if (!Array.isArray(data)) {
      throw new Error(`data不是数组，无法写入多个条目到数据库。`);
    }

    let idlist = [];

    let h = this._mschema(options.schema);

    if (this.__auto_id__ && this.primaryKey && typeof this.primaryKey === 'string') {
      h.returning(this.primaryKey);

      for (let i=0; i < data.length; i++) {
        this.__auto_timestamp__.insert
          &&
        makeTimestamp(data[i], this.__auto_timestamp__.insert);

        this.__auto_timestamp__.update
          &&
        makeTimestamp(data[i], this.__auto_timestamp__.update);
    
        if (data[i][this.primaryKey] === undefined) {
          data[i][this.primaryKey] = this._makeId(this.idLen, this.idPre);
        }

        idlist.push(data[i].id);
      }
    }
  
    options.returning && (h = h.returning(options.returning));

    return h.insertAll(data);
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param data {object} - 要更新的数据
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - returning {string} sql语句的returning列。
   * @returns Promise
   */
  async update(cond, data, options={schema: null}) {
    this.__auto_timestamp__.update && makeTimestamp(data, this.__auto_timestamp__.update);
    
    let h = this._mschema(options.schema);

    options.returning && (h = h.returning(options.returning));

    return h.where(cond).update(data);
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param args {object}
   *  - schema {string} 数据库schema。
   *  - pagesize {number} 分页大小。
   *  - offset {number} 偏移量。
   *  - order {string} 排序方式。
   * @returns object
   */
  async select(cond, args = {schema: null}) {
    if (!cond || typeof cond === 'string' || Array.isArray(cond)) {
      return this.model().select(cond ? cond : '*');
    }

    let t = this._mschema(args.schema).where(cond);

    let offset = args.offset || 0;

    if (args.pagesize !== undefined) {
      t = t.limit(args.pagesize, offset);
    } else {
      t = t.limit(this.pagesize, offset);
    }
    
    if (args.order) {
      t = t.order(args.order);
    }
    
    return t.select(args.field || this.selectField);
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - field {string|array} 返回的列，默认为selectField设置的值。
   * @returns object
   */
  async get(cond = {}, options = {field: null, schema: null}) {
    return this._mschema(options.schema).where(cond).get(options.field || this.selectField);
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - returning {string} sql语句的returning列。
   * @returns Promise
   */
  async delete(cond, options = {schema: null}) {
    let h = this._mschema(options.schema);
    options.returning && (h = h.returning(options.returning));

    return h.where(cond).delete();
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param options {object}
   *  - schema {string} 数据库schema。
   * @returns Promise
   */
  async count(cond = {}, options = {column:'*', schema: null}) {
    if (!options) options = {};

    if (typeof cond === 'string') {
      options.column = cond;
      cond = {};
    }

    let col = options.column || '*';
    return this._mschema(options.schema).where(cond).count(col);
  }

  _fmtNum (m, options) {
    let col = this.table.column[options.field];

    if (!options.to && col && col.to) {
      options.to = col.to;
    }

    if (options.precision === undefined && col.precision !== undefined) {
      options.precision = col.precision;
    }

    switch(options.to) {
      case 'int':
        return parseInt(m);

      case 'float':
        return parseFloat(m);

      case 'fixed':
      case 'fixed-float':
        let prec = (options.precision !== undefined && typeof options.precision === 'number')
                    ? options.precision
                    : 1;
        if (options.to === 'fixed')
          return parseFloat(m).toFixed(prec);

        return parseFloat(parseFloat(m).toFixed(prec));
    }

    return m;
  }

  throwNoFieldsError (options) {
    if (!options.field) throw new Error('!!必须指定fileds。');
    if (this.table.column[options.field] === undefined)
      throw new Error(`！！没有column：${options.field}.`);
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - field {string} 聚合操作的列。
   * @returns Promise
   */
  async max (cond = {}, options = {schema: null}) {
    if (!options) options = {};

    if (typeof cond === 'string') {
      options.field = cond;
      cond = {};
    }

    if (typeof options === 'string') options = {field: options};

    this.throwNoFieldsError(options);
    
    let m = await this._mschema(options.schema).where(cond).max(options.field);

    if (!options.to) return m;

    return this._fmtNum(m, options);
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - field {string} 聚合操作的列。
   * @returns object
   */
  async min (cond = {}, options = {schema: null}) {
    if (!options) options = {};

    if (typeof cond === 'string') {
      options.field = cond;
      cond = {};
    }
    if (typeof options === 'string') options = {field: options};

    this.throwNoFieldsError(options);
    
    let m = await this._mschema(options.schema).where(cond).min(options.field);

    if (!options.to) return m;

    return this._fmtNum(m, options);
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - field {string} 聚合操作的列。
   * @returns Promise
   */
  async avg (cond = {}, options = {schema: null}) {
    if (!options) options = {};

    if (typeof cond === 'string') {
      options.field = cond;
      cond = {};
    }
    if (typeof options === 'string') options = {field: options};

    this.throwNoFieldsError(options);

    let m = await this._mschema(options.schema).where(cond).avg(options.field);
    if (!options.to) return m;

    return this._fmtNum(m, options);
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - field {string} 聚合操作的列。
   * @returns Promise
   */
  async sum (cond = {}, options = {schema: null}) {
    if (!options) options = {};

    if (typeof cond === 'string') {
      options.field = cond;
      cond = {};
    }
    if (typeof options === 'string') options = {field: options};

    this.throwNoFieldsError(options);

    let m = await this._mschema(options.schema).where(cond).sum(options.field);

    if (!options.to) return m;

    return this._fmtNum(m, options);
  }

  quote (a) {
    return this.orm.model().quote(a);
  }

  logSql(callback) {
    return this.orm.model().logSql(callback);
  }

  order(by, type = '') {
    return this.model().order(by, type);
  }

  _checkFields (fields, options = {}) {
    if (!fields || !Array.isArray(fields)) return {ok: false, errcode: 'TYPE_WRONG'};

    let notin = [];
    for (let k of fields) {
      if (!options.dataIn && (k.indexOf('(') >= 0 || k.indexOf('as') > 0)) continue;

      if (!this.table.column[k]) {
        notin.push(k);
      }
    }

    if (notin.length > 0) return {ok: false, notin, errcode: 'FIELD'};

    return {ok: true};
  }

  /**
   * 
   * @param options {object} 
   *  - field {array|string} 导出的列。
   *  - pagesize {number} 分页大小。
   *  - where {object} where条件。
   *  - offset {number} 偏移量。
   * @returns function*
   * */
  async dataOut (options = {}) {
    let cond = options.where || {};
    let total = await this.count(cond);
    let pagesize = 1000;

    if (options.pagesize && typeof options.pagesize === 'number' && options.pagesize > 1) {
      pagesize = options.pagesize;
    }

    if (options.field && options.field !== '*') {
      if (typeof options.field === 'string') {
        options.field = options.field.split(',').filter(p => {
          if (p.length > 0) return p.trim();
        });
      }
      
      if (Array.isArray(options.field)) {
        let st = this._checkFields(options.field);
        if (!st.ok) delete options.field;

        if (!st.ok) {
          throw new Error(`无法导出不存在的列：${st.notin.join()}`);
        }
      } else {
        delete options.field;
      }

    } else if (!options.field) {
      options.field = '*';
    }

    let totalpage = parseInt(total / pagesize) + ((total % pagesize) ? 0 : 1);
    
    let offset = (options.offset !== undefined && typeof options.offset === 'number') ? options.offset : 0;

    if (offset < 0) offset = 0;

    //默认返回生成器。
    let self = this;
    return async function * () {
      
      let ret;
      let fields = options.field || '*';
      let schema = options.schema || null;

      while (true) {
        ret = await self.select(cond, {
          offset,
          pagesize,
          field: fields,
          schema
        });
        
        if (offset < total && ret.length > 0) {
          yield ret;
        } else {
          break;
        }

        offset += ret.length;
      }

    };

  } // dataOut end
  
  /**
   * 
   * @param callback {function} - 接受参数为导出的数据数组。
   * @param options {object} - 和dataOut方法的选项一致。
   */
  async dataOutHandle (callback, options = {}) {
    if (!options || typeof options !== 'object') options = {}

    if (!callback || typeof callback !== 'function')
      throw new Error('需要传递callback用于处理导出的数据');

    let dg = await this.dataOut(options);

    let d = dg();
    let r;

    while (true) {
      r = await d.next();
      if (r.done) break;
      await callback(r.value);
    }

  }

  /**
   * 
   * @param options  {object} 
   *  - data {array} 导入的数据。
   *  - mode {string} 导入模式，默认为'strict'，支持'loose'模式。
   *  - update {string} 更新方式，默认为'delete-insert'，支持 delete-insert|update|none。
   *  - schema {string} 导入数据库的schema。
   * @returns Promise
   */
  async dataIn (options = {}) {
    if (!options.data || !Array.isArray(options.data) ) {
      throw new Error('数据格式错误，请通过选项data传递要导入的数据，数据格式为数组。');
    }

    //loose or strict
    if (options.mode === undefined) options.mode = 'strict';

    //delete-insert update none
    if (options.update === undefined) options.update = 'update';

    let uid = this.primaryKey;

    let ks;

    let wrongs = [];

    let notin = [];

    let createList = [];

    let updateList = [];

    let idlist = [];
    let idmap = {};
    let val_tmp = '';

    let is_primary_field = uid && (typeof uid === 'string');

    for (let a of options.data) {
      if (typeof a !== 'object' || Array.isArray(a) ) {
        wrongs.push(a);
      } else {
        ks = this._checkFields(Object.keys(a), {dataIn: true});
        if (!ks.ok) {
          notin.push(a);
          continue;
        }
      }
      
      //主键id是字符串，说明只有一个字段作为主键，如果数据有主键则有可能是更新，否则就是创建。
      if (is_primary_field) {
        ;(a[uid] === undefined) && createList.push(a);

        if (a[uid] !== undefined) {
          updateList.push(a);
          idlist.push(a[uid]);
        }
      } else if (uid && Array.isArray(uid)) {
        //联合主键把主键名字作为条件，只需要添加updateList，交给后续的程序检测处理。
        updateList.push(a);
        idmap = {};
        uid.forEach(k => {
          idmap[k] = a[k];
        });
        idlist.push(idmap);
      }
    }

    if (options.callback && typeof options.callback !== 'function') {
      options.callback = null;
    }

    if (options.mode === 'strict' && (wrongs.length > 0 || notin.length > 0))
      return {
        ok: false,
        dataWrong: wrongs,
        fieldWrong: notin
      };

    let ret = await this.transaction(async (db, ret) => {

        if (createList.length > 0) {
          options.callback && await options.callback(this, createList, {stage: 'before', command: 'insert', action: 'insert'})
          
          await db.insertAll(createList);

          options.callback && await options.callback(this, createList, {stage: 'after', command: 'insert', action: 'insert'})
        }

        let cond = {};
        let updateData = {};

        if (idlist.length > 0) {
          switch (options.update) {
            case 'delete-insert':
              options.callback
                &&
              await options.callback(this, updateList, {stage: 'before', command: 'insert', action: 'delete-insert'});

              if (is_primary_field) {
                cond[uid] = idlist;
                await db.where(cond).delete();
              } else {
                for (let a of idlist) await db.where(a).delete();
              }

              updateList.length > 0 && await db.insertAll(updateList);
              
              updateList.length > 0 && options.callback
                &&
              await options.callback(this, updateList, {stage: 'after', command: 'insert', action: 'delete-insert'});

              break;

              //先检测是否存在然后确定是更新还是创建
            case 'update':
            case 'none':
            default:
              let chklist = [];
              if (is_primary_field) {
                cond[uid] = idlist;
                chklist = await db.where(cond).select(uid);
              } else {
                chklist = [];
                for (let a of idlist) {
                  val_tmp = await db.where(a).get(uid);
                  val_tmp && chklist.push(val_tmp);
                }
              }
              let r;
              let updInsert = [];
              let realUpdate = [];
              idmap = {};

              chklist.length > 0 && chklist.forEach(a => {
                if (is_primary_field)
                  idmap[ a[uid] ] = a;
                else {
                  ks = [];
                  uid.forEach(x => { ks.push(a[x]) });
                  idmap[ ks.join() ] = a;
                }
              });

              for (let d of updateList) {
                if (is_primary_field) {
                  if (idmap[ d[uid] ]) realUpdate.push(d);
                  else updInsert.push(d);
                } else {
                  ks = [];
                  uid.forEach(x => { ks.push(d[x]) });
                  if (idmap[ks.join()]) realUpdate.push(d);
                  else updInsert.push(d);
                }
              }

              realUpdate.length > 0 && options.callback
                &&
              await options.callback(this, realUpdate, {stage: 'before', command: 'update', action: 'update'});

              if (realUpdate.length > 0 && options.update === 'update') {
                cond = {};
                for (let d of realUpdate) {
                  if (is_primary_field) {
                    cond[uid] = d[uid];
                    updateData = {...d};
                    delete updateData[uid];
                    Object.keys(updateData).length > 0 && await db.where(cond).update(updateData);
                  } else {
                    uid.forEach(x => {cond[x] = d[x]});
                    await db.where(cond).update(d);
                  }
                }
              }
              
              realUpdate.length > 0 && options.callback
                &&
              await options.callback(this, realUpdate, {stage: 'after', command: 'update', action: 'update'});
              
              if (updInsert.length > 0) {
                options.callback
                  &&
                await options.callback(this, updInsert, {stage: 'before', command: 'insert', action: 'insert'});

                await db.insertAll(updInsert);
              
                options.callback
                  &&
                await options.callback(this, updInsert, {stage: 'after', command: 'insert', action: 'insert'});
              }
              break;
          }
        }
    }, options.schema || null);

    ret.dataWrong = wrongs;
    ret.fieldWrong = notin;
    return ret;
  }

  /**
   * 
   * @param gby {string} - group操作的列，多个列使用 , 连接。
   * @param options {object}
   *  - field string类型，返回的列，默认和参数gby一致。
   *  - order string类型，排序方式。
   *  - where 条件，使用object类型，参考where接口。
   */
  async group (gby, options = {}) {
    let t = this.model().where(options.where || {}).group(gby);

    if (options.order) t = t.order(options.order);

    return await t.select(options.field || gby);
  }

  /**
   * 
   * @param callback {function} - async 声明的函数，接受参数：
   *  - db 数据库连接实例，参考Model部分。
   *  - ret object类型，result属性作为返回数据，使用ret.throwFailed方法抛出错误终止事物。
   * @param schema {string} 
   * @returns 
   */
  async transaction (callback, schema = '') {
    if (typeof callback !== 'function' || callback.constructor.name !== 'AsyncFunction') {
      throw new Error(`transaction 执行的回调函数必须使用 async 声明。`);
    }

    return await this.orm.transaction(async (db, handle) => {
      db = db.table(this.tableName);
      
      let hdb = this.getPool(db);
      let result = await callback(hdb, handle);
      this.freePool(hdb);

      return result;
    }, schema);

  }

  /**
   * 
   * Sync仅支持一种操作：从模型同步到数据库，方便在修改程序后，直接同步到数据库，
   * 而如果要从数据库同步到程序文件，则需要独立出模型文件，这很麻烦，而且双向操作容易出问题。
   * 因为Postgresql的复杂度，并且此工具主要作为Web服务场景，所以类型支持不会很全面，只支持常用几种类型，
   * 而对于索引，不做复杂的支持，可以通过数据库完成。
   * 目前来说，索引是为了简单化处理存在的，所以默认的，index字段使用数组。数组中的值就是要创建索引的字段。
   * 而对于复杂的索引以及其他情况则需要自己处理。
   * 这里创建的索引采用自动化的形式，也就是交给postgresql自行处理。
   * 
   * table结构：
   * 
   * {
   *    column : {
   *      id : {
   *          type : 'varchar(20)',
   *          notNull : true,
   *          default : ''
   *      },
   *      username : {
   *          type : 'varchar(40)',
   *          notNull : true,
   *          default : ''
   *      },
   *      passwd : {
   *          type : 'varchar(200)',
   *          notNull : true,
   *          default : ''
   *      }
   *    },
   *    index : [
   *    ],
   *    unique : [
   *    ]
   * 
   * }
   * 
   * 为了数据安全，检测到数据库没有字段会添加，但是如果程序没有编写字段，数据库有字段不会删除。
   * 确定是否为字段重命名，需要提供一个oldName字段，只要存在此字段并且检测到当前oldName确实和存在的字段相同，则会进行重命名处理。
   * 这时候，如果需要再次重命名，则可以修改字段的key值，并让oldName保存之前的key值。
   * 
   */
  /**
   * 
   * @param schema {string} - 要创建的schema名称。
   */
  async createSchema (schema) {
    return await this.db.query(`create schema if not exists ${schema}`);
  }

  _checkFixColumn() {
    let col = '';
    let illegal_count = 0;
    let cobj;

    for (let k in this.table.column) {
      col = k.toLowerCase()
      if (forbidColumnName.indexOf(col) >= 0) {
        setTimeout(() => {
          console.error(`\x1b[2;31;47m!!!${this.tableName} column ${k} 命名和sql关键字冲突，请修改。\x1b[0m`);
        }, 900);
        illegal_count++;
        continue;
      }

      if (col !== k) {
        setTimeout(() => {
          console.error(`\x1b[2;31;47m!!!${this.tableName} 因为postgresql特点，column ${k}会被转换为小写，这容易导致一些问题，请在代码中修改字段名字为小写。\x1b[0m`);
        }, 900);
        illegal_count++;
        continue;
      }

      cobj = this.table.column[k];
      if (!cobj.type && !cobj.ref) {
        setTimeout(() => {
          console.error(`\x1b[2;31;47m!! column ${col} 没有设置type指定类型，也没有使用ref指定外键关联，请检查。\x1b[0m`);
        }, 900);
        illegal_count++;
      }
    }

    return illegal_count > 0 ? false : true;
  }

  /**
   * 
   * @param debug {boolean} 
   *   - 调试模式，会输出sql以及其他提示信息。
   * @param force {boolean} 
   *   - 是否强制同步，默认为false，若为true则会强制把数据库改为和table结构一致。
   */
  async sync (debug=false, force=false, dropNotExistCol=false) {

    if (!this.table) {
      console.error('没有table对象');
      return false;
    }

    if (!this.tableName) {
      console.error('tableName不能为空。');
      return false;
    }

    if (!this._checkFixColumn()) {
      return false;
    }

    debug && console.log(`开始同步表结构(start to sync table) ${this.tableName}`);

    if (this.table.column === undefined || typeof this.table.column !== 'object') {
      throw new Error('column属性必须为object类型');
    }

    if (Object.keys(this.table.column).length <= 0) {
      throw new Error('column没有定义字段');
    }

    this.schema_oid = null;
    let oid = await this.db.query(`SELECT * FROM pg_namespace WHERE nspname = '${this.orm.schema}'`);

    if (oid.rowCount > 0) {
      this.schema_oid = oid.rows[0].oid;
    }
  
    //检测是否存在外键
    let tmp_col, refarr, refmodel, refm, refModName;
    for (let k in this.table.column) {
      tmp_col = this.table.column[k];
      if (tmp_col.ref) {
        refarr = this._parseRef(tmp_col.ref, k);
        refModName = (this.modelPath && (refarr[0].indexOf('/') < 0))
                      ? (this.modelPath + '/' + refarr[0])
                      : refarr[0];
        if (refModName.length < 4 || refModName.substring(refModName.length - 3) !== '.js') refModName += '.js';
        refmodel = require(refModName);
        refm = new refmodel(this.orm);
        await refm.sync(debug, force);
        tmp_col.type = refm.table.column[ refarr[1] ].type;
        tmp_col.references = `REFERENCES ${this.orm.schema}.${refm.tableName} (${refarr[1]})`;
        
        if (tmp_col.refActionUpdate === undefined) tmp_col.refActionUpdate = 'cascade';
        if (tmp_col.refActionDelete === undefined) tmp_col.refActionDelete = 'cascade';

        if (tmp_col.refActionDelete) {
          tmp_col.references += ' ON DELETE ' + tmp_col.refActionDelete;
        }

        if (tmp_col.refActionUpdate) {
          tmp_col.references += ' ON UPDATE ' + tmp_col.refActionUpdate;
        }

        tmp_col.refconstraint = `${this.tableName}_${k}_fkey`;
      }
    }

    let database = this.db.options.database;
    let curTableName = `${this.orm.schema}.${this.tableName}`;

    let sql = `select * from information_schema.tables where table_catalog=$1 and table_schema=$2 and table_name=$3`;

    let r = await this.db.query(sql, [
      database, this.orm.schema, this.tableName
    ]);

    let qtag = randstring(12);

    //没有表，需要创建
    if (r.rowCount <= 0) {

      sql = `create table if not exists ${curTableName} (`;

      let tmp = '';
      let pt = '';

      for (let k in this.table.column) {

        if (this.table.column[k].drop || this.table.column[k].ignore) {
          continue;
        }

        if (this.primaryKey === k) {
          sql += `${k} ${this.table.column[k].type} primary key,`;
        } else {
          sql += `${k} ${this.table.column[k].type} `;
          tmp = this.table.column[k];
          if (tmp.notNull !== false) {
            sql += `not null `;
          }

          //自动检测默认值
          pt = this._parseType(tmp.type);
          if (tmp.default === undefined) {
            if (this._isArray(tmp.type)) {
              tmp.default = '{}';
            } else if (this.numerics.indexOf(pt) >= 0) {
              tmp.default = 0;
            } else if (this.strings.indexOf(pt) >= 0) {
              tmp.default = '';
            }
          }

          if (tmp.default !== undefined) {
            if (tmp.default === null) {
              sql += 'default null ';
            } else {
              sql += `default $_${qtag}_$${tmp.default}$_${qtag}_$ `;
            }
          }
          
          if (tmp.ref && tmp.references) {
            sql += tmp.references;
          }
          sql += `,`;
        }

      }

      //检测是否为联合主键
      if (this.primaryKey && Array.isArray(this.primaryKey)) {
        sql = `${sql.trim()} primary key(${this.primaryKey.join()}))`;
      } else {
        sql = `${sql.trim().substring(0, sql.length-1)})`;
      }
      
      if (debug) {
        console.log(sql);
      }

      await this.db.query(sql);
      await this._syncIndex(curTableName, debug);
      await this._syncUnique(curTableName, debug);
      await this._syncReferences(curTableName, debug);

      return;
    }

    let fields = 'column_name,data_type,column_default,character_maximum_length,'
                  +'numeric_precision,numeric_scale,is_nullable';

    r = await this.db.query(
      `select ${fields} from information_schema.columns where table_name=$1 AND table_schema=$2 AND table_catalog=$3`, 
      [this.tableName, this.orm.schema, database]
    );

    let inf = {};
    for (let i=0; i < r.rows.length; i++) {
      inf[r.rows[i].column_name] = r.rows[i];
    }

    //若存在dropIndex但是不存在removeIndex则指向dropIndex
    if (this.table.dropIndex && !(this.table.removeIndex)) {
      this.table.removeIndex = this.table.dropIndex;
    }

    await this._syncColumn(inf, curTableName, debug, force, dropNotExistCol);

    await this._syncIndex(curTableName, debug);

    await this._syncUnique(curTableName, debug);

    await this._removeIndex(curTableName, debug);

    await this._syncReferences(curTableName, debug);

    if (debug) {
      console.log(' - 表结构同步完成 - ');
    }

  }

  /**
   * 
   * @param {object} data 数据对象。
   * @param {boolean} quiet 默认为true，不抛出错误，而是删除不存在的列，为false检测到不存在的列会抛出错误。
   * @returns this
   */
  check (data, quiet = true) {
    let cols = this.table.column;
    for (let k in data) {
      if (cols[k] === undefined) {
        if (!quiet) {
          throw new Error(`column ${k} 没有定义。`);
        } else {
          delete data[k];
        }
      }
    }

    return this;
  }

    /**
     * 检测字段的执行流程：
     *    检测是否需要重命名，如果重命名但是可能用户已经
     *        通过数据库客户端进行操作并在这之后更改的程序，这时候不会进行更新。
     *    检测是否存在，不存在则创建。
     *    检测类型是否需要更改。
     *    检测not null和default是否需要更改，必须在类型检测之后。
     * 
     *    typeLock 为true表示不进行类型更新。
     */
  async _syncColumn (inf, curTableName, debug = false, force = false, dropNotExistCol = false) {
    let qtag = randstring(12);
    let pt = '';
    let real_type = '';
    let col = null;
    let sql = '';

    if (debug) {
      console.log('-- 检测并同步columns(checking columns)...');
    }

    let renameTable = {};

    for (let k in this.table.column) {
      col = this.table.column[k];
      
      if (col.ignore) {
        continue;
      }

      if (col.drop) {
        try {
          sql = `alter table ${curTableName} drop column if exists ${k}`;
          await this.db.query(sql);
        } catch (err) {
        }
        continue;
      }

      if (col.oldName && typeof col.oldName === 'string' && col.oldName.trim()) {
        if (inf[k] === undefined && inf[col.oldName.trim()]) {
          await this.db.query(`alter table ${curTableName} rename ${col.oldName} to ${k}`);
          //保证后续的检测不会错误的创建字段。
          inf[k] = inf[col.oldName.trim()];
          //执行重命名之后，在强制更新模式，检测inf字段，oldName已经不在this.table.column中。
          renameTable[col.oldName.trim()] = true;
        }
      }

      pt = this._parseType(col.type);
      real_type = this._realType(pt);

      if (inf[k] === undefined) {
        sql = `alter table ${curTableName} add ${k} ${col.type}`;
        if (col.notNull !== false) {
          sql += ` not null`;
        }
        
        if (col.default === undefined) {
          if (this._isArray(col.type)) {
            col.default = '{}';
          } else if (this.numerics.indexOf(pt) >= 0) {
            col.default = 0;
          } else if (this.strings.indexOf(pt) >= 0) {
            col.default = '';
          }
        }

        if (col.default !== undefined) {
          if (col.default === null) {
            sql += ' default null';
          } else {
            sql += ` default $_${qtag}_$${col.default}$_${qtag}_$`;
          }
        }

        if (debug) {
          console.log(sql);
        }
        await this.db.query(sql);
        continue;
      }

      if (col.typeLock) continue;
      /**
       * 如果没有在支持的类型中，则相当于是typeLock为true的结果，
       * 因为这时候，无法判断真实的类型名称和默认值格式。
       */
      if (real_type === null) {
        continue;
      }
      
      if (this._compareType(inf[k], col, real_type) === false) {
        /**
         * 在涉及到隐含类型转换时，会自动转换，否则需要指定转换规则。
         * 比如遇到问题是字符串类型 => 时间 | 数字
         * 但是目前测试varchar转换任何其他非字符串类型都会出问题，根本就不支持，其using语法并不能解决问题。
        */

        sql = `alter table ${curTableName} alter ${k} type ${col.type}`;

        if (inf[k].data_type === 'text' || inf[k].data_type.indexOf('character') >= 0) {
          if (this.strings.indexOf(this._parseType(col.type)) < 0) {
            //sql += ` using ${k}::${col.type}`;
            if (col.force) {
              //强制更新，先创建临时表名，然后drop，最后改名。
              sql = `alter table ${curTableName} drop column ${k}`;
              await this.db.query(sql);
              
              sql = `alter table ${curTableName} add ${k} ${col.type}`;
              if (col.notNull !== false) {
                sql += ' not null';
              }

              if (col.default !== undefined) {
                if (col.default === null) {
                  sql += ' default null ';
                } else {
                  sql += ` default $_${qtag}_$${col.default}$_${qtag}_$`;
                }
              }

              await this.db.query(sql);

              col.changed = true;
              continue;
            } else {
              console.error(` -- ${k} ${col.type} 从字符串类型转向其他类型无转换规则，或者设置force选项强制操作。`);
            }

          }
        }

        debug && console.log(sql);

        try {
          await this.db.query(sql);
          col.changed = true;
        } catch (err) {
          console.error('Error:',err.message);
          continue;
        }
        
      }

      if (col.default !== undefined) {
        let real_default = this._realDefault(k, col.default);

        if (real_default !== inf[k].column_default) {
          let default_value = col.default === null ? 'null' : `$_${qtag}_$${col.default}$_${qtag}_$`;
          sql = `alter table ${curTableName} alter column ${k} set default ${default_value}`;
          await this.db.query(sql);
        }
      }

      if (col.notNull === undefined || col.notNull) {
        if (inf[k].is_nullable === 'YES') {
          await this.db.query(`alter table ${curTableName} alter column ${k} set not null`);
        }
      } else {
        if (inf[k].is_nullable === 'NO') {
          //难以把列恢复为允许null，请自行修改或重新创建列。
        }
      }
    }

    //force模式检测若有数据表字段，在程序中未定义，则直接删除。
    if (dropNotExistCol) {
      for (let k in inf) {
        if (!this.table.column[k] && !renameTable[k]) {
          await this.db.query(`alter table ${curTableName} drop column ${k}`);
        }
      }

      await this._autoRemoveIndex(debug);
    }

  }

  async removeIndexes(debug=false, indexes=null) {
    if (Array.isArray(debug)) {
      indexes = debug;
      debug = false;
    }

    let curTableName = `${this.orm.schema}.${this.tableName}`;

    if (!indexes || !Array.isArray(indexes)) {
      indexes = [].concat(this.table.index || [], this.table.unique || []);
    }

    return this._removeIndex(curTableName, debug, indexes);
  }

  async recoverIndex(debug=false) {
    let curTableName = `${this.orm.schema}.${this.tableName}`;
    await this._syncIndex(curTableName, debug);
    await this._syncUnique(curTableName, debug);
  }

  async _autoRemoveIndex(debug=false) {
    //在pg_indexes中不能带上schema
    let sql = `select * from pg_indexes where `
        + `tablename='${this.tableName}' and schemaname = '${this.orm.schema}' `
        + `and indexname != '${this.tableName}_pkey';`;

    let remove_index = [];
    let remove_unique = [];

    let r = await this.db.query(sql);

    if (r.rowCount === 0) return false;

    let indexTable = {};
    let now_index_list = [];
    for (let idx of r.rows) {
      indexTable[idx.indexname] = idx;
      now_index_list.push(idx.indexname);
    }

    let makeIndexName = (name) => {
      return name.split(',').map(x => x.trim()).filter(p => p.length > 0).join('_');
    }
    
    let allIndex = {};
    if (this.table.index && Array.isArray(this.table.index)) {
      this.table.index.forEach(a => {
        allIndex[`${this.tableName}_${makeIndexName(a)}_idx`] = a;
      });
    }
    
    let allUnique = {};
    if (this.table.unique && Array.isArray(this.table.unique)) {
      this.table.unique.forEach(a => {
        allUnique[`${this.tableName}_${makeIndexName(a)}_idx`] = a;
      });
    }

    for (let ix of now_index_list) {
      if (!allIndex[ix] && !allUnique[ix]) {
        debug && console.log('自动删除不需要的索引(auto remove unnecessary index):', ix);
        await this.db.query(`drop index ${this.orm.schema}.${ix};`);
      }
    }

    for (let k in allIndex) {
      if (!indexTable[k]) continue;
      if (indexTable[k].indexdef.toLowerCase().indexOf('create index') !== 0) {
        debug && console.log('自动删除类型不一致的索引(auto remove index with inconsistent type):', k);
        await this.db.query(`drop index ${this.orm.schema}.${k};`);
      }
    }

    for (let k in allUnique) {
      if (!indexTable[k]) continue;
      if (indexTable[k].indexdef.toLowerCase().indexOf('create unique') !== 0) {
        debug && console.log('自动删除类型不一致的索引(auto remove index with inconsistent type):', k);
        await this.db.query(`drop index ${this.orm.schema}.${k};`);
      }
    }

  }

  async _checkIndex(indname, debug = false) {
    let indsplit = indname.split(',').map(x => x.trim()).filter(p => p.length > 0);

    if (indsplit.length <= 0) {
      debug && console.error(` \x1b[2;35m-- ${indname} 错误的索引项。\x1b[0m`);
      return false;
    }

    let tmp = null;
    for (let i = 0; i < indsplit.length; i++) {
      
      tmp = this.table.column[ indsplit[i] ];

      if (tmp === undefined || tmp.drop || tmp.ignore) {
        
        if (debug) {
          console.error(
            ` \x1b[2;35m-- 忽略 index ${indname} -- 请检查索引相关的column是否存在。\x1b[0m`
          );
        }

        return false;
      }

    }

    /**
     * postgresql 会把联合索引多个字段使用 _ 连接。
     */
    let indtext = indsplit.join('_');

    //在pg_indexes中不能带上schema
    let sql = `select * from pg_indexes where `
        + `tablename='${this.tableName}' and schemaname = '${this.orm.schema}' `
        + `and indexname = '${this.tableName}_${indtext}_idx'`;
    
    let r = await this.db.query(sql);
    if (r.rowCount > 0) {
      return false;
    }

    return indsplit.join(',');
  }

  async _syncIndex(curTableName, debug = false) {
    if (this.table.index === undefined) {
      return;
    }

    if (!this.table.index || !Array.isArray(this.table.index) ) {
      console.error('index 属性必须为数组类型，其中值为字符串');
      return;
    }

    if (debug) {
      console.log('-- 检查并同步索引(checking index)...');
    }

    let indname = '';
    let indchk = null;

    let checkColumn = (cname) => {
      let nsplit = []
      if (cname.indexOf(',') > 0) {
        nsplit = cname.split(',').filter(p => p.length > 0);
      } else {
        nsplit.push(cname);
      }

      for (let n of nsplit) {
        if (this.table.column[n] === undefined) return false;
      }

      return true;
    }

    let compareIndex = (a, b) => {
      if (a.replaceAll(' ', '') === b.replaceAll(' ', '')) return true;
  
      return false;
    };

    let checkInUnique = (name) => {
      if (!Array.isArray(this.table.unique)) return true;

      for (let a of this.table.unique) {
        if (compareIndex(name, a)) return true;
      }

      return false;
    };

    for (let i = 0; i < this.table.index.length; i++) {
      indname = this.table.index[i];

      if (this.table.removeIndex !== undefined
        && Array.isArray(this.table.removeIndex)
        && this.table.removeIndex.indexOf(indname) >= 0)
      {
        continue;
      }

      if (checkColumn(indname) === false) {
        console.error(`\x1b[2;35m-- ${indname} ： 没有此列或包含不存在的列，无法创建索引。\x1b[0m`);
        continue;
      }

      if (checkInUnique(indname)) {
        console.error(`\x1b[2;35m-- ${indname} ： 同时配置了index索引和unique索引，请修改。\x1b[0m`);
        continue;
      }

      indchk = await this._checkIndex(indname, debug);

      if (indchk === false) {
        continue;
      }

      let ind_using = '';
      if (this.table.column[indname]) {
        if (this.table.column[indname].type.toLowerCase() === 'jsonb') {
          ind_using = ' using gin';
        } else if (this.table.column[indname].indexType) {
          ind_using = ` using ${this.table.column[indname].indexType}`;
        }
      }
      
      await this.db.query(`create index on ${curTableName} ${ind_using}(${indchk})`);
    }

  }

  async _syncUnique(curTableName, debug = false) {

    if (this.table.unique === undefined) {
      return;
    }

    if (!this.table.unique || !Array.isArray(this.table.unique) ) {
      console.error('unique 属性必须为数组类型，其中值为字符串');
      return;
    }

    if (debug) {
      console.log('-- 检查并同步unique索引(checking unique index)...');
    }

    if (!this.table.unique || !Array.isArray(this.table.unique) ) {
      return;
    }

    let indname = '';
    let indchk = null;

    for (let i = 0; i < this.table.unique.length; i++) {

      indname = this.table.unique[i];

      if (this.table.removeIndex !== undefined
        && Array.isArray(this.table.removeIndex)
        && this.table.removeIndex.indexOf(indname) >= 0)
      {
        continue;
      }

      indchk = await this._checkIndex(indname, debug);

      if (indchk === false) {
        continue;
      }

      await this.db.query(`create unique index on ${curTableName} (${indchk})`);
    }

  }

  async _removeIndex(curTableName, debug=false, indexs=null) {
    let real_indexs = indexs || this.table.removeIndex;

    if (!real_indexs || !Array.isArray(real_indexs) ) {
      return false;
    }
    
    debug && console.log('try to remove the unnecessary index...');

    let tind = '';
    let sql = '';
    let indchk = '';

    for (let i = 0; i < real_indexs.length; i++) {
      
      //表示没有此索引
      indchk = await this._checkIndex(real_indexs[i]);
      if (indchk) {
        continue;
      }

      if (real_indexs[i].trim() === '') {
        continue;
      }

      tind = real_indexs[i].split(',').map(x => x.trim()).filter(p => p.length > 0).join('_');

      sql = `drop index ${curTableName}_${tind}_idx`;
      try {
        debug && console.log(sql);
        await this.db.query(sql);
      } catch (err) {
        debug && console.error(err);
      }

    }

  }

  async _syncReferences (curTableName, debug = false) {
    let tmp_col;
    let refs_now_list = [];
    let all_keys = [];
    let ind = 0;
    let qtag = Math.random().toString(16).substring(2)

    for (let k in this.table.column) {
      all_keys.push(`$_${qtag}_$${this.tableName}_${k}_fkey$_${qtag}_$`);
      tmp_col = this.table.column[k];
      if (!tmp_col.ref) continue;

      refs_now_list.push(tmp_col.refconstraint);
    }

    let ref_keys = [];
    let sql = '';
    if (all_keys.length > 0) {
      sql = `SELECT * FROM pg_constraint WHERE connamespace=${this.schema_oid} AND contype='f'`
                + ` AND conname IN (${all_keys.join(',')})`;
      let r = await this.db.query(sql);
      let refs = r.rows;

      for (let a of refs) {
        ref_keys.push(a.conname);
      }
    }

    for (let a of ref_keys) {
      if (refs_now_list.indexOf(a) < 0) {
        sql = `alter table ${curTableName} drop constraint ${a}`;
        debug && console.log('-- drop constraint:', sql);
        await this.db.query(sql);
      }
    }

    for (let k in this.table.column) {
      tmp_col = this.table.column[k];
      if (!tmp_col.ref) continue;

      ind = ref_keys.indexOf(tmp_col.refconstraint);

      if (ind >= 0 && tmp_col.changed) {
        sql = `alter table ${curTableName} drop constraint ${tmp_col.refconstraint}`;
        await this.db.query(sql);
      }

      if (ind >= 0 && tmp_col.changed || ind < 0) {
        sql = `alter table ${curTableName} add foreign key (${k}) ${tmp_col.references}`;
        debug && console.log('-- create foreign key:', sql);
        await this.db.query(sql);
      }
    }

  }

  _compareType (f, col, real_type) {
    if (this.typeWithBrackets.indexOf(real_type) < 0) {
      return (f.data_type === real_type);
    }
    
    //获取括号以及包含的字符串
    let btstr = this._parseBrackets(col.type);

    //字符串类型
    if (f.data_type.indexOf('character') == 0) {
      return (`${f.data_type}(${f.character_maximum_length})` === `${real_type}${btstr}`);
    }

    return (`${f.data_type}(${f.numeric_precision},${f.numeric_scale})` === `${real_type}${btstr}`);
  }

  _parseType (t) {
    let br = t.indexOf('(');
    if (br > 0) {
      return t.substring(0,br).trim().toLowerCase();
    }
    
    br = t.indexOf('[');
    if (br > 0) {
      return t.substring(0,br).trim().toLowerCase();
    }

    return t.trim().toLowerCase();
  }

  _parseBrackets (t) {
    let ind = t.indexOf('(');
    if (ind < 0) {
      return '';
    }
    return t.substring(ind).trim();
  }

  _realType (t) {
    return this.dataTypeMap[t] || null;
  }

  _isArray (t) {
    if (t.indexOf('[') > 0) return true;
    return false;
  }

  _realDefault (t, val) {
    if (t === 'boolean') {
      return (val === 't' ? 'true' : 'false');
    }

    if (this.defaultWithType.indexOf(t) < 0) {
      return val;
    }

    let rt = this.dataTypeMap[t];
    return `${val === '' ? "''" : val}::${rt}`;
  }

  //refstr model:column
  _parseRef (refstr, curColumn) {
    if (refstr.indexOf(':') > 0) {
      let i = refstr.length - 1;
      while (i > 0) {
        if (refstr[i] === ':') break;
        i--;
      }
      if (i === refstr.length - 1) return [refstr, curColumn];

      return [refstr.substring(0, i), refstr.substring(i+1)];
    }

    return [refstr, curColumn];
  }

}

module.exports = PostgreModel;
