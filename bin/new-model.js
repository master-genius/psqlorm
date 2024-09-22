#!/usr/bin/env node

'use strict'

const fs = require('fs')

function fmt_table_name(name) {
  let arr = name.split('')
  let narr = []

  arr.forEach((x, index) => {
    if (/[A-Z]/.test(x) && index > 1 && /[a-z]/.test(arr[index-1])) {
       narr.push('_')
    }

    narr.push(x.toLowerCase())
  })

  return narr.join('')
}

function makeTable(name, separate=false) {
  let exp = separate ? 'module.exports =' : 'let table =';
  let ust = separate ? `'use strict'\n` : '';

return `${ust}
/**
 * @typedef {object} column
 * @property {string} type - 类型
 * @property {string} refActionDelete - 外键删除后的行为，可以设置为cascade，具体参考数据库文档。
 * @property {string} refActionUpdate - 外键更新后的行为，可以设置为cascade，具体参考数据库文档。
 * @property {string} ref - 外键引用，格式 ModelName:COLUMN，示例：'users:id'
 * @property {string} indexType - 索引类型，需要指定索引具体类型时使用此属性。
 * @property {string|number} default - 默认值。
 * @property {boolean} notNull - 不允许为null，默认为true。
 * @property {string} oldName - 原column名称，如果要重命名字段，需要oldName指定原有名字。
 * @property {boolean} typeLock - 是否锁定类型，如果为true则会锁定类型，不会更新。
 * @property {function|RegExp|array} validate - 数据验证，如果是函数类型，返回false表示验证失败。
 *
 * 如果指定ref，type会保持和外键引用的字段一致。
 */

/**
 * @typeof {object} dataTypes
 * @property {string} INT - 'int'
 * @property {string} BIGINT - 'bigint'
 * @property {string} SMALLINT - 'smallint'
 * @property {string} TEXT - 'text'
 * @property {string} JSONB - 'jsonb'
 * @property {string} TIME - 'time'
 * @property {string} DATE - 'date'
 * @property {string} TIMESTAMP - 'timestamp'
 * @property {string} TIMESTAMPZ - 'timestamp with zone'
 * @property {string} BOOLEAN - 'boolean'
 * @property {string} BYTE - 'bytea'
 * @property {string} BID - 'bigint'
 * @property {string} BIGSERIAL - 'bigserial'
 * @property {string} ID - 'varchar(16)'
 * @property {string} UID - 'varchar(18)'
 * @property {string} OPENID - 'varchar(32)'
 * @property {function} CHAR - CHAR(50) 返回 'char(50)'
 * @property {function} STRING - STRING(50) 返回 'varchar(50)'
 * @property {function} NUMBER - NUMBER(9,3) 返回 'numeric(9,3)'
 * @property {function} NUMERIC - NUMERIC(9,3) 返回 'numeric(9,3)'
 * @property {function} ARRAY - ARRAY('int') 返回 'int[]'
 *
 * dataTypes对常用的类型提供了一个中间层：
 *  它的主要目的是提供统一格式并尽可能防止出错：尽可能避免大小写不一致、前后有空格等问题。
 */
${separate ? 'const dataTypes = require(\'psqlorm\').dataTypes\n' : ''}
${exp} {
  column: {
    /**
     * @type {column}
     * id默认是主键，不需要再加入到unique索引。
     * */
    id: {
      type: dataTypes.ID
    },

    /**
     * @type {column}
     * */
    name: {
      type: dataTypes.STRING(30),
      default: ''
    },

    detail: {
      type: dataTypes.STRING(200),
      default: ''
    },

    /**
     * @type {column}
     * */
    create_time: {
      type: dataTypes.BIGINT,
      default: 0,
      //执行insert时自动生成时间戳
      timestamp: 'insert'
    },
    
    /**
     * @type {column}
     * */
    update_time: {
      type: dataTypes.BIGINT,
      default: 0,
      //执行update时自动生成时间戳
      timestamp: 'update'
    },
  },

  //主键，字符串类型会按照增长序列算法自动生成。
  primaryKey: 'id',

  //索引
  index: [
    'create_time',
    'update_time'
  ],

  //唯一索引，注意：主键本身就是唯一索引，不必在此重复。
  //联合唯一索引使用 , 分隔，示例：'name,orgid'
  unique: [

  ]
}
`
}

