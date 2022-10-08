'use strict';

const randstring = require('./randstring.js');
const makeId = require('./makeId.js');

let saltArr = [
  'o', 'u', 'v', 'x', 'w', 'z', 
  '_', '_', '_', 'x', 'x', 'o',
  'o', 'i', 'i', 'p', 'y', '_',
  'x', 'x', '_', 'q', 'o', '_'
];

let commandTable = {
  INSERT: '1',
  INSERTS: '2',
  GET: '3',
  SELECT: '4',
  UPDATE: '5',
  DELETE: '6'
}
/* 
let beforeEventName = {};
beforeEventName[ commandTable.INSERT ] = 'beforeInsert';
beforeEventName[ commandTable.INSERTS ] = 'beforeInsert';
beforeEventName[ commandTable.UPDATE ] = 'beforeUpdate';
beforeEventName[ commandTable.DELETE ] = 'beforeDelete';
 */
let eventName = {};
eventName[ commandTable.INSERT ] = 'insert';
eventName[ commandTable.INSERTS ] = 'insert';
eventName[ commandTable.UPDATE ] = 'update';
eventName[ commandTable.DELETE ] = 'delete';

let state = {
  USING: 1,
  FREE: 0
};

class Model {

  constructor (db, tableName = '', schema = 'public', myparent = null, trigger = null) {
    this.odb = db;
    this.db = db;

    this.tableName = tableName;

    this.__schema__ = schema || 'public';

    this._schema = this.__schema__;

    Object.defineProperty(this, 'parent', {
      value: myparent,
      enumerable: false,
      configurable: false,
      writable: false
    });

    Object.defineProperty(this, 'makeId', {
      value: makeId,
      enumerable: true,
      configurable: false,
      writable: false
    });

    this.tableTrigger = trigger;

    //用于事务处理时的锁定。
    this.__free_lock__ = false;

    this.state = state;

    this.__state__ = this.state.USING;

    this.__fetch_sql__ = false;

    this.stag = this.makeQuoteTag(6 + parseInt(Math.random() * 3));

    this.lstag = this.stag.substring(0, this.stag.length - 1);

    this.sqlUnit = {
      command : 0,
      values : '',
      fields : '',
      table : '',
      where : '',
      limit : '',
      order : '',
      offset : 0,
      join : '',
      group: '',
      returning: '',
      alias: '',
      selectFor: ''
    };
    
    this.__id_len__ = 12;
    this.__id_pre__ = '';
    this.__auto_id__ = false;
    this.__primary_key__ = 'id';
    //this.__trigger_before__ = false;
    this.__trigger_after__ = false;
    this.__trigger_commit__ = false;
    this.__transaction__ = false;
    this.commitTriggers = [];
  }

  init () {
    this.sqlUnit.command = 0;
    this.sqlUnit.values = '';
    this.sqlUnit.table = '';
    this.sqlUnit.alias = '';
    this.sqlUnit.fields = '';
    this.sqlUnit.where = '';
    this.sqlUnit.limit = '';
    this.sqlUnit.offset = 0;
    this.sqlUnit.join = '';
    this.sqlUnit.order = '';
    this.sqlUnit.group = '';
    this.sqlUnit.returning = '';
    this.sqlUnit.selectFor = '';
    //this.__trigger_before__ = false;
    this.__trigger_after__ = false;
    this.__trigger_commit__ = false;
  }

  resetIdInfo () {
    this.__auto_id__ = false;
    this.__primary_key__ = 'id';
    this.__id_len__ = 12;
    this.__id_pre__ = '';
  }

  makeQuoteTag (len = 5) {
    return '$_' + randstring(len, saltArr) + '_$';
  }

  /* triggerBefore (on = true) {
    this.__trigger_before__ = on;
    return this;
  } */

  trigger (on = true) {
    if (this.__transaction__) {
      this.__trigger_commit__ = on;
    } else {
      this.__trigger_after__ = on;
    }
    return this;
  }

  triggerCommit (on = true) {
    this.__trigger_commit__ = on;
    return this;
  }

