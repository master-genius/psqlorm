'use strict';

const makeId = require('./makeId.js');
const randstring = require('./randstring.js');
const makeTimestamp = require('./makeTimestamp.js')

let forbidColumns = require('./forbidColumns.js')

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

let illegal_regex = /[\s\*\$\@\!\~\%\^\&\(\)\:\.\,\<\>\)\[\]\/\\\|\{\}\=\+]+/;

/**
 * 在原型上设计一个支持自动化初始化的函数支持。
 * */

class PostgreModel {

  constructor (pqorm = null) {
    let init = true;
    if (Array.isArray(pqorm)) {
      init = pqorm[1] === undefined ? true : !!pqorm[1];
      pqorm = pqorm[0];
    }

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

    ;[
      'defaultWithType', 'typeWithBrackets', 'times', 'strings', 'numerics', 'dataTypeMap'
    ].forEach(a => {
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
        value: 500
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
      },

      __errors__: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: null
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

  async __init__() {
    this.__errors__ = [];
    this.tableName = this.tableName.trim();
    if (!this.tableName || typeof this.tableName !== 'string') {
      throw new Error('未指定表名称');
    }

    let errtext = '';
    if ((/[A-Z]+/).test(this.tableName)) {
      errtext = `${this.tableName} 表名不支持大写，已自动更改为小写。`;
      this.__errors__.push(errtext);
      console.error(errtext);
      this.tableName = this.tableName.toLowerCase();
    }

    if (illegal_regex.test(this.tableName)) {
      throw new Error(`${this.tableName} 数据表名称不合法，不能包含空白字符和特殊字符，支持字母数字下划线。`);
    }
    
    if (this.table.primaryKey 
      && (typeof this.table.primaryKey === 'string' 
          || (Array.isArray(this.table.primaryKey) && this.table.primaryKey.length > 0) )
    ) {
      this.primaryKey = this.table.primaryKey;
    }

    !this.orm.tableTrigger.hasTable(this.tableName) && this.initTrigger();

    if (this.primaryKey.indexOf(',') > 0) {
      this.primaryKey = this.primaryKey.split(',').filter(p => p.length > 0);
    }
    
    if (Array.isArray(this.primaryKey)) {
      if (this.primaryKey.length === 0) this.primaryKey = 'id';
      else if (this.primaryKey.length === 1) this.primaryKey = this.primaryKey[0];
    }

    //检测主键是否符合长度要求
    if (!Array.isArray(this.primaryKey) && this.primaryKey) {
        let pkey_length = this.idLen + this.idPre.length
        let pkey = this.table.column[this.primaryKey]
        if (pkey && pkey.type) {
            let b_index = pkey.type.indexOf('(')
            let typename = b_index > 0 ? pkey.type.substring(0, b_index).trim() : ''
            let p_length = b_index > 0 ? parseInt(pkey.type.substring(b_index+1, pkey.type.length-1).trim()) : 0
            if (typename && p_length && (typename === 'varchar' || typename === 'char')) {
              if (pkey_length > p_length) {
                console.error(`${this.tableName}: 设定的主键长度小于生成ID的长度，已自动调整。`)
                pkey.type = `${typename}(${pkey_length})`
              }
            }
        }
    }

    if (!this.orm.__register__[this.tableName]) {
      this.orm.__register__[this.tableName] = this;
      let constructor_name = this.constructor.name.toLowerCase();
      let kname = 'Model::' + constructor_name;
      if (constructor_name && !this.orm.__register__[kname]) {
        this.orm.__register__[kname] = this;
      }
    }

    //把table变成函数对象。
    let _table = (name='') => { return this.model(name); };

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
      if (pktype) {
        let pkt = pktype.trim().toLowerCase();
        if (pkt === 'bigint') {
          this._makeId = makeId.bigId;
          this.__pkey_type__ = 'b';
        } else if (pkt === 'serial' || pkt === 'bigserial') {
          this.__auto_id__ = false;
        }
      }
    }

    //检测是否存在自动生成时间戳
    let _col = null;
    let _timestamp_action = '';
    for (let k in this.table.column) {
      if (illegal_regex.test(k)) {
        errtext = `!!${this.tableName} >> column: ${k} 存在非法字符，此列会被删除。`
        this.__errors__.push(errtext)
        console.error(errtext)
        delete this.table.column[k]
        continue
      }

      if (k.toLowerCase() !== k) {
        errtext = `!!${this.tableName} >> column： ${k}不能使用大写字母，此列不会生效。`
        this.__errors__.push(errtext)
        console.error(errtext)

        delete this.table.column[k]
        continue
      }

      if (forbidColumns.forbid.includes(k)) {
        errtext = `!!${this.tableName} >> column： ${k} 禁止使用关键词，此列不会生效。`
        this.__errors__.push(errtext)
        console.error(errtext)

        delete this.table.column[k]
        continue
      }

      _col = this.table.column[k]
      if (_col && typeof _col === 'string') {
        this.table.column[k] = {
          type: _col
        }

        _col = this.table.column[k]
      }

      if (!_col || typeof _col !== 'object') {
        errtext = `${this.tableName}: ${k} 未指定为object类型，请修改。`
        this.__errors__.push(errtext)
        console.error(errtext)
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

    Object.defineProperty(this, '__model_proxy__', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: new Proxy({}, {
        get: (obj, x) => {
          throw new Error(`错误所在Model [${this.constructor.name}]: \n获取其他模型不存在，因此无法访问${x}。`)
        },
        set: (obj, k, v) => {
          throw new Error(`错误所在Model [${this.constructor.name}]: \n获取模型不存在，因此无法设置属性：${k}。`)
        }
      })
    })

    Object.defineProperty(this.table, '__validate__', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: Object.create(null)
    })

    Object.defineProperty(this.table, '__fmtfields__', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: Object.create(null)
    })

    for (let k in this.table.column) {
      let col = this.table.column[k]
      if (col && col.validate) {
        if (typeof col.validate === 'function') {
          this.table.__validate__[k] = col.validate.bind(this)
        } else if (Array.isArray(col.validate)) {
          this.table.__validate__[k] = (d) => { return col.validate.indexOf(d) >= 0 }
        } else if (col.validate instanceof RegExp) {
          this.table.__validate__[k] = (d) => { return !!col.validate.test(d) }
        }
      }

      forbidColumns.quote.includes(k) && (this.table.__fmtfields__[k] = `"${k}"`)
    }

    Object.defineProperty(this.table, '__fmtfields_count__', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: Object.keys(this.table.__fmtfields__).length
    })