let example_code = `
  //示例：定义update、delete、insert的触发器，触发器在执行sql之后才会执行。
  /*
  triggerInsert (tg) {
    console.log(tg);
  }

  triggerDelete (tg) {
    console.log(tg);
  }

  triggerUpdate (tg) {
    console.log(tg);
  }
  */

  //执行触发器需要显式调用trigger或在事务中调用triggerCommit。
  //只有调用trigger的sql执行才会执行触发器函数。
  //在事务中，trigger()会根据状态标记自动识别是执行完sql触发还是事务提交以后再触发。。

  //示例函数，请根据实际需求修改代码。
  async create(data) {
    return this.returning(['id', 'name']).insert(data)
  }

  /**
   * ------ 事务处理示例函数
   * ------ 示例代码仅作基本使用的参考...
   */
  async example_transaction(data) {
    //只有使用参数传递的db执行sql才是事务操作。
    /**
     * @param {Model} db db是PostgreModel实例。
     * @param {Object} handle handle用于设置事务执行状态或返回数据。
     */
    let ret = await this.transaction(async (db, handle) => {

        let r = await db.where('name = ?', ['']).select()
        
        if (r.length === 0) {
          //事务执行失败，抛出错误。
          handle.throwFailed('没有查询到name为空的数据。')
        }
        
        /*
          如果不使用bind绑定，则执行sql就不是事务操作。
          你可以只用db，并指定model：
              db.model('users').where({role: 'test'}).update(data)
        */
        /*
        let users = this.getModel('users').bind(db)
        await users.where({role: 'test'}).update(data)
        */
        
        //此返回值将作为事务的返回结果，其等效形式为：handle.result = 'ok'
        return 'ok'
    })

    //如果执行成功，输出为：true ok
    console.log(ret.ok, ret.result)

    return ret
  }
`

function makeModel (name, orgname, separate=false, exampleCode='') {

  let imp_table = `const table = require('./tables/${orgname}.js')\n`

  let tableCode = separate ? imp_table : makeTable(name, separate)

let mstr = `'use strict'

const {PostgreModel, dataTypes} = require('psqlorm')
${tableCode}
class ${name} extends PostgreModel {

  constructor (pqorm) {
    //必须存在并且写在最前面。
    super(pqorm)

    //主键id前缀，建议不要超过2字符，请确保前缀和idLen的长度 <= 数据库字段的最大长度。
    this.idPre = ''

    //id的长度，默认为16，为保证有序增长，建议id长度不要低于16。
    //this.idLen = 16

    //数据表真正的名称，注意：postgresql不支持表名大写，更改名称请使用小写字母。
    this.tableName = '${fmt_table_name(name)}'

    this.table = table

    this.columns = Object.keys(this.table.column)
  }

  //一些在构造函数执行后才可以初始化的操作，写在init函数中。
  async init() {

  }

  ${exampleCode}
}

module.exports = ${name}
`
  return mstr

}

let name_preg = /^[a-z][a-z0-9_]{1,60}$/i

function checkName (name) {
  return name_preg.test(name)
}


let mdir = 'model'
let mlist = []

let separate = false
let make_example_code = false

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].indexOf('--mdir=') === 0) {

    let t = process.argv[i].substring( '--mdir='.length )

    if (t.length > 0) {
      mdir = t
    }

    continue
  }

  if (['-s', '--separate'].indexOf(process.argv[i]) >= 0) {
    separate = true
    continue
  }

  if (['-e', '--example'].indexOf(process.argv[i]) >= 0) {
    make_example_code = true
    continue
  }

  mlist.push(process.argv[i])
}


try {
  fs.accessSync(mdir) 
} catch (err) {
  fs.mkdirSync(mdir)
}

let cpath
let table_dir
for (let c of mlist) {
  if (c.indexOf('/') >= 0) {
    let arr = c.split('/').filter(p => p.length > 0)
    c = arr[arr.length - 1]
  }
  
  if (!checkName(c)) {
    console.error(`${c} 不符合命名要求。(the name is illegal.)\n`
      + `要求至少2个字符，最多60字符，字母开头，支持：字母 数字 和 _`)

    continue
  }

  cpath = `${mdir}/${c}.js`
  table_dir = `${mdir}/tables`

  try {
    fs.accessSync(cpath)
    console.error(`${c}.js已经存在(${c}.js already exist).`)
    continue
  } catch (err) {}

  if (separate) {
    try {
      fs.accessSync(table_dir)
    } catch (err) {
      fs.mkdirSync(table_dir)
    }
  }

  try {
    fs.writeFileSync(cpath, makeModel(`${c[0].toUpperCase()}${c.substring(1)}`, c, separate, make_example_code ? example_code : ''), {encoding: 'utf8'})
    separate && fs.writeFileSync(table_dir+`/${c}.js`, makeTable(fmt_table_name(c), separate), {encoding: 'utf8'})
  } catch (err) {
    console.error(err)
  }

}