  getSchema () {
    return this.__schema__;
  }

  schema (name) {
    this.__schema__ = name;
    return this;
  }

  autoId (b = true) {
    this.__auto_id__ = b;
    return this;
  }

  setIdLen (ilen) {
    if (typeof ilen === 'number' && ilen > 6) this.__id_len__ = ilen;
    return this;
  }

  setIdPre (pre = '') {
    this.__id_pre__ = pre;
    return this;
  }

  returningPrimary () {
    if (this.__primary_key__) this.returning(th.__primary_key__);
    return this;
  }

  primaryKey (k) {
    this.__primary_key__ = k;
    return this;
  }

  table (tableName = '', schema = null) {
    if (typeof tableName === 'string' && tableName.length > 0) {
      this.tableName = tableName;
    }

    if (schema) {
      this.__schema__ = schema;
    }

    return this;
  }

  resetSchema () {
    this.__schema__ = this._schema;
    return this;
  }

  alias (name) {
    name && (this.alias = name);
    return this;
  }

  fetch() {
    this.__fetch_sql__ = true;
    return this;
  }

  run() {
    this.__fetch_sql__ = false;
    return this;
  }

  qoute (a) {
    if (typeof a === 'number') {
      return a;
    }

    if (a.indexOf(this.lstag) >= 0) {
      a = a.replaceAll(this.lstag, '');
    }

    return this.stag + a + this.stag;
  }

  /**
   * 
   * @param {string | object} cond 条件，如果是字符串，args表示字符串中?要替换的参数
   * @param {array} args 
   */  
  where (cond, args = []) {
    if (typeof cond === 'string') {
      let whstr = '';
      if (cond.indexOf('?') < 0) {
        whstr = cond;
      } else {
        let carr = cond.split('?');
        let condarr = [];
        for (let i=0; i<args.length; i++) {
          condarr.push(carr[i]);
          condarr.push( this.qoute(args[i]) );
        }
        condarr.push(carr[carr.length-1]);
        whstr = condarr.join('');
        carr = condarr = null;
      }

      if (this.sqlUnit.where.length > 0 && whstr.length > 0) {
        this.sqlUnit.where += ' AND ';
      }

      this.sqlUnit.where += whstr;

    } else if (typeof cond === 'object') {
      let tmp = [];
      let t = null;
      let vals = [];
      for (let k in cond) {
        if (k[0] === '[' && k.length > 1) {
          this.where(k.substring(1, k.length-1), cond[k]);
          continue;
        }

        if ( Array.isArray(cond[k]) ) {
          vals = [];
          for (let i = 0; i < cond[k].length; i++) {
            vals.push(this.qoute(cond[k][i]));
          }
          tmp.push(`${k} IN (${vals.join(',')})`);
          continue;
        }
        
        t = typeof cond[k];

        if (t === 'number' || t === 'string') {
          tmp.push(`${k}=${this.qoute(cond[k])}`);
        } else if (t === 'object') {
          for (let ks in cond[k]) {
            tmp.push(`${k} ${ks} ${this.qoute(cond[k][ks])}`);
          }
        }
      }
      
      if (tmp.length > 0) {
        if (this.sqlUnit.where.length > 0) {
          this.sqlUnit.where += ' AND ';
        }
        this.sqlUnit.where += tmp.join(' AND ');
      }
      
    }
    return this;
  }

  forUpdate (k = '') {
    if (!k) {
      this.sqlUnit.selectFor = ' FOR UPDATE';
    } else {
      this.sqlUnit.selectFor = ' FOR NO KEY UPDATE';
    }
    return this;
  }

  forShare (k = '') {
    if (!k) {
      this.sqlUnit.selectFor = ' FOR SHARE';
    } else {
      this.sqlUnit.selectFor = ' FOR KEY SHARE';
    }
    return this;
  }

  join (table, on, join_type = 'INNER') {
    this.sqlUnit.join += `${join_type} JOIN ${this.__schema__}.${table} ON ${on} `;
    return this;
  }

