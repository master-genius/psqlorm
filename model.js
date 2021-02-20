class model {

    //schema = '' default public
  constructor (db, tableName = '', schema = 'public', myparent = null) {
    this.odb = db;
    this.db = db;

    this.tableName = tableName;
    this.schema = schema || 'public';

    this.parent = myparent;

    //用于事务处理时的锁定。
    this._freeLock = false;

    this.fetchSql = false;
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
      group: ''
    };
    this.last = null;
  }

  init () {
    this.sqlUnit.command = '';
    this.sqlUnit.values = '';
    this.sqlUnit.table = '';
    this.sqlUnit.fields = '';
    this.sqlUnit.where = '';
    this.sqlUnit.limit = '';
    this.sqlUnit.offset = 0;
    this.sqlUnit.join = '';
    this.sqlUnit.order = '';
    this.sqlUnit.group = '';
    this.last = null;
  }

  model (tableName = '', schema = null) {
    if (typeof tableName === 'string' && tableName.length > 0) {
      this.tableName = tableName;
      return this;
    }

    if (schema !== null) {
      this.schema = schema;
    }

    return this;
  }

  alias (name) {
    
    this.tableName += ` as ${name}`;

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

    return `$$${a}$$`;
  }

  //在使用replace时，$被认为是格式化字符串标识，目前不需要。
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

      //for (let i=0; i<args.length; i++) {
      //  cond = cond.replace('?', `${this.qoute2(args[i])}`);
      //}

      if (this.sqlUnit.where.length > 0) {
        this.sqlUnit.where += ' AND ';
      }
      this.sqlUnit.where += whstr;

    } else if (typeof cond === 'object') {
      let tmp = [];
      let t = null;
      let vals = [];
      for (let k in cond) {
        
        if (cond[k] instanceof Array) {
          vals = [];
          for (let i=0; i<cond[k].length; i++) {
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

  order (ostr) {
    this.sqlUnit.order = `ORDER BY ${ostr} `;
    return this;
  }

  limit (count, offset = 0) {
    this.sqlUnit.limit = `LIMIT ${count} OFFSET ${offset}`;
    return this;
  }

  psql() {
    var sql = '';
    var schemaTable = `${this.schema}.${this.tableName}`;

    switch (this.sqlUnit.command) {
      case 'SELECT':
        sql = `SELECT ${this.sqlUnit.fields} FROM ${schemaTable} ${this.sqlUnit.join} `
            + `${this.sqlUnit.where.length > 0 ? 'WHERE ' : ''}${this.sqlUnit.where} `
            + `${this.sqlUnit.group}${this.sqlUnit.order}${this.sqlUnit.limit};`;
        break;

      case 'DELETE':
        sql = `DELETE FROM ${schemaTable} WHERE ${this.sqlUnit.where};`;
        break;

      case 'UPDATE':
        sql = `UPDATE ${schemaTable} SET ${this.sqlUnit.values} `
          +`${this.sqlUnit.where.length > 0 ? ' WHERE ' : ''} ${this.sqlUnit.where};`;
        break;

      case 'INSERT':
        sql = `INSERT INTO ${schemaTable} ${this.sqlUnit.fields} VALUES ${this.sqlUnit.values};`;
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
    if (fields instanceof Array) {
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
    if (!(data instanceof Array) || data.length == 0) {
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

  async avg (field) {
    let r = await this.select(`avg(${field}) as average`);
    return r.rows[0].average;
  }

  async max (field) {
    let r = await this.select(`max(${field}) as m`);
    return r.rows[0].m;
  }

  async min (field) {
    let r = await this.select(`min(${field}) as m`);
    return r.rows[0].m;
  }

  async sum (field) {
    let r = await this.select(`sum(${field}) as sum_value`);
    return r.rows[0].sum_value;
  }

  async transaction (callback) {
    if (typeof callback !== 'function' || callback.constructor.name !== 'AsyncFunction') {
      throw new Error('callback must be async function');
    }
    
    var finalRet = {
      result : null,
      ok : true,
      errmsg : ''
    }

    try {

      this.db = await this.odb.connect();

      //事务中，锁定释放。
      this._freeLock = true;

      await this.db.query('BEGIN');
      
      let cret = await callback(this);
      
      if ((cret && typeof cret === 'object' && cret.failed === true) || cret === false) {
        throw new Error(cret.errmsg || 'Transaction failed.');
      }

      await this.db.query('COMMIT');
    
      finalRet.result = cret;

    } catch (err) {
      //console.error('--DEBUG--', err.message);
      this.db.query('ROLLBACK');
      finalRet.errmsg = err.message;
      finalRet.ok = false;
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
