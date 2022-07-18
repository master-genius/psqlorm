## psqlorm ：基于pg扩展的简单ORM

在Node.js环境，已经有非常成熟并且完善的ORM库，当然其复杂性和学习使用成本也非常高，轻量级之所以受到青睐的原因就是轻量级库学习和使用成本低，而且能解决大部分需求，项目对其依赖程度也相对较低，而且一个庞大的库，当复杂性升高时，其bug也会增多。

Node.js环境有一个使用非常广泛的PostgreSQL数据库扩展：pg。pg是对PostgreSQL客户端协议做了基础的封装，提供了基础的但是非常容易使用的功能。在长期开发时，具备简单的ORM功能的库则是非常必要的。

所以，这个扩展诞生了，它很简单，仅仅是生成PostgreSQL方式的SQL语句，最后使用pg去执行。

**从5.0版本开始，它会自动安装pg扩展，之前的版本是为了简单化，没有在package.json中加入依赖声明，所以4.x版本需要自己安装pg。5.0做了很多优化调整，pqmodel中join以及transaction的参数和功能都进行了调整和升级。基本的model使用没有变化。**

如果你希望使用它，或者希望学习到什么，可以看源代码，如果你希望联系我，我的QQ是1146040444，我们把它用在了一些业务系统上，在目前它在保持简洁的同时也很好的支撑了快速的开发工作。

## 安装

```

npm i psqlorm

```

## 初始化和简单查询

这是比较原始的方式，但是这种方式是一直被支持的，更方便的方式就是对这些操作的封装。psqlorm需要一个已经初始化好的pg连接对象，在内部去通过pg执行sql。

``` JavaScript

const psqlorm = require('psqlorm');
const pg = require('pg');

const pgdb = new pg.Pool({
    database : 'DATABASE',
    user     : 'USERNAME',
    password : 'PASSWORD',
    host     : 'localhost',
    //连接池最大数量
    max      : 10
});

//pqorm.db 就可以访问pgdb。
const pqorm = new psqlorm(pgdb);


;(async () => {
    pqorm.model('user')
        .where({
            is_delete: 0
        })
        .select();
});


```

更进一步，下面的代码展示了如何封装一个函数。

## 封装初始化函数

```javascript

/**
 * dbconfig : {
 *   database : '',
 *   password : '',
 *   user     : '',
 *   host     : '',
 *   \/\/ 连接池最大数量
 *   max      : 12
 * }
 */
function initpgorm (dbconfig) {

  let pdb = new pg.Pool(dbconfig)

  return new psqlorm(pdb)
}

```

这样的方式需要开发者去编写一个函数然后导出一个模块，为了能更方便，以下方式最好。


## 使用 initORM 初始化

```javascript

const initORM = require('psqlorm').initORM

let dbconfig = {
  host: '127.0.0.1',
  user: 'xxxxx',
  database : 'DBNAME',
  port: 5432,
  password: 'PASSWORD',
  max: 10
}

let pqorm = initORM(dbconfig)

//...

```

以上工作，通过initORM直接完成。


## 复杂查询

``` JavaScript

let pqorm = initORM(dbconfig);

;(async () => {

  let cond = {
    is_delete: 0,
    nickname : {
      'ILIKE' : '%ae%'
    }
  };

  let result = await pqorm.model('user')
    .where(cond)
    .where('level > ? AND point > ?', [2,100])
    .select();

  console.log(result);

});

```

## 返回值

对于 insert、insertAll、update、delete操作，其返回值就是pg扩展的返回值，通常要使用rowCount属性来确定所影响的行数，使用rows来获取查询结果。具体可以参考pg扩展的文档

<a href="https://node-postgres.com/" target=_blank>pg doc</a>

如果你不想再去查看文档，这里给出最简单直接的示例：

``` JavaScript

async function getUserById (id) {
  let r = await pqorm.model('user').where('id=?', [id]).select()
  //返回的数据结果数为0,这里使用<=来作为没有查询到。
  if (r.rowCount <= 0) {
    return null
  }
  return r.rows[0]
}

/**
  @param {string} id
  @param {object} data
*/
async function updateUserInfo (id, data) {
  let r = await pqorm.model('user').where({id : id}).update(data)
  if (r.rowCount <= 0) {
    return false
  }
  return true
}

```

