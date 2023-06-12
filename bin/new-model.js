#!/usr/bin/env node

'use strict'

const fs = require('fs')

function makeTable(name, separate=false) {
  let exp = separate ? 'module.exports =' : 'let table =';
  let ust = separate ? `'use strict'\n` : '\n';

return `${ust}
/**
 * @typedef {object} column
 * @property {string} type - 类型
 * @property {string} refActionDelete - 外键删除后的行为，可以设置为cascade，具体参考数据库文档。
 * @property {string} refActionUpdate - 外键更新后的行为，可以设置为cascade，具体参考数据库文档。
 * @property {string} ref - 外键引用，格式 ModelName:COLUMN，示例：'users:id'
 * @property {string|number} default - 默认值。
 * @property {boolean} notNull - 不允许为null，默认为true。
 * @property {string} oldName - 原column名称，如果要重命名字段，需要oldName指定原有名字。
 * @property {boolean} typeLock - 是否锁定类型，如果为true则会锁定类型，不会更新。
 *
 * 如果指定ref，type会保持和外键引用的字段一致。
 */

//在column中编辑列属性。

${exp} {
  column: {
    /**
     * @type {column}
     * */
    id: {
      type : 'varchar(18)'
    },

    /**
     * @type {column}
     * */
    name: {
      type : 'varchar(30)',
      default: ''
    },

    /**
     * @type {column}
     * */
    create_time: {
      type : 'bigint',
      default: 0
    },
    
    /**
     * @type {column}
     * */
    update_time: {
      type : 'bigint',
      default: 0
    },
  },

  //索引
  index: [
    'create_time',
    'update_time'
  ],

  //唯一索引
  unique: [
    'name'
  ]
}
`
}

function makeModel (name, orgname, separate=false) {

  let imp_table = `const table = require('./tables/${orgname}.js')\n`

  let tableCode = separate ? imp_table : makeTable(name, separate)

let mstr = `'use strict'

const PostgreModel = require('psqlorm').Model
${tableCode}
class ${name} extends PostgreModel {

  constructor (pqorm) {
    //必须存在并且写在最前面。
    super(pqorm)

    //主要用于引用外键时，用于获取当前模块的路径，也可以在外键引用ref属性上指定路径。
    this.modelPath = __dirname

    //主键id前缀，建议不要超过2字符，请确保前缀和idLen的长度 <= 数据库字段的最大长度。
    this.idPre = ''

    //id的长度，默认为13，建议id长度不要低于13。
    //this.idLen = 13

    //默认主键名为id，并且是字符串类型，主键id会自动生成。
    //this.primaryKey = 'id'

    //数据表真正的名称，注意：postgresql不支持表名大写，更改名称请使用小写字母。
    this.tableName = '${name.toLowerCase()}'

    this.table = table

    this.columns = Object.keys(this.table.column)

  }

  //示例：定义update、delete、insert的触发器。
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
  async create (data) {
    return this.returning(['id', 'name']).insert(data);
  }

  /**
   * 事务处理示例函数。
   * 示例代码仅作基本使用的参考...
   */
  async example_transaction (data) {
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
        示例：获取users模型并绑定到db。如果不使用bind绑定，则执行sql就不是事务操作。
        在当前目录中存在一个users.js，定义class Users，relate('Users')函数用于获取一个模型实例。
        你可以只用db，并指定table：db.table('users').where({role: 'test'}).update(data)
        */
        /*
        let users = this.relate('Users').bind(db)
        await users.where({role: 'test'}).update(data)
        */
        
        //此返回值将作为事务的返回结果，其等效形式为：handle.result = 'ok'
        return 'ok'
    })

    //如果执行成功，输出为：true ok
    console.log(ret.ok, ret.result)

    return ret
  }
  
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

  if (!checkName(c)) {
    console.error(`${c} 不符合命名要求。(the name is illegal.)\n`
      + `要求至少2个字符，最多60字符，字母开头，支持：字母 数字 和 _`)

    continue
  }

  cpath = `${mdir}/${c}.js`
  table_dir = `${mdir}/tables`

  try {
    fs.accessSync(cpath)
    console.error(`${c}.js already at here.`)
    continue
  } catch (err) {}

  try {
    fs.accessSync(table_dir)
  } catch (err) {
    fs.mkdirSync(table_dir)
  }

  try {
    fs.writeFileSync(cpath, makeModel(`${c[0].toUpperCase()}${c.substring(1)}`, c, separate), {encoding: 'utf8'})
    separate && fs.writeFileSync(table_dir+`/${c}.js`, makeTable(c.toLowerCase(), separate), {encoding: 'utf8'})
  } catch (err) {
    console.error(err)
  }

}
