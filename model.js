'use strict';

const randstring = require('./randstring.js');
const makeId = require('./makeId.js');
const makeTimestamp = require('./makeTimestamp.js')
const forbidColumns = require('./forbidColumns.js')

let modelErrorText = '\n\x1b[2;31;47mWarning: model执行后会自动释放模型，'
    + '若需要重复使用，请调用connect()持有当前model实例，并在执行完毕后调用free()释放。\n'
    + '你可能使用了中间变量保存模型实例并多次运行。Model.prototype.connect()可以让您持有此模型实例。'
    + 'Model.prototype.free()用于将模型实例释放到连接池。\x1b[0m\n\n'
    + '\x1b[1;35m程序仍然可以继续执行，因为使用了copy方法复制自身创建了新的model，'
    + '请尽可能修改代码保证更好的性能以及稳定运行！！\n'
    + '如果有必要，请在初始化数据连接后调用psqlorm.prototype.ignoreCopyWarning()方法忽略警告！！\x1b[0m\n';
    
let saltArr = [
  'o', 'u', 'v', 'x', 'w', 'z', 
  '_', '_', '_', 'x', 'x', 'o',
  'o', 'i', 'i', 'p', 'y', '_',
  'x', 'x', '_', 'q', 'o', 'n',
  'v', 'u', 'k', 'g', 't'
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

  constructor(db, tableName='', schema='public', myparent=null, trigger=null) {
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

    this.makeId = makeId.serialId;
    this.bigId = makeId.bigId;

    this.tableTrigger = trigger;

    //用于事务处理时的锁定。
    this.__free_lock__ = false;
    this.state = state;
    this.__state__ = this.state.USING;
    this.__fetch_sql__ = false;
    this.__log_sql__ = null;
    this.__validate__ = null;
    this.__fmtfields__ = null;

    this.stag = this.makeQuoteTag(5 + parseInt(Math.random() * 5));
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
    
    this.__id_len__ = 16;
    this.__id_pre__ = '';
    this.__auto_id__ = false;
    this.__primary_key__ = 'id';
    this.__pkey_type__ = 'v';
    this.__insert_timestamp__ = null;
    this.__update_timestamp__ = null;
    //this.__trigger_before__ = false;
    this.__trigger_after__ = false;
    this.__trigger_commit__ = false;
    this.__transaction__ = false;
    this.commitTriggers = [];
  }

  //此方法的主要目的是如果检测到使用已经释放的model执行sql，则自动copy一个新的model去执行。
  //需要注意的是：自动复制以后，需要执行init防止再次引用现在的model因为旧有的数据导致错误。
  copy(autoInit=false) {
    let m = new this.constructor(this.odb, this.tableName, this.__schema__, this.parent, this.tableTrigger);
 
    //如果是事务操作，则新的model也是事务操作。
    m.db = this.db;
    m.__schema__ = this.__schema__;
    m._schema = this._schema;
    //复制以后也要init现在的model。
    for (let k in this.sqlUnit) m.sqlUnit[k] = this.sqlUnit[k];

    m.__id_len__ = this.__id_len__;
    m.__id_pre__ = this.__id_pre__;
    m.__auto_id__ = this.__auto_id__;
    m.__primary_key__ = this.__primary_key__;
    m.__transaction__ = this.__transaction__;
    m.__trigger_commit__ = this.__trigger_commit__;
    m.__trigger_after__ = this.__trigger_after__;
    m.__pkey_type__ = this.__pkey_type__;
    //m.__free_lock__ = this.__free_lock__;
    m.__insert_timestamp__ = this.__insert_timestamp__;
    m.__update_timestamp__ = this.__update_timestamp__;
    /**
     * 复制的新模型处于锁定状态，执行sql以后不会自动释放到连接池，开发者可以继续执行新的sql。
     * 如果是false，则执行后会自动释放回连接池，此时如果开发者不了解内部设计，再次重复使用。
     * 会导致再次创建新的model，如此频繁的操作会影响性能。
     * 另一个原因是，避免放回连接池后，被其他引用导致无法预知的错误。
     * */
    m.__free_lock__ = true;

    m.commitTriggers = this.commitTriggers;
    m.__log_sql__ = this.__log_sql__;
    m.__fetch_sql__ = this.__fetch_sql__;
    
    autoInit && this.init();
    m.__validate__ = this.__validate__;
    m.__fmtfields__ = this.__fmtfields__;

    return m;
  }

  init() {
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
    this.__log_sql__ = null;
    this.__pkey_type__ = 'v';
    this.__insert_timestamp__ = null;
    this.__update_timestamp__ = null;
    this.__validate__ = null;
    this.__fmtfields__ = null;
  }

  resetIdInfo() {
    this.__auto_id__ = false;
    this.__primary_key__ = 'id';
    this.__id_len__ = 16;
    this.__id_pre__ = '';
    this.__pkey_type__ = 'v';
  }

  makeQuoteTag(len = 5) {
    return '$_' + randstring(len, saltArr) + '_$';
  }

  trigger(on = true) {
    if (this.__transaction__) {
      this.__trigger_commit__ = on;
    } else {
      this.__trigger_after__ = on;
    }
    return this;
  }

  triggerCommit(on = true) {
    this.__trigger_commit__ = on;
    return this;
  }

  getSchema() {
    return this.__schema__;
  }

  schema(name) {
    name && (this.__schema__ = name);
    return this;
  }

  autoId(b=true) {
    this.__auto_id__ = b;
    if (b === 'b' || b === 'v') this.__pkey_type__ = b;
    return this;
  }

  setIdLen(ilen) {
    if (typeof ilen === 'number' && ilen > 6) this.__id_len__ = ilen;
    return this;
  }

  setIdPre(pre='') {
    this.__id_pre__ = pre;
    return this;
  }

  returningPrimary() {
    if (this.__primary_key__) this.returning(th.__primary_key__);
    return this;
  }

  primaryKey(k) {
    this.__primary_key__ = k;
    return this;
  }

  table(tableName='', schema=null) {
    if (typeof tableName === 'string' && tableName.length > 0) {
      this.tableName = tableName;
    }

    if (schema) {
      this.__schema__ = schema;
    }

    return this;
  }

  resetSchema() {
    this.__schema__ = this._schema;
    return this;
  }

  alias(name) {
    name && (this.sqlUnit.alias = name);
    return this;
  }

  fetchSql(b=true) {
    this.__fetch_sql__ = b;
    return this;
  }

  logSql(callback=null) {
    if (callback && typeof callback === 'function') {
      this.__log_sql__ = callback;
    }

    return this;
  }

  /**
   * 
   * @param {object} tobj
   *  - insert {array}
   *  - update {array} 
   * @returns this
   */
  timestamp(tobj) {
    if (tobj) {
      (tobj.insert !== undefined) && (this.__insert_timestamp__ = tobj.insert);
      (tobj.update !== undefined) && (this.__update_timestamp__ = tobj.update);
    } else {
      this.__insert_timestamp__ = null;
      this.__update_timestamp__ = null;
    }

    return this;
  }

  quote(a) {
    if (a === undefined) throw new Error('传递了undefined值，请检查');

    if (typeof a === 'number') {
      return a;
    }

    if (a.indexOf(this.lstag) >= 0) {
      a = a.replaceAll(this.lstag, '');
    }

    return this.stag + a + this.stag;
  }

  whereIf(icond, cond, args=[]) {
    if (icond) return this.where(cond, args);
    return this;
  }

  /**
   * 
   * @param {string | object} cond 条件，如果是字符串，args表示字符串中?要替换的参数
   * @param {array} args 
   */  
  where(cond, args=[]) {
    let andstr = '';
    if (typeof cond === 'string') {
      let whstr = '';
      let typ = typeof args;
      let real_field = this.__fmtfields__ ? (this.__fmtfields__[cond]||cond) : cond;

      if (args === undefined)
        throw new Error(`${cond} 传递了undefined值，请检查参数输入。`);

      switch (typ) {
        case 'number':
          whstr = real_field + '=' + args;
          break;

        case 'string':
          whstr = real_field + '=' + this.quote(args);
          break;

        case 'object':
          if (Array.isArray(args)) {
            if (cond.indexOf('?') < 0) {
              whstr = cond;
            } else {
              let carr = cond.split('?');
              let condarr = [];

              for (let i=0; i < args.length; i++) {
                condarr.push(carr[i]);
                condarr.push( this.quote(args[i]) );
              }

              condarr.push(carr[carr.length-1]);
              whstr = condarr.join('');
              carr = condarr = null;
            }
          } else if (args === null) {
            whstr = real_field + ' is null';
          }
          break;
      }
      //end switch

      if (this.sqlUnit.where && whstr) {
        andstr = ' and ';
      }

      this.sqlUnit.where += andstr + whstr;

    } else if (typeof cond === 'object' && cond !== null) {
      let tmp = [];
      let t = null;
      let vals = [];
      let fmt_k = '';
      let cond_value = '';
      for (let k in cond) {
        if (k[0] === '[' && k.length > 1) {
          this.where(k.substring(1, k.length-1), cond[k]);
          continue;
        }

        cond_value = cond[k];
        
        if (this.__fmtfields__) {
          fmt_k = this.__fmtfields__[k];
          fmt_k && (k = fmt_k);
        }

        if ( Array.isArray(cond_value) ) {
          if (cond_value.length === 0) {
            throw new Error(`${k} 传递了空数组。`);
          }

          vals = [];
          for (let i = 0; i < cond_value.length; i++) {
            vals.push(this.quote(cond_value[i]));
          }
          tmp.push(`${k} in (${vals.join(',')})`);
          continue;
        }
        
        t = typeof cond_value;

        if (t === 'number') {
          tmp.push(`${k}=${cond_value}`);
        } else if (t === 'string') {
          tmp.push(`${k}=${this.quote(cond_value)}`);
        } else if (t === 'object') {
          if (cond_value === null) {
            tmp.push(`${k} is null`);
            continue;
          }

          for (let ks in cond_value) {
            if (cond_value[ks] === null) {
              tmp.push(`${k} ${ks} null`);
              continue;
            }

            tmp.push(`${k} ${ks} ${this.quote(cond_value[ks])}`);
          }
        }
      }
      
      if (tmp.length > 0) {
        if (this.sqlUnit.where) {
          andstr = ' and ';
        }
        this.sqlUnit.where += andstr + tmp.join(' and ');
      }
      
    }
    return this;
  }

  forUpdate(k='') {
    if (!k) {
      this.sqlUnit.selectFor = ' for update';
    } else {
      this.sqlUnit.selectFor = ' for no key update';
    }
    return this;
  }

  forShare(k='') {
    if (!k) {
      this.sqlUnit.selectFor = ' for share';
    } else {
      this.sqlUnit.selectFor = ' for key share';
    }
    return this;
  }

  join(table, on, join_type = 'inner') {
    this.sqlUnit.join += ` ${join_type} join ${this.__schema__}.${table} on ${on} `;
    return this;
  }

  leftJoin(table, on) {
    return this.join(table, on, 'left');
  }

  rightJoin(table, on) {
    return this.join(table, on, 'right');
  }

  group(colname) {
    let real_field = this.__fmtfields__ ? (this.__fmtfields__[colname]||colname) : colname;

    this.sqlUnit.group = `group by ${real_field} `;
    return this;
  }

  order(str, otype='') {
    return this.orderby(str, otype)
  }

  orderby(ostr, otype='') {
    let real_field = this.__fmtfields__ ? (this.__fmtfields__[ostr]||ostr) : ostr;

    if (this.sqlUnit.order) {
      this.sqlUnit.order += `,${real_field} ${otype} `;
    } else {
      this.sqlUnit.order = `order by ${real_field} ${otype} `;
    }

    return this;
  }

  limit(count, offset = 0) {
    if (count <= 0) {
      this.sqlUnit.limit = `offset ${offset}`;
    } else {
      this.sqlUnit.limit = `limit ${count} offset ${offset}`;
    }

    return this;
  }

  returning(cols) {
    let retstr;

    if (Array.isArray(cols))
      retstr = this.fmtFields(cols).join(',');
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
        sql = `select ${this.sqlUnit.fields} from ${schemaTable}${this.sqlUnit.join}`
            + `${this.sqlUnit.where ? 'where ' : ''}${this.sqlUnit.where} `
            + `${this.sqlUnit.group}${this.sqlUnit.order}${this.sqlUnit.limit}${this.sqlUnit.selectFor};`;
        break;

      case commandTable.DELETE:
        sql = `delete from ${schemaTable} ${this.sqlUnit.where ? 'where ' : ''}${this.sqlUnit.where}${this.sqlUnit.returning};`;
        break;

      case commandTable.UPDATE:
        sql = `update ${schemaTable} set ${this.sqlUnit.values} ${this.sqlUnit.where ? ' where ' : ''} ${this.sqlUnit.where}${this.sqlUnit.returning};`;
        break;

      case commandTable.INSERT:
      case commandTable.INSERTS:
        sql = `insert into ${schemaTable} ${this.sqlUnit.fields} values ${this.sqlUnit.values}${this.sqlUnit.returning};`;
        break;
    }

    return sql;
  }

  async exec() {
    if (this.__state__ === this.state.FREE) {
      !process.env.PSQLORM_IGNORE_COPY_WARNING && console.error(modelErrorText);
      return this.copy(true).exec();
      //throw new Error(`Model实例处于释放状态，重复使用可能会导致冲突。提示：connect()用于持有此模型实例，free()用于释放模型实例。\n`);
    }

    if (!this.tableName) {
      throw new Error('你运行的是初始状态的Model，未指定table，请通过方法table(name)设定table名称再次执行。');
    }

    let sql = this.psql();
    let comm = this.sqlUnit.command;
    //let is_trigger_b = this.__trigger_before__;
    let is_trigger = this.__trigger_after__;
    let is_trigger_m = this.__trigger_commit__;
    
    if (this.__log_sql__) {
      try {
        this.__log_sql__(sql);
      } catch (err) {}
    }

    try {
      let ename;

      if (this.__fetch_sql__) return sql;
      
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
          rdata = r.rows.length > 0 ? r.rows : r.rowCount;
          break;

        case commandTable.DELETE:
        case commandTable.UPDATE:
          if (r.rows.length > 0) {
            rdata = (r.rows.length === 1 ? r.rows[0] : r.rows);
          } else {
            rdata = r.rowCount;
          }
          break;
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

  fmtFields(fields) {
    if (!this.__fmtfields__) return fields;
    let newfields = [];
    let fname;
    for (let a of fields) {
      fname = this.__fmtfields__[a];
      newfields.push(fname || a);
    }

    return newfields;
  }

  async get(fields = '*') {
    return this.select(Array.isArray(fields) ? this.fmtFields(fields) : fields, true);
  }

  async select(fields = '*', first = false) {
    this.sqlUnit.command = first ? commandTable.GET : commandTable.SELECT;
    if ( Array.isArray(fields) ) {
      this.sqlUnit.fields = this.fmtFields(fields).join(',');
    } else if (typeof fields === 'string') {
      this.sqlUnit.fields = fields;
    }

    return this.exec();
  }

  async delete() {
    this.sqlUnit.command = commandTable.DELETE;
    return this.exec();
  }

  validate(data, throw_error = true) {
    if (this.__validate__) {
      for (let k in this.__validate__) {
        if (data[k] !== undefined) {
          if (this.__validate__[k](data[k]) === false) {
            if (throw_error) {
              throw new Error(`data validate: ${k}, 数据不符合要求`)
            }

            return {ok: false, column: k}
          }
        }
      }
    }
    return true
  }

  async insert(data) {
    if (Array.isArray(data)) {
      return this.insertAll(data)
    }

    if (this.__auto_id__ 
      && this.__primary_key__ && typeof this.__primary_key__ === 'string' 
      && data[this.__primary_key__] === undefined)
    {
      if (this.__pkey_type__ === 'v') {
        data[this.__primary_key__] = this.makeId(this.__id_len__, this.__id_pre__);
      } else {
        data[this.__primary_key__] = this.bigId();
      }
    }

    //检测是否自动创建时间戳
    this.__insert_timestamp__ && makeTimestamp(data, this.__insert_timestamp__);
    this.__update_timestamp__ && makeTimestamp(data, this.__update_timestamp__);

    let fields = Object.keys(data);
    this.sqlUnit.command = commandTable.INSERT;
    this.sqlUnit.fields = `(${this.fmtFields(fields).join(',')})`;
    let vals = [];
    for (let i = 0; i < fields.length; i++) {
      vals.push(this.quote(data[ fields[i] ]));
    }

    this.validate(data)

    this.sqlUnit.values = `(${vals.join(',')})`;
    return this.exec();
  }

  async insertAll(data) {
    if (!Array.isArray(data) || data.length == 0) {
      throw new Error('data must be array and length > 0');
    }

    let genid = this.makeId;
    if (this.__pkey_type__ === 'b') genid = this.bigId;

    if (this.__auto_id__ && this.__primary_key__ && typeof this.__primary_key__ === 'string') {
      for (let i = 0; i < data.length; i++) {
        if (data[i][this.__primary_key__] === undefined) {
          data[i][this.__primary_key__] = genid(this.__id_len__, this.__id_pre__);
        }

        this.__insert_timestamp__ && makeTimestamp(data[i], this.__insert_timestamp__);
        this.__update_timestamp__ && makeTimestamp(data[i], this.__update_timestamp__);
        this.validate(data[i]);
      }
    }

    this.sqlUnit.command = commandTable.INSERTS;
    let fields = Object.keys(data[0]);

    this.sqlUnit.fields = `(${this.fmtFields(fields).join(',')})`;
    
    let vals = [];
    let vallist = [];
    let data_item;
    for (let i=0; i < data.length; i++) {
      vals = [];
      data_item = data[i];
      for (let i = 0; i < fields.length; i++) {
        vals.push(this.quote(data_item[ fields[i] ]));
      }

      vallist.push(`(${vals.join(',')})`);
    }
    
    this.sqlUnit.values = vallist.join(',');

    return this.exec();
  }

  async update(data) {
    this.sqlUnit.command = commandTable.UPDATE;
    if (typeof data === 'string') {
      this.sqlUnit.values = data;
    } else {
      let vals = [];
      this.__update_timestamp__ && makeTimestamp(data, this.__update_timestamp__);

      let fmt_k;
      let val;
      for (let k in data) {
        val = data[k];
        if (k[0] === '@') {
          k = k.substring(1);
          fmt_k = this.__fmtfields__ && this.__fmtfields__[k] ? this.__fmtfields__[k] : k;
          vals.push(`${fmt_k}=${val}`);
          continue;
        }

        fmt_k = this.__fmtfields__ && this.__fmtfields__[k] ? this.__fmtfields__[k] : k;

        vals.push(`${fmt_k}=${this.quote(val)}`);
      }

      this.sqlUnit.values = vals.join(',');
    }

    return this.exec();
  }

  async count(count_column = '*') {
    let r = await this.get(`count(${count_column}) as total`);
    if (this.__fetch_sql__) return r;
    return r === null ? 0 : parseInt(r.total);
  }

  toValue(val, type, prec = 0) {
    switch (type) {
      case 'int':
        return parseInt(val);

      case 'float':
        return parseFloat(val);

      case 'fixed':
      case 'fixed-float':
        let a = parseFloat(val);
        if (isNaN(a)) return val;
        if (type === 'fixed') return a.toFixed(prec);
        return parseFloat( a.toFixed(prec) );
    }

    return val;
  }

  async avg(field, to = '', prec = 1) {
    let r = await this.get(`avg(${this.__fmtfields__ ? (this.__fmtfields__[field]||field) : field}) as average`);
    if (this.__fetch_sql__) return r;

    if (r === null) return null;

    if (to) return this.toValue(r.average, to, prec);

    return r.average;
  }

  async max(field, to = '', prec = 1) {
    let r = await this.get(`max(${this.__fmtfields__ ? (this.__fmtfields__[field]||field) : field}) as m`);
    if (this.__fetch_sql__) return r;
    if (r === null) return null;

    if (to) return this.toValue(r.m, to, prec);
    return r.m;
  }

  async min(field, to = '', prec = 1) {
    let r = await this.get(`min(${this.__fmtfields__ ? (this.__fmtfields__[field]||field) : field}) as m`);
    if (this.__fetch_sql__) return r;
    if (r === null) return null;
    if (to) return this.toValue(r.m, to, prec);
    return r.m;
  }

  async sum(field, to = '', prec = 1) {
    let r = await this.get(`sum(${this.__fmtfields__ ? (this.__fmtfields__[field]||field) : field}) as sum_value`);
    if (this.__fetch_sql__) return r;
    if (r === null) return null;
    if (to) return this.toValue(r.sum_value, to, prec);
    return r.sum_value;
  }

  free() {
    this.parent.free(this);
  }

  /**
   * 锁定模型，不释放。
   * @returns {this}
   */
  connect() {
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
  bind(db) {
    if (db.constructor.name === 'Model' || (db.db && db.db.constructor.name === 'BoundPool') || (db instanceof Model))
    {
      this.db = db.db;
      this.commitTriggers = db.commitTriggers;
      //this.__trigger_commit__ = db.__trigger_commit__;
      this.__free_lock__ = true;
      this.__transaction__ = db.__transaction__;
    } else if (db.constructor.name === 'BoundPool' || db.constructor.name === 'Client') {
      this.db = db;
    }
    return this;
  }

  async transaction(callback) {
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

      await this.db.query('begin');
      
      let rval = await callback(this, finalRet);
      if (finalRet.ok === false) {
        throw new Error(finalRet.message);
      }

      await this.db.query('commit');

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
      this.db.query('rollback');
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

module.exports = Model