## 插入数据

``` JavaScript

let pqorm = initORM(dbconfig);

;(async () => {

  let tm = Date.now();

  await pqorm.model('log').insert({
      id : `log_${tm}`,
      log_time : tm,
      status : 'ok'
  });

  let users = [
      {
          id : 123,
          username : 'abc'
      },
      {
          id : 234,
          username : 'xyz'
      }
  ];

  await pqorm.model('users').insertAll(users);

});

```

## 更新和删除

``` JavaScript

let pqorm = initORM(dbconfig);

;(async () => {

  //更新
  await pqorm.model('users').where('user_id = ?', ['123']).update({
      username : 'qaz'
  });

  //删除
  await pqorm.model('users').where({user_id : '234'}).delete();

});

```

## RETURNING 在更改数据后返回列

这是一个数据的功能，sql语句支持returning功能可以在更改后返回指定的列，不需要再做一次查询。

model层面提供了returning接口设置要返回的列。

``` JavaScript

let pqorm = initORM(dbconfig);

;(async () => {

  //更新
  await pqorm.model('users')
        .where('user_id = ?', ['123'])
        .returning('id,username,role')
        .update({
          username : 'qaz'
        });

});

```

更改操作只针对insert、update、delete有效。

## 统计

使用count函数进行数据统计。

``` JavaScript

let pqorm = initORM(dbconfig);

;(async () => {

  //生成SQL ：SELECT COUNT(*) as total FROM users WHERE age > 12 AND age < 18;

  let total = await pqorm.model('users').where({
    age : {
      '>' : 12,
      '<' : 18
    }
  }).count()

  //total 是数字，如果没有就是0。

  console.log(total)

});

```

**返回值在4.0.7以后会自动转换成整数，在这之前是字符串。统计结果是可以确定类型一定为整数，所以可以做自动转换。**

## 求和、均值、最大值、最小值

提供了 sum、avg、max、min用于计算求和、均值、最大值、最小值。这几个函数，在查找到数据后返回值为数字，avg返回值为浮点类型，其他函数返回数字要看数据库字段是什么类型。

**如果没有找到数据，则无法进行计算，此时会返回null。**

``` JavaScript

let pqorm = initORM(dbconfig);

;(async () => {

  let cond = {
    sex : [1,2],
    role : 'user'
  }

  //生成SQL：SELECT max(high) as max FROM users WHERE sex IN (1,2) AND role = 'user'

  let max = await pqorm.model('users').where(cond).max('high')

  let min = await pqorm.model('users').where(cond).min('high')

  let avg = await pqorm.model('users').where(cond).avg('high')

  console.log(max, min, avg)

  //计算分数总和
  let sum = await pqorm.model('users').where(cond).sum('score')

  console.log(sum)

});

```

**返回值是字符串，不是数字，你需要自己决定是转换成浮点数还是整数。**

## join、leftJoin、rightJoin

join默认是INNER JOIN。三个函数的参数都是以下形式：

```
join (table, on) {
  //...
}
```

table是表名字，on是条件。

``` JavaScript

let pqorm = initORM(dbconfig);

;(async () => {

  let cond = {
    role : 'test',
  }

  let ulist = await pqorm.model('users as u')
                        .leftJoin('user_data as ud', 'u.id = ud.user_id')
                        .where(cond)
                        .select('u.id,username,u.detail,ud.page')

  console.log(ulist)

});

```

## order和limit

order用于排序，limit限制查询条数并可以设定偏移量。limit第一个参数是要返回的数据条数，第二个参数是偏移量，默认为0。

``` JavaScript

let pqorm = initORM(dbconfig);

;(async () => {

  let cond = {
    role : 'test',
  }

  let ulist = await pqorm.model('users')
                          .where(cond)
                          .order('age DESC,high ASC')
                          .limit(10, 5); //从第5条开始返回10条。

  console.log(ulist.rows)

});

```

## group

使用group用于对结果集合进行合并，比如，要计算总金额并根据每个用户的ID进行统计：

```javascript

let pqorm = initORM(dbconfig);

;(async () => {

  let cond = {
    order_status : 1,
  }
  
  //group指定的字段在select中必须出现。
  
  let r = await pqorm.model('order')
                          .where(cond)
                          .group('user_id')
                          .select('user_id,SUM(order_amount) as total_amount')

  console.log(r.rows)

});

```


