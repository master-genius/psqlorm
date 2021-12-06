'use strict';

let saltArr = [
  'a','b','c','d','e','f','g',
  'h','i','j','k','l','m','n',
  'o','p','q','r','s','t','u',
  'v','w','x','y','z','1','2',
  '3','4','5','6','7','8','9'
];

function randstring (length = 8) {

  let saltstr = '';
  let ind = 0;

  for(let i=0; i<length; i++) {
    ind = parseInt( Math.random() * saltArr.length);
    saltstr += saltArr[ ind ];
  }

  return saltstr;
}

function nrand (f, t) {
  let discount = t - f;
  return parseInt((Math.random() * discount) + f);
}

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

    this.aliasName = null;

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

  }

  relateCache = {};

  /**
   * 关联一个模型并返回，要求m必须是已经初始化好的。
   * 名称是必须要有的，后续会通过名称查询缓存。
   * 路径可以不传，此时如果name没有查询到，会返回null。
   */

  relate (name, path = '') {
    
    if (this.relateCache[name]) {
      return this.relateCache[name];
    }

    if (!path) {
      return null;
    }

    try {
      let m = require(path);
      this.relateCache[name] = new m(this.orm);
      return this.relateCache[name];
    } catch (err) {
      console.error(err);
      return null;
    }

  }

  model (schema = null) {
    return this.orm.model(this.tableName, schema);
  }

  /**
   * 
   * @param {string} name
   *
   * */
  alias (name) {
    this.aliasName = name;
    return this;
  }

  /**
   * @param {object|string} m 通过this.relate获取的模型实例或直接指定表名的字符串。
   * @param {string} on join条件。
   * @param {string} join_type 默认INNER。
   * @param {stirng} options 默认为{}，选项，支持where、schema、pagesize、offset、order。
   *
   * */

  async join (m, on, join_type = 'INNER', options = {}) {
    
    let tname;

    if (typeof m === 'string') {
      tname = m;
    } else {
      tname = m.tableName;
      if (m.aliasName) {
        tname += ` as ${m.aliasName}`;
      }
    }
    
    let tj = this.orm.model(this.tableName, options.schema || null);

    this.aliasName && (tj = tj.alias(this.aliasName));

    tj = await tj.join(tname, on, join_type)
                    .where(options.where || {})
                    .limit(
                      options.pagesize !== undefined ? options.pagesize : this.pagesize, 
                      options.offset || 0
                    );

    options.order && (tj = tj.order(options.order));

    let r = await tj.select(options.selectField || this.selectField);

    return r.rows;
  }

  /**
   * @param {object|string} m 通过this.relate获取的模型实例或直接指定表名的字符串。
   * @param {string} on join条件。
   * @param {stirng} options 默认为{}，选项，支持where、schema、pagesize、offset、order。
   *
   * */

  innerJoin (m, on, options = {}) {
    return this.join(m, on, 'INNER', options);
  }

  leftJoin (m, on, options = {}) {
    return this.join(m, on, 'LEFT', options);
  }

  rightJoin (m, on, options = {}) {
    return this.join(m, on, 'RIGHT', options);
  }

  makeId () {
    
    let tmstr = Math.random().toString(16).substring(2);
  
    if (tmstr.length < this.idLen) {
      tmstr = `${tmstr}${randstring(this.idLen - tmstr.length)}`;
    }
  
    if (tmstr.length > this.idLen) {
      tmstr = tmstr.substring(tmstr.length - this.idLen);
    }

    if (this.idPre) {
      return `${this.idPre}${tmstr}`;
    }

    return tmstr;

  }

  /**
   * 在动态支持schema的参数设计上，一旦参数超过3个则会把后面的参数以object的形式提供，减少参数传递复杂度。
   * 否则最后一个参数是schema，默认是null。
   */

  async insert (data, schema = null) {

    if (data[this.primaryKey] === undefined && this.autoId) {
      data[this.primaryKey] = this.makeId();
    }

    let r = await this.model(schema).insert(data);

    if (r.rowCount <= 0) {
      return false;
    }

    return data[this.primaryKey];
  }

  async finsert (data, schema = null) {
    if (this.beforeInsert && typeof this.beforeInsert === 'function') {
      if (false === await this.beforeInsert(data, schema)) return false;
    }

    let id = await this.insert(data, schema);

    if (!id) return false;

    if (this.afterInsert && typeof this.afterInsert === 'function') {
      this.afterInsert(data, schema);
    }

    return id;
  }

  async insertAll (data, schema = null) {
    if (!(data instanceof Array)) {
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

    let r = await this.model(schema).insertAll(data);

    if (r.rowCount <= 0) {
      return false;
    } else if (!this.autoId) {
      return r.rowCount;
    }

    return idlist;
  }

  async update (cond, data, schema = null) {
    let r = await this.model(schema).where(cond).update(data);
    return r.rowCount;
  }

  async fupdate (cond, data, schema = null) {
    if (this.beforeUpdate && typeof this.beforeUpdate === 'function') {
      if (false === await this.beforeUpdate(cond, data, schema)) return false;
    }

    let count = await this.update(cond, data, schema);

    if (count <= 0) return 0;

    if (this.afterUpdate && typeof this.afterUpdate === 'function') {
      this.afterUpdate(cond, data, schema);
    }

    return count;
  }

  async list (cond, args = {}, schema = null) {

    let t = this.model(schema).where(cond);

    let offset = args.offset || 0;

    if (args.pagesize !== undefined) {
      t = t.limit(args.pagesize, offset);
    } else {
      t = t.limit(this.pagesize, offset);
    }
    
    if (args.order) {
      t = t.order(args.order);
    }
    
    let r = await t.select(args.selectField || this.selectField);

    return r.rows;

  }

  async get (cond, fields = null, schema = null) {
    let r = await this.model(schema)
                      .where(cond)
                      .select(fields || this.selectField);

    if (r.rowCount <= 0) {
      return null;
    }
    return r.rows[0];
  }

  async delete (cond, schema = null) {
    let r = await this.model(schema).where(cond).delete();
    return r.rowCount;
  }

  async fdelete (cond, schema = null) {
    if (this.beforeDelete && typeof this.beforeDelete === 'function') {
      if (false === await this.beforeDelete(cond, schema)) return false;
    }

    let count = await this.delete(cond, schema);

    if (count <= 0) return 0;

    if (this.afterDelete && typeof this.afterDelete === 'function') {
      this.afterDelete(cond, schema);
    }

    return count;
  }

  async count (cond = {}, schema = null) {
    let total = await this.model(schema).where(cond).count();
    return total;
  }

  async max (cond = {}, fields, schema = null) {
    return await this.model(schema).where(cond).max(fields);
  }

  async min (cond = {}, fields, schema = null) {
    return await this.model(schema).where(cond).min(fields);
  }

  async avg (cond = {}, fields, schema = null) {
    return await this.model(schema).where(cond).avg(fields);
  }

  async sum (cond = {}, fields, schema = null) {
    return await this.model(schema).where(cond).sum(fields);
  }

  /**
   * 
   * @param {string} gby 
   * @param {object} options
   * 
   */
  async group (gby, options = {}) {

    let r = await this.model(options.schema || null).where(options.where || {})
                              .group(gby)
                              .select(options.selectField || this.selectField);
    
    if (r.rowCount > 0) {
      return r.rows;
    }

    return [];
  }

  async transaction (callback, schema = '') {

    if (typeof callback !== 'function' || callback.constructor.name !== 'AsyncFunction') {
      throw new Error(`callback must be async function`);
    }

    return await this.orm.transaction(async (db) => {
      let ret = {
        failed: false,
        errmsg : ''
      };

      //只有db才是事物安全的，可以保证原子操作。
      try {
        await callback(db, ret);
      } catch (err) {
        ret.failed = true;
        ret.errmsg = err.message;
      }

      return ret;
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
   *    //唯一索引
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
  
  async CreateSchema (schema) {
    return await this.db.query(`create schema if not exists ${schema}`);
  }

  async Sync (debug=false) {

    if (!this.table) {
      console.error('没有table对象');
      return false;
    }

    console.log(`start to sync table ${this.tableName}`)

    if (this.table.column === undefined || typeof this.table.column !== 'object') {
      console.error('column属性必须为object类型');
      return false;
    }

    if (Object.keys(this.table.column).length <= 0) {
      console.error('column没有定义字段');
      return false;
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

    await this._syncColumn(inf, curTableName, debug);

    await this._syncIndex(curTableName, debug);

    await this._syncUnique(curTableName, debug);

    await this._removeIndex(curTableName, debug);

    if (debug) {
      console.log(' - END - ');
    }

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
  async _syncColumn (inf, curTableName, debug = false) {
    
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

      if (col.typeLock) {
        continue;
      }
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

              continue;

            } else {
              console.error(` -- ${k} ${col.type} 从字符串类型转向其他类型无转换规则，或者设置force选项强制操作。`);
            }

          }
        }

        if (debug) {
          console.log(sql);
        }

        try {
          await this.db.query(sql);
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
      indtext = indname.replace(',', '_');
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

    if (!this.table.index || !(this.table.index instanceof Array) ) {
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
        && (this.table.removeIndex instanceof Array)
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
      if (this.table.column[indname] && this.table.column[indname].type.toLowerCase() === 'jsonb') {
        ind_using = ' using gin';
      }
      
      await this.db.query(`create index on ${curTableName} ${ind_using}(${indname})`);

    }

  }

  async _syncUnique (curTableName, debug = false) {

    if (this.table.unique === undefined) {
      return;
    }

    if (!this.table.unique || !(this.table.unique instanceof Array) ) {
      console.error('unique 属性必须为数组类型，其中值为字符串');
      return;
    }

    if (debug) {
      console.log('-- checking unique index...');
    }

    if (!this.table.unique || !(this.table.unique instanceof Array) ) {
      return;
    }

    let indname = '';
    let indchk = null;

    for (let i = 0; i < this.table.unique.length; i++) {

      indname = this.table.unique[i];

      if (this.table.removeIndex !== undefined
        && (this.table.removeIndex instanceof Array)
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
    if (!this.table.removeIndex || !(this.table.removeIndex instanceof Array)) {
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


}

module.exports = pqmodel;
