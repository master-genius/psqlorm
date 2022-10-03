'use strict';

const makeId = require('./makeId.js');

class pqmodel {

  constructor (pqorm = null) {
    if (pqorm) {
      this.orm = pqorm;
      this.db = pqorm.db;
      this.odb = pqorm.db;
    }

    this.autoId = true;

    this.selectField = '*';

    this.tableName = null;

    this.relateName = null;

    this.primaryKey = 'id';

    this.lastError = null;

    this.idPre = '';

    this.idLen = 12;

    this.pagesize = 60;

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

    this.makeId = makeId;

    if (!global.__psqlorm_relate__) global.__psqlorm_relate__ = {};

    process.nextTick(async () => {
      try {
        await this.__init__();
      } catch (err) {
        console.error(err);
      }
    });

  }

  async __init__ () {
    this.relate();

    if (this.init && typeof this.init === 'function') {
      setTimeout(async () => {
        try {
          await this.init();
        } catch (err) {
          console.error(err);
        }
      }, 10);
    }
    
  }

  /**
   * 关联一个模型并返回，要求m必须是已经初始化好的。
   * 名称是必须要有的，后续会通过名称查询缓存。
   * 路径可以不传，此时如果name没有查询到，会返回null。
   * 在能够找到更好方式之前，暂时使用global.__psqlorm_relate__来记录进而避免循环关联。
   */

  relate (name = '') {

    let n = this.relateName || this.tableName;

    if (!global.__psqlorm_relate__[n]) {
      global.__psqlorm_relate__[n] = this;
    }

    if (!name) return null;
    
    if (global.__psqlorm_relate__[name]) {
      return global.__psqlorm_relate__[name];
    }

    return null;
  }

  model (schema = null) {
    return this.orm.model(this.tableName, schema);
  }

  /**
   * 
   * @param {(string|object)} cond 条件，如果是字符串，args表示字符串中?要替换的参数
   * @param {array} args 
   */
  where (cond, args = []) {
    let m = this.orm.model(this.tableName);
    m.__auto_id__ = this.autoId;
    m.__primary_key__ = this.primaryKey;
    return m.where(cond, args);
  }

  schema (name) {
    let m = this.orm.model(this.tableName, name);
    m.__auto_id__ = this.autoId;
    m.__primary_key__ = this.primaryKey;
    return m;
  }

  async join (m, on, join_type = 'INNER', options = {}) {
    
    let tname;

    if (typeof m === 'string') {
      tname = m;
    } else {
      tname = m.tableName;
      if (options.relateAlias) {
        tname += ` as ${options.relateAlias}`;
      }
    }
    
    let tj = this.orm.model(this.tableName, options.schema || null);

    options.alias && (tj = tj.alias(options.alias));

    tj = await tj.join(tname, on, join_type)
                    .where(options.where || {})
                    .limit(
                      options.pagesize !== undefined ? options.pagesize : this.pagesize, 
                      options.offset || 0
                    );

    options.order && (tj = tj.order(options.order));

    let r = await tj.select(options.field || this.selectField);

    return r.rows;
  }

  /**
   * @param m {object|string} - 通过this.relate获取的模型实例或直接指定表名的字符串。
   * @param on {string} - join条件。
   * @param options {stirng} - 默认为{}，选项，支持where、schema、pagesize、offset、order。
   *
   * */
  innerJoin (m, on, options = {}) {
    return this.join(m, on, 'INNER', options);
  }

  /**
   * @param m {object|string} 
   *  - 通过this.relate获取的模型实例或直接指定表名的字符串
   * @param on {string} 
   *  - join条件
   * @param options {stirng} 
   *  - 默认为{}，选项，支持where、schema、pagesize、offset、order
   *
   * */
  leftJoin (m, on, options = {}) {
    return this.join(m, on, 'LEFT', options);
  }

  /**
   * @param m {object|string} - 通过this.relate获取的模型实例或直接指定表名的字符串。
   * @param on {string} - join条件。
   * @param options {stirng} - 默认为{}，选项，支持where、schema、pagesize、offset、order。
   *
   * */
  rightJoin (m, on, options = {}) {
    return this.join(m, on, 'RIGHT', options);
  }

  /**
   * 在动态支持schema的参数设计上，一旦参数超过3个则会把后面的参数以object的形式提供，减少参数传递复杂度。
   * 否则最后一个参数是schema，默认是null。
   */