## 事务

事务有两种调用方式，一个是直接调用pqorm.transaction，另一个是从pqorm.model().transaction。实际上，第一种是对第二种的封装，不过支持第二个参数设置schema，默认为public。

``` JavaScript

let pqorm = initORM(dbconfig);

;(async () => {

  let r = await pqorm.transaction(async (db) => {
    //一定要使用db，否则就不是原子操作。
    //即使没有执行SQL的错误，但是某一过程的逻辑出错可以利用返回值表示执行失败
    //设计方案是返回值是一个对象，其中failed字段如果为true则表示执行失败，可以设置errmsg描述错误信息。
    //或者，如果返回false，则也认为是执行失败了。
    let ret = {
      failed: false,
      errmsg : ''
    };

    let a = await db.model('user').where('user_id = ?', [user_id]).select();
    if (a.rowCount <= 0) {
      ret.failed = true;
      ret.errmsg = '没有此用户';
      return ret;
    }
    //...
  });

  //返回值r是一个对象，三个属性ok、result、errmsg

});


```

### 事务运行的返回值

transaction不会抛出异常，相反，它会捕获异常然后设定相关数据并返回。

返回值是一个对象，三个属性ok、result、errmsg :

``` JavaScript
{
    //result是callback返回值的信息
    //result还可以包括其他属性，这是开发者自行处理的。
    result : {
        failed: false,
        errmsg : ''
    },

    //ok表示事务执行是否成功。
    ok : true,

    //errmsg是执行sql失败后抛出错误的信息描述。
    errmsg : ''
}
```

----

以下是更高一层ORM实现，但是对Postgres的类型支持有限，仅支持常用的类型：

> 数字（int、bigint、smallint、numeric）、字符串（text、char、varchar）、bytea、时间戳、jsonb。

对于不支持的类型，仍然可以创建并使用，只是在自动更新表结构时，对类型的处理会忽略。

这部分功能是稳定的，只是支持不够健全，psotgresql支持的类型和功能太多了···

----

## pqmodel(psqlorm.Model)

对于所有的以上提到的接口，都有同名的实现，只是参数不同：

| 接口 | 参数 | 说明 |
| --- | ---- | ---- |
| model (schema = null) | 可以指定schema | 返回模型实例 |
| alias (name) | 字符串 | 表别名 |
| get (cond, options={schema: null}) | object | 条件 |
| insert (data, options={schema: null}) | object | 要插入的数据，options支持returning属性设定要返回的列，update和delete操作也支持。 |
| insertAll (data, options={schema: null}) | Array[object] | 插入的数据数组 |
| update (cond, data, options={schema: null}) |  | 更新 |
| delete (cond, options={schema: null}) |  | 删除 |
| transaction (callback, schema = null) |  | 事务，和model有所区别，是对model层transaction的封装。callback接受第一个参数是db，第二个参数是一个object，用于设置事务执行状态和设定返回的数据。 |
| innerJoin(m, on, options = {}) | m可以是字符串表示表名也可以是另一个模型实例 | options支持where、schema、pagesize(相当于limit) 、offset、selectField、order属性。|
| leftJoin(m, on, options = {}) | on是join条件 | options参考innerJoin。 |
| rightJoin(m, on, options = {}) | schema可以设置数据库schema | options参考innerJoin。 |
| makeId () |  | 生成唯一ID。 |
| list (cond, args, schema = null) | args是object，支持属性：pagesize，order，offset，selectField。皆有默认值 | 查询列表，默认使用this.selectField作为选取的列，可以使用属性selectField指定。 |
| count (cond, options={schema: null}) |  | 统计 |
| avg (cond, options={schema: null}) |  | 均值，options支持to选项表示要转换的值，可选int、float、fixed、fixed-float。支持precision选项用于设置浮点数的精度。 |
| max (cond, options={schema: null}) |  | 最大值，options支持to和precision |
| min (cond, options={schema: null}) |  | 最小值，options支持to和precision |
| sum (cond, options={schema: null}) |  | 求和，options支持to和precision |
| group(group_field, options={}) | options支持schema、where、selectField、order属性。 | 通过where属性来传递条件，schema可以用来指定数据库分组。 |
| dataOut(options={}) | 导出数据，返回值是生成器函数。 | 运行返回的生成器函数，并不断调用next完成所有数据的导出。 |
| dataIn(options) | 通过选项data传递导入的数据，支持mode、update选项。 | mode默认为'strict'，也可以选择'loose'模式，表示宽松模式，此时遇到错误数据会略过。update表示更新类型，默认为'delete-insert'会先删除再插入，也可以是'update'表示更新已有数据，也可以是'none'表示不更新已存在数据。 |
| dataOuthandle(callback, options={}) | 对dataOut的包装函数，options参考dataOut，callback表示对生成器每次返回的数据调用callback处理。 | callback接受的参数就是每次生成器返回的数据。 |
| Sync (debug = false) | 是否调试，会输出相关信息 | 同步表 |
| CreateSchema (schema) | 字符串 | 创建schema |


