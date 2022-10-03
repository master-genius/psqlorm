'use strict';

/**
 * 早晚有一天，需要更好的模块注入管理的方式，而不是全部抽离出npm包。
 * 在目前，这还不是一个十分必要的需求，通过复制代码即可得到轻便并且没有任何外部依赖的功能。
 */
let saltArr = [
  'o', 'u', 'v', 'x', 'w', 'z', 
  '_', '_', '_', 'x', 'x', 'o',
  'o', 'i', 'i', 'p', 'y', '_',
  'x', 'x', '_', 'q', 'o', '_'
];

function randstring (length = 5) {

  let saltstr = '';
  let ind = 0;

  for(let i=0; i<length; i++) {
    ind = parseInt( Math.random() * saltArr.length);
    saltstr += saltArr[ ind ];
  }

  return saltstr;
}

class model {

  constructor (db, tableName = '', schema = 'public', myparent = null) {
    this.odb = db;
    this.db = db;

    this.tableName = tableName;

    this.schema = schema || 'public';

    this._schema = this.schema;

    Object.defineProperty(this, 'parent', {
      value: myparent,
      enumerable: false,
      configurable: false,
      writable: false
    });

    //用于事务处理时的锁定。
    this._freeLock = false;

    this.fetchSql = false;

    this.stag = this.makeQuoteTag(6 + parseInt(Math.random() * 3));

    this.lstag = this.stag.substring(0, this.stag.length - 1);

    this.sqlUnit = {
      command : '',
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
      alias: ''
    };
    
    this.last = null;

    this.table = this.model;
  }

  init () {
    this.sqlUnit.command = '';
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
    this.last = null;
  }

  makeQuoteTag (len = 5) {
    return '$_' + randstring(len) + '_$';
  }

  model (tableName = '', schema = null) {
    if (typeof tableName === 'string' && tableName.length > 0) {
      this.tableName = tableName;
    }

    if (schema) {
      this.schema = schema;
    }

    return this;
  }

  resetSchema () {
    this.schema = this._schema;
  }

  alias (name) {
    name && (this.alias = name);
    return this;
  }

  fetch() {
    this.fetchSql = true;
    return this;
  }

  run() {
    this.fetchSql = false;
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

  //在使用replace时，$被认为是格式化字符串标识。
  /*
  qoute2 (a) {
    if (typeof a !== 'string') {
      return a;
    }
    return `$$$$${a}$$$$`;
  }
  */

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

  join (table, on, join_type = 'INNER') {
    this.sqlUnit.join += `${join_type} JOIN ${this.schema}.${table} ON ${on} `;
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
    if (Array.isArray(cols))
      this.sqlUnit.returning = ' returning ' + cols.join(',');
    else if (typeof cols === 'string' && cols !== '')
      this.sqlUnit.returning = ' returning ' + cols;
    else
      this.sqlUnit.returning = '';

    return this;
  }

  psql() {
    let sql = '';
    let schemaTable = `${this.schema}.${this.tableName}`;

    if (this.sqlUnit.alias) schemaTable += ` as ${this.sqlUnit.alias}`;

    switch (this.sqlUnit.command) {
      case 'SELECT':
        sql = `SELECT ${this.sqlUnit.fields} FROM ${schemaTable} ${this.sqlUnit.join} `
            + `${this.sqlUnit.where.length > 0 ? 'WHERE ' : ''}${this.sqlUnit.where} `
            + `${this.sqlUnit.group}${this.sqlUnit.order}${this.sqlUnit.limit};`;
        break;

      case 'DELETE':
        sql = `DELETE FROM ${schemaTable} ${this.sqlUnit.where.length > 0 ? 'WHERE ' : ''}${this.sqlUnit.where}${this.sqlUnit.returning};`;
        break;

      case 'UPDATE':
        sql = `UPDATE ${schemaTable} SET ${this.sqlUnit.values} ${this.sqlUnit.where.length > 0 ? ' WHERE ' : ''} ${this.sqlUnit.where}${this.sqlUnit.returning};`;
        break;

      case 'INSERT':
        sql = `INSERT INTO ${schemaTable} ${this.sqlUnit.fields} VALUES ${this.sqlUnit.values}${this.sqlUnit.returning};`;
        break;

    }
    return sql;
  }

  async exec () {
    let sql = this.psql();
    this.init();
    if (this.fetchSql) {
      return sql;
    }

    try {
      let r = await this.db.query(sql);
      return r;
    } catch (err) {
      throw err;
    } finally {
      if (!this._freeLock) {
        this._freeLock = false;
        this.parent.free(this);
      }
    }
  }

  async select (fields = '*') {
    this.sqlUnit.command = 'SELECT';
    if ( Array.isArray(fields) ) {
      this.sqlUnit.fields = fields.join(',');
    } else if (typeof fields === 'string') {
      this.sqlUnit.fields = fields;
    }
    return this.exec();
  }

  async delete () {
    this.sqlUnit.command = 'DELETE';
    return this.exec();
  }

  async insert (data) {
    let fields = Object.keys(data);
    this.sqlUnit.command = 'INSERT';
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

    this.sqlUnit.command = 'INSERT';
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
    this.sqlUnit.command = 'UPDATE';
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

  async count () {
    let r = await this.select('COUNT(*) as total');
    return parseInt(r.rows[0].total);
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
    let r = await this.select(`avg(${field}) as average`);
    if (to) return this.toValue(r.rows[0].average, to, prec);

    return r.rows[0].average;
  }

  async max (field, to = '', prec = 1) {
    let r = await this.select(`max(${field}) as m`);
    if (to) return this.toValue(r.rows[0].m, to, prec);
    return r.rows[0].m;
  }

  async min (field, to = '', prec = 1) {
    let r = await this.select(`min(${field}) as m`);
    if (to) return this.toValue(r.rows[0].m, to, prec);
    return r.rows[0].m;
  }

  async sum (field, to = '', prec = 1) {
    let r = await this.select(`sum(${field}) as sum_value`);
    if (to) return this.toValue(r.rows[0].sum_value, to, prec);
    return r.rows[0].sum_value;
  }

  async transaction (callback) {
    if (typeof callback !== 'function' || callback.constructor.name !== 'AsyncFunction') {
      throw new Error('callback must be async function');
    }
    
    let finalRet = {
      result : null,
      ok : true,
      errmsg : '',
      error: null
    }

    try {
      this.db = await this.odb.connect();
      //事务中，锁定释放。
      this._freeLock = true;

      await this.db.query('BEGIN');
      let cret = await callback(this);
      
      if ((cret && typeof cret === 'object' && cret.ok === false) || cret === false) {
        if (cret && cret.error) throw cret.error;

        let errmsg = (cret && cret.errmsg) ? cret.errmsg : 'Transaction failed';
        throw new Error(errmsg);
      }

      await this.db.query('COMMIT');
    
      finalRet.result = (cret && typeof cret === 'object' && !Array.isArray(cret)) ? (cret.result || null) : cret;
    } catch (err) {
      this.db.query('ROLLBACK');
      finalRet.errmsg = err.message || 'Transaction failed';
      finalRet.ok = false;
      finalRet.error = err;
    } finally {
      this.db.release();
      this.db = this.odb;
      this._freeLock = false;
      this.parent.free(this);
    }
    
    return finalRet;
  }

}

module.exports = model;