  /**
   * 
   * @param data {object} - 要插入的数据对象
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - returning {string} sql语句的returning列。
   * @returns Promise
   */
  async insert (data, options = {schema: null}) {

    if (data[this.primaryKey] === undefined && this.autoId) {
      data[this.primaryKey] = this.makeId();
    }

    let h = this.model(options.schema);
    
    options.returning && (h = h.returning(options.returning));

    let r = await h.insert(data);

    if (r.rowCount <= 0) {
      return false;
    }

    if (options.returning) return r.rows[0];

    return data[this.primaryKey];
  }

  /**
   * 
   * @param data {array} - 要插入的数据对象
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - returning {string} sql语句的returning列。
   * @returns Promise
   */
  async insertAll (data, options = {schema: null}) {
    if (!Array.isArray(data)) {
      return false;
    }
    
    let idlist = [];

    if (this.autoId) {
      for (let i=0; i < data.length; i++) {
        if (data[i][this.primaryKey] === undefined) {
          data[i].id = this.makeId();
        }
        idlist.push(data[i].id);
      }
    }
    
    let h = this.model(options.schema);
    
    options.returning && (h = h.returning(options.returning));

    let r = await h.insertAll(data);

    if (r.rowCount <= 0) {
      return false;
    } else if (!this.autoId) {
      if (options.returning) return r.rows;
      return r.rowCount;
    }

    return idlist;
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
  async update (cond, data, options={schema: null}) {

    let h = this.model(options.schema);
    options.returning && (h = h.returning(options.returning));

    let r = await h.where(cond).update(data);

    if (options.returning) return r.rows;

    return r.rowCount;
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
  async list (cond, args = {schema: null}) {

    let t = this.model(args.schema).where(cond);

    let offset = args.offset || 0;

    if (args.pagesize !== undefined) {
      t = t.limit(args.pagesize, offset);
    } else {
      t = t.limit(this.pagesize, offset);
    }
    
    if (args.order) {
      t = t.order(args.order);
    }
    
    let r = await t.select(args.field || this.selectField);

    return r.rows;

  }

  /**
   * 
   * @param cond {object} - 条件
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - field {string|array} 返回的列，默认为selectField设置的值。
   * @returns object
   */
  async get (cond = {}, options = {field: null, schema: null}) {
    let r = await this.model(options.schema)
                      .where(cond)
                      .select(options.field || this.selectField);

    if (r.rowCount <= 0) {
      return null;
    }

    return r.rows[0];
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param options {object}
   *  - schema {string} 数据库schema。
   *  - returning {string} sql语句的returning列。
   * @returns Promise
   */
  async delete (cond, options = {schema: null}) {
    let h = this.model(options.schema);
    options.returning && (h = h.returning(options.returning));

    let r = await h.where(cond).delete();
    
    if (options.returning) return r.rows;

    return r.rowCount;
  }

  /**
   * 
   * @param cond {object} - 条件
   * @param options {object}
   *  - schema {string} 数据库schema。
   * @returns Promise
   */
  async count (cond = {}, options = {schema: null}) {
    let total = await this.model(options.schema).where(cond).count();
    return total;
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

  _no_fields_error = new Error('!!必须指定fileds。');

  throwNoFieldsError (options) {
    if (!options.field) throw this._no_fields_error;
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
    if (typeof options === 'string') options = {field: options};

    this.throwNoFieldsError(options);
    
    let m = await this.model(options.schema).where(cond).max(options.field);

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
    if (typeof options === 'string') options = {field: options};

    this.throwNoFieldsError(options);
    
    let m = await this.model(options.schema).where(cond).min(options.field);

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
    if (typeof options === 'string') options = {field: options};

    this.throwNoFieldsError(options);

    let m = await this.model(options.schema).where(cond).avg(options.field);
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
    if (typeof options === 'string') options = {field: options};

    this.throwNoFieldsError(options);

    let m = await this.model(options.schema).where(cond).sum(options.field);

    if (!options.to) return m;

    return this._fmtNum(m, options);
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

  /*
   * 数据的导入导出操作。
   * 对于导出操作来说，需要先计算总数，如果数量太大则不能进行一次性导出，需要分块。
   * 对于导入来说，要检查数据是否已经变化，如果字段已经变化，则根据变化情况，进行调整。
   *
   * */
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

    if (options.field) {
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

    } else {
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
        ret = await self.list(cond, {
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
   *  - schmea {string} 导入数据库的schema。
   * @returns Promise
   */
  async dataIn (options = {}) {
    if (!options.data || !Array.isArray(options.data) ) {
      throw new Error('数据格式错误，请通过选项data传递要导入的数据，数据格式为数组。');
    }

    //loose or strict
    if (options.mode === undefined) options.mode = 'strict';

    //delete-insert update none
    if (options.update === undefined) options.update = 'delete-insert';

    let uid = this.primaryKey;

    let ks;

    let wrongs = [];

    let notin = [];

    let createList = [];

    let updateList = [];

    let idlist = [];

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
      
      ;(a[uid] === undefined) && createList.push(a);

      if (a[uid] !== undefined) {
        updateList.push(a);
        idlist.push(a[uid]);
      }
    }
    
    if (options.mode === 'strict' && (wrongs.length > 0 || notin.length > 0))
      return {
        ok: false,
        dataWrong: wrongs,
        fieldWrong: notin
      };

    let ret = await this.transaction(async (db, ret) => {
        if (createList.length > 0)
          await db.insertAll(createList);

        let cond = {};

        if (idlist.length > 0) {
          switch (options.update) {
            case 'delete-insert':
              cond[uid] = idlist;
              await db.where(cond).delete();
              await db.insertAll(updateList);
              break;

              //先检测是否存在然后确定是更新还是创建
            case 'update':
            case 'none':
              cond[uid] = idlist;
              let chklist = await db.where(cond).select(uid);
              let r;
              let updInsert = [];
              let realUpdate = [];
              let idmap = {};

              chklist.rowCount > 0 && chklist.rows.forEach(a => {
                idmap[ a[uid] ] = a;
              });

              for (let d of updateList) {
                if (idmap[ d[uid] ]) realUpdate.push(d);
                else updInsert.push(d);
              }

              if (realUpdate.length > 0 && options.update === 'update') {
                for (let d of realUpdate) {
                  cond[uid] = d[uid];
                  await db.where(cond).update(d);
                }
              }

              updInsert.length > 0 && await db.insertAll(updInsert);
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
   * 
   */
  async group (gby, options = {}) {

    let t = this.model(options.schema || null).where(options.where || {})
                              .group(gby);

    if (options.order) t = t.order(options.order);

    let r = await t.select(options.field || gby);
    
    if (r.rowCount > 0) {
      return r.rows;
    }

    return [];
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
      return await callback(db.table(this.tableName), handle);
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

  /**
   * 
   * @param debug {boolean} 
   *   - 调试模式，会输出sql以及其他提示信息。
   * @param force {boolean} 
   *   - 是否强制同步，默认为false，若为true则会强制把数据库改为和table结构一致。
   */
  async sync (debug=false, force=false) {

    if (!this.table) {
      console.error('没有table对象');
      return false;
    }

    if (!this.tableName) {
      console.error('tableName不能为空。');
      return false;
    }

    console.log(`start to sync table ${this.tableName}`)

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
            if (this.numerics.indexOf(pt) >= 0) {
              tmp.default = 0;
            } else if (this.strings.indexOf(pt) >= 0) {
              tmp.default = '';
            }
          }

          if (tmp.default !== undefined) {
            sql += `default $$${tmp.default}$$ `;
          }
          
          if (tmp.ref && tmp.references) {
            sql += tmp.references;
          }
          sql += `,`;
        }

      }

      sql = `${sql.trim().substring(0, sql.length-1)})`;
      
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
                  +'numeric_precision,numeric_scale';

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

    await this._syncColumn(inf, curTableName, debug, force);

    await this._syncIndex(curTableName, debug);

    await this._syncUnique(curTableName, debug);

    await this._removeIndex(curTableName, debug);

    await this._syncReferences(curTableName, debug);

    if (debug) {
      console.log(' - END - ');
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
  async _syncColumn (inf, curTableName, debug = false, force = false) {
    
    let pt = '';
    let real_type = '';
    let col = null;
    let sql = '';

    if (debug) {
      console.log('-- checking columns...');
    }

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

      if (col.oldName) {
        if (inf[k] === undefined && inf[col.oldName]) {
          await this.db.query(`alter table ${curTableName} rename ${col.oldName} to ${k}`);
          //保证后续的检测不会错误的创建字段。
          inf[k] = inf[col.oldName];
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
          if (this.numerics.indexOf(pt) >= 0) {
            col.default = 0;
          } else if (this.strings.indexOf(pt) >= 0) {
            col.default = '';
          }
        }

        if (col.default !== undefined) {
          sql += ` default $$${col.default}$$`;
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
              if (col.default) {
                sql += ` not null default $$${col.default}$$`;
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
          sql = `alter table ${curTableName} alter column ${k} set default $$${col.default}$$`;
          await this.db.query(sql);
        }
      }

      if (col.notNull === undefined || col.notNull) {
        if (inf[k].is_nullable === 'YES') {
          await this.db.query(`alter table ${curTableName} alter column ${k} set not null`);
        }
      }
    }

    //force模式检测若有数据表字段，在程序中未定义，则直接删除。
    if (force) {
      for (let k in inf) {
        if (!this.table.column[k]) {
          await this.db.query(`alter table ${curTableName} drop column ${k}`);
        }
      }
    }

  }

  async _checkIndex (indname, debug = false) {

    let indsplit = indname.split(',').filter(p => p.length > 0);

    let tmp = null;
    for (let i = 0; i < indsplit.length; i++) {
      
      tmp = this.table.column[ indsplit[i] ];

      if (tmp === undefined || tmp.drop || tmp.ignore) {
        
        if (debug) {
          console.error( ` -- Ignore index ${indname} -- set ignore or drop or it is undefined.` );
        }

        return false;
      }

    }

    let indtext = indname;

    /**
     * postgresql 会把联合索引多个字段使用 _ 连接。
     */
    if (indname.indexOf(',') > 0) {
      indtext = indname.replaceAll(',', '_');
    }

    //在pg_indexes中不能带上schema
    let sql = `select * from pg_indexes where `
        + `tablename='${this.tableName}' and schemaname = '${this.orm.schema}' `
        + `and indexname = '${this.tableName}_${indtext}_idx'`;
    
    let r = await this.db.query(sql);
    if (r.rowCount > 0) {
      return false;
    }

    return true;
  }

  async _syncIndex (curTableName, debug = false) {
    if (this.table.index === undefined) {
      return;
    }

    if (!this.table.index || !Array.isArray(this.table.index) ) {
      console.error('index 属性必须为数组类型，其中值为字符串');
      return;
    }

    if (debug) {
      console.log('-- checking index...');
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

    for (let i = 0; i < this.table.index.length; i++) {
      
      indname = this.table.index[i];

      if (this.table.removeIndex !== undefined
        && Array.isArray(this.table.removeIndex)
        && this.table.removeIndex.indexOf(indname) >= 0)
      {
        continue;
      }

      if (checkColumn(indname) === false) {
        console.error(`-- ${indname} ： 没有此列或包含不存在的列，无法创建索引。`);
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
      
      await this.db.query(`create index on ${curTableName} ${ind_using}(${indname})`);
    }

  }

  async _syncUnique (curTableName, debug = false) {

    if (this.table.unique === undefined) {
      return;
    }

    if (!this.table.unique || !Array.isArray(this.table.unique) ) {
      console.error('unique 属性必须为数组类型，其中值为字符串');
      return;
    }

    if (debug) {
      console.log('-- checking unique index...');
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

      await this.db.query(`create unique index on ${curTableName} (${indname})`);
    }

  }

  async _removeIndex (curTableName, debug = false) {
    if (!this.table.removeIndex || !Array.isArray(this.table.removeIndex) ) {
      return false;
    }

    if (debug) {
      console.log('try to remove the unnecessary index...')
    }

    let tind = ''
    let sql = ''

    for (let i = 0; i < this.table.removeIndex.length; i++) {
      
      //表示没有此索引
      if (true === await this._checkIndex(this.table.removeIndex[i])) {
        continue;
      }

      tind = this.table.removeIndex[i];
      
      if (tind.trim() === '') {
        continue;
      }

      while (tind.indexOf(',') > 0) {
        tind = tind.replace(',', '_');
      }

      sql = `drop index ${curTableName}_${tind}_idx`;
      try {
        if (debug) {
          console.log(sql);
        }
        await this.db.query(sql);
      } catch (err) {
        if (debug) {
          console.error(err)
        }
      }

    }

  }

  async _syncReferences (curTableName, debug = false) {
    let sql = `SELECT * FROM pg_constraint WHERE connamespace=${this.schema_oid} AND contype='f'`
              + ` AND conname ILIKE $$${this.tableName}_%$$`;
    let r = await this.db.query(sql);
    let refs = r.rows;

    let ref_keys = [];

    for (let a of refs) {
      ref_keys.push(a.conname);
    }

    let tmp_col;
    let refs_now_list = [];
    let ind = 0;
    for (let k in this.table.column) {
      tmp_col = this.table.column[k];
      if (!tmp_col.ref) continue;
      refs_now_list.push(tmp_col.refconstraint);
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

module.exports = pqmodel;