  leftJoin (table, on) {
    return this.join(table, on, 'LEFT');
  }

  rightJoin(table, on) {
    return this.join(table, on, 'RIGHT');
  }

  group (grpstr) {
    this.sqlUnit.group = `GROUP BY ${grpstr} `;
    return this;
  }

  order (ostr, otype = '') {
    if (this.sqlUnit.order) {
      this.sqlUnit.order += `,${ostr} ${otype}`;
    } else {
      this.sqlUnit.order = `ORDER BY ${ostr} ${otype}`;
    }

    return this;
  }

  limit (count, offset = 0) {
    if (count <= 0) {
      this.sqlUnit.limit = `OFFSET ${offset}`;
    } else {
      this.sqlUnit.limit = `LIMIT ${count} OFFSET ${offset}`;
    }

    return this;
  }

  returning (cols) {
    let retstr;

    if (Array.isArray(cols))
      retstr = cols.join(',');
    else if (typeof cols === 'string' && cols !== '')
      retstr = cols;
    else
      retstr = '';

    if (this.sqlUnit.returning) {
      if (retstr) this.sqlUnit.returning += ',' + retstr;
    } else {
      this.sqlUnit.returning = ' returning ' + retstr;
    }

    return this;
  }

  psql() {
    let sql = '';
    let schemaTable = `${this.__schema__}.${this.tableName}`;

    if (this.sqlUnit.alias) schemaTable += ` as ${this.sqlUnit.alias}`;

    switch (this.sqlUnit.command) {
      case commandTable.SELECT:
      case commandTable.GET:
        sql = `SELECT ${this.sqlUnit.fields} FROM ${schemaTable} ${this.sqlUnit.join} `
            + `${this.sqlUnit.where.length > 0 ? 'WHERE ' : ''}${this.sqlUnit.where} `
            + `${this.sqlUnit.group}${this.sqlUnit.order}${this.sqlUnit.limit}${this.sqlUnit.selectFor};`;
        break;

      case commandTable.DELETE:
        sql = `DELETE FROM ${schemaTable} ${this.sqlUnit.where.length > 0 ? 'WHERE ' : ''}${this.sqlUnit.where}${this.sqlUnit.returning};`;
        break;

      case commandTable.UPDATE:
        sql = `UPDATE ${schemaTable} SET ${this.sqlUnit.values} ${this.sqlUnit.where.length > 0 ? ' WHERE ' : ''} ${this.sqlUnit.where}${this.sqlUnit.returning};`;
        break;

      case commandTable.INSERT:
      case commandTable.INSERTS:
        sql = `INSERT INTO ${schemaTable} ${this.sqlUnit.fields} VALUES ${this.sqlUnit.values}${this.sqlUnit.returning};`;
        break;
    }

    return sql;
  }