    if (this.init && typeof this.init === 'function') {
      queueMicrotask(() => {
        try { this.init() } catch (err) { console.error(err) }
      })
    }
  }

  /**
   * 
   * @param {string} name 
   * @returns {string|null} 'c' 表示constructor，'t'表示table，null是没有此模型。
   */
  hasModel(name) {
    let m = this.orm.__register__['Model::' + name.toLowerCase()];
    if (m) return 'c';
    
    m = this.orm.__register__[name];
    if (m) return 't';

    return null;
  }

  /**
   * 
   * @param {string} name 构造函数的名字或数据库表的名字。
   * @returns {PostgreModel}
   */
  getModel(name) {
    let m = this.orm.__register__['Model::' + name.toLowerCase()];
    if (!m) m = this.orm.__register__[name];
    if (!m) {
      return this.__model_proxy__;
    }

    //因为Node.js的事件循环机制，不会有冲突发生，不必考虑锁问题。
    //在事物操作中调用，会返回经过绑定处理的PostgreModel实例。
    if (this.__bind_model__) {
      return m.getPool(this.__bind_model__);
    }

    return m;
  }

  initTrigger() {
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

  /**
   * 
   * @param {string} tname 数据库表的名字
   * @returns {Model}
   */
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
    m.__validate__ = this.table.__validate__;
    m.__fmtfields__ = this.table.__fmtfields_count__ > 0 ? this.table.__fmtfields__ : null;

    if (!tname || this.tableName === tname) {
      this.__auto_timestamp__.insert && (m.__insert_timestamp__ = this.__auto_timestamp__.insert);
      this.__auto_timestamp__.update && (m.__update_timestamp__ = this.__auto_timestamp__.update);
    }

    this.__bind_model__ && m.bind(this.__bind_model__);
    return m;
  }

  newForTransaction(db) {
    let m = new this.constructor([this.orm, false])
    //model函数会检测此项并自动绑定
    m.__bind_model__ = db
    m.__pool__ = []
    //事物函数内部再次调用事物，需要调用getPool方法
    m.getPool = () => {
      return m
    }
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
   * @param {string|object|boolean|number} icond 前置条件，为真则后续的条件才会生效
   * @param {(string|object)} cond 条件，如果是字符串，args表示字符串中?要替换的参数
   * @param {array} args 
   */
  whereIf(icond, cond, args=[]) {
    if (icond) return this.where(cond, args);
    return this;
  }

  /**
   * 
   * @param {(string|object)} cond 条件，如果是字符串，args表示字符串中?要替换的参数
   * @param {array} args 
   */
  where(cond, args=[]) {
    return this.model().where(cond, args);
  }

  schema(name) {
    return this.model().schema(name);
  }

  _mschema(name=null) {
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
  async insert(data) {
    if (Array.isArray(data)) {
      return this.insertAll(data);
    }

    return this.model().insert(data);
  }

  /**
   * 
   * @param data {array} - 要插入的数据对象
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - returning {string} sql语句的returning列。
   * @returns Promise
   */
  async insertAll(data) {
    if (!Array.isArray(data)) {
      throw new Error(`data不是数组，无法写入多个条目到数据库。`);
    }

    return this.model().insertAll(data);
  }

  async update(data) {
    return this.model().update(data);
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
  async select(cond) {
    return this.model().select(cond ? cond : '*')
  }

  async get(fields='*') {
    return this.model().get(fields);
  }

  async count(colname='*') {
    return this.model().count(colname)
  }

  throwNoFieldsError(field) {
    if (this.table.column[field] === undefined)
      throw new Error(`！！${this.tableName} 没有column：${field}`);
  }

  /**
   * 
   * @param field {string} - 要聚合的字段。
   * @param to {string} - 聚合后返回的数据类型。
   * @param prec {number} - 聚合后返回的数据精度。
   * @returns Promise
   */
  async max(field, to = '', prec = 0) {
    let col = this.table.column[field]
    !col && this.throwNoFieldsError(field)

    return this.model().max(field, to || col.to || '', prec || col.precision || 1)
  }

  /**
   * 
   * @param field {string} - 要聚合的字段。
   * @param to {string} - 聚合后返回的数据类型：int float fixed。
   * @param prec {number} - 聚合后返回的数据精度。
   * @returns Promise
   */
  async min(field, to = '', prec = 0) {
    let col = this.table.column[field]
    !col && this.throwNoFieldsError(field)

    return this.model().min(field, to || col.to || '', prec || col.precision || 1)
  }

  /**
   * 
   * @param {string} field 
   * @param {string} to - int float fixed
   * @param {number} prec 
   * @returns 
   */
  async avg(field, to = '', prec = 0) {
    let col = this.table.column[field]
    !col && this.throwNoFieldsError(field)

    return this.model().avg(field, to || col.to || '', prec || col.precision || 1)
  }

  /**
   * 
   * @param field {string} - 要聚合的字段。
   * @param to {string} - 聚合后返回的数据类型：int float fixed。
   * @param prec {number} - 聚合后返回的数据精度。
   * @returns Promise
   */
  async sum(field, to = '', prec = 0) {
    let col = this.table.column[field]
    !col && this.throwNoFieldsError(field)

    return this.model().sum(field, to || col.to || '', prec || col.precision || 1)
  }

  quote(a) {
    return this.orm.model().quote(a);
  }

  logSql(callback) {
    return this.model().logSql(callback);
  }

  fetchSql(b=true) {
    return this.model().fetchSql(b);
  }

  order(by, type = '') {
    return this.model().order(by, type);
  }

  _checkFields(fields, options = {}) {
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
  async dataOut(options = {}) {
    let cond = options.where || {};
    let total = await this.where(cond).count();
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
        ret = await self._mschema(schema).where(cond).limit(pagesize, offset).select(fields);
        
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
  async dataOutHandle(callback, options = {}) {
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
  async dataIn(options = {}) {
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

    if (options.mode === 'strict' && (wrongs.length > 0 || notin.length > 0)) {
      return {
        ok: false,
        dataWrong: wrongs,
        fieldWrong: notin
      }
    }

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
   * @param {string} gby
   * */
  group(gby) {
    return this.model().group(gby);
  }

  /**
   * 
   * @param gby {string} - group操作的列，多个列使用 , 连接。
   * @param options {object}
   *  - field string类型，返回的列，默认和参数gby一致。
   *  - order string类型，排序方式。
   *  - where 条件，使用object类型，参考where接口。
   */
  async groupSelect(gby, options={}) {
    let t = this.model().where(options.where || {}).group(gby);

    options.order && (t = t.order(options.order));

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
  async transaction(callback, schema = '') {
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
  async createSchema(schema) {
    return await this.db.query(`create schema if not exists ${schema}`);
  }

  _checkFixColumn() {
    let col = '';
    let illegal_count = 0;
    let cobj;
    let col_preg = /^[a-z][a-z0-9\_]{1,}$/i;

    for (let k in this.table.column) {
      col = k.toLowerCase()

      if (col !== k) {
        setTimeout(() => {
          console.error(`\x1b[2;31;47m!!!${this.tableName} 因为postgresql特点，column ${k}会被转换为小写，这容易导致一些问题，请在代码中修改字段名字为小写。\x1b[0m`);
        }, 900);
        illegal_count++;
        continue;
      }

      if (!col_preg.test(k)) {
        console.error(`\x1b[2;31;47m!! column ${k} 不符合要求，支持字母数字下划线，并且字母开头。\x1b[0m`);
        process.exit(1);
      }

      cobj = this.table.column[k];
      if (!cobj.type && !cobj.ref) {
        console.error(`\x1b[2;31;47m!! column ${col} 没有设置type指定类型，也没有使用ref指定外键关联，请检查。\x1b[0m`);
        process.exit(1);
      }
    }

    return illegal_count > 0 ? false : true;
  }

  fmtColName(col) {
    if (forbidColumns.quote.indexOf(col) >= 0) return `"${col}"`;

    return col;
  }

  /**
   * 
   * @param debug {boolean} 
   *   - 调试模式，会输出sql以及其他提示信息。
   * @param force {boolean} 
   *   - 是否强制同步，默认为false，若为true则会强制把数据库改为和table结构一致。
   */
  async sync(debug=false, force=false, dropNotExistCol=false) {
    if (!this.table) {
      console.error('没有table对象');
      return false;
    }

    if (!this.tableName) {
      console.error('tableName不能为空。');
      return false;
    }

    debug && console.log(`检测数据表 ${this.tableName} 的column...`);
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
        //避免require('xxx.js')这种情况，会寻找node_modules进行导入
        if (refModName[0] !== '/') refModName = `${process.cwd()}/${refModName}`;

        refmodel = require(refModName);

        if (refmodel && refmodel.prototype && refmodel.prototype instanceof PostgreModel) {
          refm = new refmodel(this.orm);
        } else if (refmodel instanceof PostgreModel) {
          refm = refmodel;
        } else {
          debug && console.error(`${refModName} 不是PostgreModel实例，无法进行同步处理。`);
          continue;
        }

        await refm.sync(debug, force);
        tmp_col.type = refm.table.column[ refarr[1] ].type;
        //外键暂时不支持跨越schema，尽管postgresql支持，这会导致不可预知的混乱。
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
          sql += `${this.fmtColName(k)} ${this.table.column[k].type} primary key,`;
        } else {
          sql += `${this.fmtColName(k)} ${this.table.column[k].type} `;
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
      
      debug && console.log(sql);

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
  check(data, quiet=true) {
    let cols = this.table.column;
    if (Array.isArray(data)) {
      for (let ditem of data) {
        for (let k in ditem) {
          if (cols[k] === undefined) {
            if (!quiet) {
              throw new Error(`column ${k} 没有定义。`);
            } else {
              delete ditem[k];
            }
          }
        }
      }
    } else {
      for (let k in data) {
        if (cols[k] === undefined) {
          if (!quiet) {
            throw new Error(`column ${k} 没有定义。`);
          } else {
            delete data[k];
          }
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
  async _syncColumn(inf, curTableName, debug = false, force = false, dropNotExistCol = false) {
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
          sql = `alter table ${curTableName} drop column if exists ${this.fmtColName(k)}`;
          await this.db.query(sql);
        } catch (err) {
        }
        continue;
      }

      if (col.oldName && typeof col.oldName === 'string' && col.oldName.trim()) {
        if (inf[k] === undefined && inf[col.oldName.trim()]) {
          await this.db.query(`alter table ${curTableName} rename ${this.fmtColName(col.oldName)} to ${this.fmtColName(k)}`);
          //保证后续的检测不会错误的创建字段。
          inf[k] = inf[col.oldName.trim()];
          //执行重命名之后，在强制更新模式，检测inf字段，oldName已经不在this.table.column中。
          renameTable[col.oldName.trim()] = true;
        }
      }

      pt = this._parseType(col.type);
      real_type = this._realType(pt);

      if (inf[k] === undefined) {
        sql = `alter table ${curTableName} add column ${this.fmtColName(k)} ${col.type}`;
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

        debug && console.log(sql);
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

        sql = `alter table ${curTableName} alter column ${this.fmtColName(k)} type ${col.type}`;

        if (inf[k].data_type === 'text' || inf[k].data_type.indexOf('character') >= 0) {
          if (this.strings.indexOf(this._parseType(col.type)) < 0) {
            //sql += ` using ${k}::${col.type}`;
            if (col.force) {
              //强制更新，先创建临时表名，然后drop，最后改名。
              sql = `alter table ${curTableName} drop column ${this.fmtColName(k)}`;
              await this.db.query(sql);
              
              sql = `alter table ${curTableName} add column ${this.fmtColName(k)} ${col.type}`;
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
          sql = `alter table ${curTableName} alter column ${this.fmtColName(k)} set default ${default_value}`;
          await this.db.query(sql);
        }
      }

      if (col.notNull === undefined || col.notNull) {
        if (inf[k].is_nullable === 'YES') {
          await this.db.query(`alter table ${curTableName} alter column ${this.fmtColName(k)} set not null`);
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
          await this.db.query(`alter table ${curTableName} drop column ${this.fmtColName(k)}`);
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
      
      await this.db.query(`create index on ${curTableName} ${ind_using}(${this.fmtColName(indchk)})`);
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

      await this.db.query(`create unique index on ${curTableName} (${this.fmtColName(indchk)})`);
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

  async _syncReferences(curTableName, debug = false) {
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
        debug && console.log(sql);
        await this.db.query(sql);
      }

      if (ind >= 0 && tmp_col.changed || ind < 0) {
        sql = `alter table ${curTableName} add foreign key (${k}) ${tmp_col.references}`;
        debug && console.log('-- create foreign key:', sql);
        await this.db.query(sql);
      }
    }

  }

  _compareType(f, col, real_type) {
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

  _parseType(t) {
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

  _parseBrackets(t) {
    let ind = t.indexOf('(');
    if (ind < 0) {
      return '';
    }
    return t.substring(ind).trim();
  }

  _realType(t) {
    return this.dataTypeMap[t] || null;
  }

  _isArray(t) {
    if (t.indexOf('[') > 0) return true;
    return false;
  }

  _realDefault(t, val) {
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
  _parseRef(refstr, curColumn) {
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
