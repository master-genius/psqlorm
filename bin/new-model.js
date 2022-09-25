#!/usr/bin/env node

'use strict'

const fs = require('fs')

function makeModel (name) {

let mstr = `'use strict'

const pqmodel = require('psqlorm').Model

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

//在column中编辑列字段。

let _table = {
  /**
   * @type {column}
   * */
  column: {
    id : {
      type : 'varchar(12)'
    },

    create_time: {
      type : 'bigint',
      default: 0
    }
  },

  //索引
  index: [
    'create_time'
  ],

  //唯一索引
  unique: [

  ]
}

class ${name} extends pqmodel {

  constructor (pqorm) {
    super(pqorm)

    this.modelPath = __dirname

    //以上代码必须存在并且写在前面。

    //主键id前缀，建议不要超过2字符，请确保前缀和idLen的长度 <= 数据库字段的最大长度。
    this.idPre = ''

    //id的长度，默认为12
    //this.idLen = 12

    //默认主键名为id，并且是字符串类型，主键id会自动生成。
    //this.primaryKey = 'id'

    //数据表真正的名称，注意：postgresql不支持表名大写，更改名称请使用小写字母。
    this.tableName = '${name.toLowerCase()}'

    this.table = _table

  }

}

module.exports = ${name}
`
  return mstr

}

let name_preg = /^[a-z_][a-z0-9_]{0,50}$/i

function checkName (name) {
  return name_preg.test(name)
}

let mdir = 'model'

let mlist = []

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].indexOf('--mdir=') === 0) {

    let t = process.argv[i].substring( '--mdir='.length )

    if (t.length > 0) {
      mdir = t
    }

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

for (let c of mlist) {

  if (!checkName(c)) {
    console.error(`${c} 不符合命名要求。(the name is illegal.)`)
    continue
  }

  cpath = `${mdir}/${c}.js`

  try {
    fs.accessSync(cpath)
    console.error(`${c}.js already at here.`)
    continue
  } catch (err) {}

  try {
    fs.writeFileSync(cpath, makeModel(c), {encoding: 'utf8'})
  } catch (err) {
    console.error(err)
  }

}