  async exec () {
    if (this.__state__ === this.state.FREE) {
      console.error('\n\x1b[2;31;47msql执行后会自动释放模型，若需要重复使用，请调用connect()持有当前Model实例，并在执行完毕后调用free()释放。\n您可能是使用了中间变量保存模型实例并多次运行。Model.prototype.connect()可以让您持有此模型实例。Model.prototype.free()用于将模型实例释放到连接池。\x1b[0m\n');
      throw new Error(`Model实例处于释放状态，重复使用可能会导致冲突。提示：connect()用于持有此模型实例，free()用于释放模型实例。\n`);
    }

    if (!this.tableName) {
      throw new Error('您运行的是初始状态的Model，未指定table，请通过方法table(name)设定table名称再次执行。');
    }

    let sql = this.psql();
    let comm = this.sqlUnit.command;
    //let is_trigger_b = this.__trigger_before__;
    let is_trigger = this.__trigger_after__;
    let is_trigger_m = this.__trigger_commit__;

    this.init();
    if (this.__fetch_sql__) return sql;

    try {
      let ename;

      /* if (is_trigger_b && this.tableTrigger) {
        ename = beforeEventName[comm];
        ename && this.tableTrigger.emit(ename, this.__schema__, this.tableName, ename, sql, null);
      } */

      let r = await this.db.query(sql);

      let rdata;

      switch (comm) {
        case commandTable.SELECT:
          rdata = r.rows || [];
          break;

        case commandTable.GET:
          rdata = r.rowCount > 0 ? r.rows[0] : null;
          break;

        case commandTable.INSERT:
          rdata = r.rows.length > 0 ? r.rows[0] : r.rowCount;
          break;

        case commandTable.INSERTS:
        case commandTable.DELETE:
        case commandTable.UPDATE:
          if (r.rows.length > 0) {
            rdata = (r.rows.length === 1 ? r.rows[0] : r.rows);
          } else {
            rdata = r.rowCount;
          }
      }

      if ((is_trigger || is_trigger_m) && this.tableTrigger) {
        ename = eventName[comm];
        if (is_trigger_m) {
          this.commitTriggers.push([
            this.__schema__, this.tableName, ename, sql, rdata
          ]);
        } else {
          ename && this.tableTrigger.emit(ename, this.__schema__, this.tableName, ename, sql, rdata);
        }
      }

      return rdata !== undefined ? rdata : r;
    } catch (err) {
      throw err;
    } finally {
      if (!this.__free_lock__) {
        this.__free_lock__ = false;
        this.parent.free(this);
      }
    }
  }

  async get (fields = '*') {
    return this.select(fields, true);
  }

  async select (fields = '*', first = false) {
    this.sqlUnit.command = first ? commandTable.GET : commandTable.SELECT;
    if ( Array.isArray(fields) ) {
      this.sqlUnit.fields = fields.join(',');
    } else if (typeof fields === 'string') {
      this.sqlUnit.fields = fields;
    }

    return this.exec();
  }

  async delete () {
    this.sqlUnit.command = commandTable.DELETE;
    return this.exec();
  }

  async insert (data) {
    if (this.__auto_id__ 
      && this.__primary_key__ 
      && data[this.__primary_key__] === undefined)
    {
      data[this.__primary_key__] = makeId(this.__id_len__, this.__id_pre__);
    }

    let fields = Object.keys(data);
    this.sqlUnit.command = commandTable.INSERT;
    this.sqlUnit.fields = `(${fields.join(',')})`;
    let vals = [];
    for (let k in data) {
      vals.push(`${this.qoute(data[k])}`);
    }
    this.sqlUnit.values = `(${vals.join(',')})`;
    return this.exec();
  }

  async insertAll (data) {
    if (!Array.isArray(data) || data.length == 0) {
      throw new Error('data must be array and length > 0');
    }

    if (this.__auto_id__ && this.__primary_key__) {
      for (let i = 0; i < data.length; i++) {
        if (data[i][this.__primary_key__] === undefined)
          data[i][this.__primary_key__] = makeId(this.__id_len__, this.__id_pre__);
      }
    }

    this.sqlUnit.command = commandTable.INSERTS;
    let fields = Object.keys(data[0]);

    this.sqlUnit.fields = `(${fields.join(',')})`;
    
    let vals = [];
    let vallist = [];

    for (let i=0; i < data.length; i++) {
      vals = [];
      for (let k in data[i]) {
        vals.push(`${this.qoute(data[i][k])}`);
      }
      vallist.push(`(${vals.join(',')})`);
    }
    
    this.sqlUnit.values = `${vallist.join(',')}`;

    return this.exec();
  }

  async update (data) {
    this.sqlUnit.command = commandTable.UPDATE;
    if (typeof data === 'string') {
      this.sqlUnit.values = data;
    } else {
      let vals = [];

      for (let k in data) {

        if (k[0] === '@') {
          vals.push(`${k.substring(1)}=${data[k]}`);
          continue;
        }

        vals.push(`${k}=${this.qoute(data[k])}`);
      }

      this.sqlUnit.values = `${vals.join(',')}`;
    }
    return this.exec();
  }

  async count (count_column = '*') {
    let r = await this.get(`COUNT(${count_column}) as total`);
    return parseInt(r.total);
  }