## 事务

```javascript

//测试代码
;async (() => {

  let r = await db.university.transaction(async (tb, ret) => {

    let a = await tb.model(db.userResult.tableName)
                    .returning('id,name,sex,subject')
                    .insert({
                      id: db.university.makeId(),
                      name: '王金刚',
                      sex: 1,
                      year: 2023
                    })

    //以抛出错误的形式终止事务
    ret.throwFailed('事务终止')

    a = await tb.model(db.university.tableName)
                .returning('id,old_name,uname')
                .update({old_name: `old ${Date.now()}`})

    //不会抛出错误。但最终事务会终止。
    ret.failed('不想执行了！')

    //如果设置了data属性，则最后r得到的数据就是ooo而不是success
    //ret.data = 'ooo'

    //如果不设置ret.data属性，则return值作为r的结果
    return 'success'
  })

  // r.ok表示事务是否成功，error和errmsg分别对应错误对象和错误文本。
  // r.result属性是事务完成后最终的返回结果。
  console.log(r)


})();

```

表属性：

**table**

object类型，描述表的字段，示例：

```
this.table = {
  column : {
    id : {
      type : 'varchar(16)'
    },

    username : {
      type : 'varchar(40)'
    },

    passwd : {
      type : 'varchar(200)',
    },

    role : {
      type : 'varchar(12)'
      default : 'user'
    },

    mobile : {
      type : 'varchar(14)',
      default : ''
    },

    mobile_verify : {
      type : 'boolean',
      default : 'f'
    }

    age : {
      type : 'smallint',
      default : 0
    }
  },

  //要创建索引的字段
  index : [
    'role',
    'mobile'
  ],

  //唯一索引
  unique : [
    'username'
  ]

}
```

你需要声明一个类继承自psqlorm.Model，类中的属性描述如下：

**primaryKey**

主键ID的字段名称，默认为id。

**idPre**

指定id的前缀，默认为空字符串。

**idLen**

指定id的长度，默认为12个字符串，makeId生成会依据此设置。

当更改表结构，需要调用Sync来自动同步数据库。

**tableName**

必须指定的字段，表示数据库表的名字。

### 完整的使用示例

以下代码完成后，基本的增删改查，统计、求值、事务等处理直接可用。

``` JavaScript

'use strict';

const pqmodel = require('psqlorm').Model;

class data_great extends pqmodel {

  constructor(pqorm) {
    
    //必须写
    super(pqorm);

    //主键id前缀，建议不要超过2字符，或者要把主键id字符长度上限设置为24+
    this.idPre = '';
    
    //默认主键名为id，并且是字符串类型，默认禁止使用自增序列，如果确实需要使用，请调整你的想法或需求
    //this.primaryKey = 'id';

    //需要替换成数据表真正的名称

    this.tableName = 'data_great';

    this.table = {
      column : {
        id : {
          type : 'varchar(16)',
        },

        data_id : {
          type : 'varchar(16)',
        },

        user_id : {
          type : 'varchar(16)',
        },

        add_time : {
          type : 'bigint'
        },
      },

      index  : [
        'data_id',
        'user_id'
      ],
      unique : [
        'data_id,user_id'
      ]
    };

  }

}

module.exports = data_great;

```

仅仅是以上一个文件，就可以使用get、select、delete、insert、insertAll等接口。