  toValue (val, type, prec = 0) {
    switch (type) {
      case 'int':
        return parseInt(val);

      case 'float':
        return parseFloat(val);

      case 'fixed':
        let a = parseFloat(val);
        if (isNaN(a)) return val;
        return parseFloat( a.toFixed(prec) );
    }

    return val;
  }

  async avg (field, to = '', prec = 1) {
    let r = await this.get(`avg(${field}) as average`);
    if (to) return this.toValue(r.average, to, prec);

    return r.average;
  }

  async max (field, to = '', prec = 1) {
    let r = await this.get(`max(${field}) as m`);
    if (to) return this.toValue(r.m, to, prec);
    return r.m;
  }

  async min (field, to = '', prec = 1) {
    let r = await this.get(`min(${field}) as m`);
    if (to) return this.toValue(r.m, to, prec);
    return r.m;
  }

  async sum (field, to = '', prec = 1) {
    let r = await this.get(`sum(${field}) as sum_value`);
    if (to) return this.toValue(r.sum_value, to, prec);
    return r.sum_value;
  }

  free () {
    this.parent.free(this);
  }

  /**
   * 锁定模型，不释放。
   * @returns {this}
   */
  connect () {
    if (this.__state__ === this.state.FREE) {
      let m = new this.constructor(this.odb,
                              this.tableName,
                              this.__schema__,
                              this.parent,
                              this.tableTrigger);
      m.__free_lock__ = true;
      return m;
      //throw new Error(`无法连接模型实例，您可能进行了错误操作：先执行sql然后再次调用connect()`);
    }

    this.__free_lock__ = true;
    return this;
  }

  /**
   * 
   * @param {object} db 数据库连接的pg.Client客户端实例
   * @returns {this}
   */
  bind (db) {
    if (db.constructor.name === 'Model' || db.db) {
      this.db = db.db;
      this.commitTriggers = db.commitTriggers;
      //this.__trigger_commit__ = db.__trigger_commit__;
      this.__free_lock__ = true;
      this.__transaction__ = db.__transaction__;
    } else {
      this.db = db;
    }
    return this;
  }

  async transaction (callback) {
    if (typeof callback !== 'function' || callback.constructor.name !== 'AsyncFunction') {
      throw new Error('callback must be async function');
    }
    
    let finalRet = {
      result : null,
      ok : null,
      message : '',
      error: null,
      throwFailed: (err = 'Transaction failed') => {
        finalRet.ok = false;
        let ty = typeof err;
        if (ty !== 'object') throw new Error(err);
        throw err;
      },
      failed: (errmsg = 'Transaction failed') => {
        finalRet.ok = false;
        finalRet.message = errmsg;
      },
    }

    try {
      this.db = await this.odb.connect();
      //事务中，锁定释放。
      this.__free_lock__ = true;
      this.__transaction__ = true;

      await this.db.query('BEGIN');
      
      let rval = await callback(this, finalRet);
      if (finalRet.ok === false) {
        throw new Error(finalRet.message);
      }

      await this.db.query('COMMIT');

      if (this.commitTriggers.length > 0 && this.tableTrigger) {
        let tlen = this.commitTriggers.length;
        let tmp;
        for (let i = 0; i < tlen; i++) {
          tmp = this.commitTriggers[i];
          // 0:schema 1:table 2:evtname 3:sql 4:data
          this.tableTrigger.emit(tmp[2], tmp[0], tmp[1], tmp[2], tmp[3], tmp[4]);
        }
      }

      ;(finalRet.ok === null) && (finalRet.ok = true);
      ;(rval !== undefined && finalRet.result === null) && (finalRet.result = rval);
    } catch (err) {
      this.db.query('ROLLBACK');
      finalRet.message = err.message || 'Transaction failed';
      finalRet.ok = false;
      finalRet.error = err;
    } finally {
      this.db.release();
      this.db = this.odb;
      this.__free_lock__ = false;
      this.parent.free(this);
    }
    
    return finalRet;
  }

}

module.exports = Model;
