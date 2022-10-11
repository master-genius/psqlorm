## psqlorm ：基于pg扩展的简单ORM

在Node.js环境，已经有非常成熟并且完善的ORM库，当然其复杂性和学习使用成本也非常高，轻量级之所以受到青睐的原因就是轻量级库学习和使用成本低，而且能解决大部分需求，项目对其依赖程度也相对较低，而且一个庞大的库，当复杂性升高时，其bug也会增多。

Node.js环境有一个使用非常广泛的PostgreSQL数据库扩展：pg。pg是对PostgreSQL客户端协议做了基础的封装，提供了基础的但是非常容易使用的功能。在长期开发时，具备简单的ORM功能的库则是非常必要的。

所以，这个扩展诞生了，它很简单，仅仅是生成PostgreSQL方式的SQL语句，最后使用pg去执行。

**从5.0版本开始，它会自动安装pg扩展，之前的版本是为了简单化，没有在package.json中加入依赖声明，所以4.x版本需要自己安装pg。5.0做了很多优化调整，pqmodel中join以及transaction的参数和功能都进行了调整和升级。基本的model使用没有变化。**

> 7.x版本进行了整体的更新，并且是不兼容更新。接口和选项属性更加规范和一致。功能也更全面和稳定。从此版本开始支持指定外键和自动同步外键、数据的导出备份和导入接口、事务操作接口的升级等。

**8.x版本在7.2.x版本基础上，进行了更全面的更新，注意这些更新是有些不兼容的，但是数据表结构自动同步是兼容更新。不兼容的更新主要是去掉了fdelete、finsert、fupdate接口，并且内部运行结构进行了升级。**

**8.x更新的主要目的是让模型的操作接口更加一致，并且在事务处理时更加方便。**

操作数据库的模型有两个：

- 基础的Model，灵活易用，其内部就是利用pg的连接实例去生成并执行SQL。

- PostgreModel 此模型类实现了数据表的自动同步以及更强的功能，其内部会利用Model执行SQL。

因此，这种层层包装就要考虑到接口的一致性，接口尽可能一致就能增加易用性和可维护性，同时提高开发效率。

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

pqorm实例提供的接口：

- model(tablename, schema = null) 返回Model实例去执行SQL。

- transaction(callback, schema) 事务执行，其内部是调用了Model实例的transaction。


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

  //pqorm.model返回的就是Model实例。
  let result = await pqorm.model('user')
    .where(cond)
    .where('level > ? AND point > ?', [2,100])
    .select();

  console.log(result);

});

```

## 返回值

根据具体操作返回不同的值：

- insert 返回插入数据的数量或根据returning设置返回一个对象。

- insertAll 返回插入数据的数量或根据returning设置返回对象数组。

- update 返回更新数据的数量或根据returning设置返回对象数组。

- delete 返回删除数据的数量或根据returning设置返回对象数组。

- get 返回查询的数据对象或null。

- select 返回查询的对象数组，没有找到返回空数组。


``` JavaScript

async function getUserById (id) {
  return await pqorm.model('user').where('id=?', [id]).select()
}

/**
  @param {string} id
  @param {object} data
*/
async function updateUserInfo (id, data) {
  let count = await pqorm.model('user').where({id : id}).update(data)

  if (count > 0) return true

  return false
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
  await pqorm.model('users')
             .where('user_id = ?', ['123'])
             .update({
                username : 'qaz'
             });

  //删除
  await pqorm.model('users').where({user_id : '234'}).delete();

});

```

## @ 标记

value值在构造SQL语句时会自动进行引用处理，比如字符串aaa可能会变成\$_\$aaa\$_\$。如果不想进行自动的引用处理，则需要在key值前加上@标记。

```javascript
// UPDATE users SET level=level+1 WHERE id=12
pqorm.model('users')
    .where({id: 12})
    .update({
      '@level': 'level+1'
    })

```

## RETURNING 在更改数据后返回列

这是一个数据库的功能，sql语句支持returning功能可以在更改后返回指定的列，不需要再做一次查询。

model层面提供了returning接口设置要返回的列。

``` JavaScript

let {initORM} = require('psqlorm');
let pqorm = initORM(dbconfig);

;(async () => {

  //returning可以多次调用。
  await pqorm.model('users')
        .where('user_id = ?', ['123'])
        .returning('id')
        .returning(['username', 'role'])
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

提供了 sum、avg、max、min用于计算求和、均值、最大值、最小值。这几个函数，在查找到数据后返回值为数字，avg返回值为浮点类型，其他函数返回数字要看数据库字段是什么类型，而且max和min可以用于字符串类型的处理。

但是，如果你需要类型转换，可以在sum、avg、max、min中传递第二个参数指定要转换的类型，支持以下值：

- int

- float

- fixed

当转换类型为fixed时，实际的转换并不会转换为字符串，而是调用toFixed后再次转换为浮点数。

配合fixed选项，还有第三个参数指定为精度，默认为1。

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

  //转换为浮点数，保留2位小数。
  let avg = await pqorm.model('users').where(cond).avg('high', 'fixed', 2)

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

  let fields = [
    'u.id', 'u.username', 'u.detail', 'ud.page'
  ]

  //SELECT u.id, u.username, u.detail, ud.page FROM users AS u LEFT JOIN user_data AS ud ON u.id=ud.user_id WHERE role='test';
  let ulist = await pqorm.model('users')
                      .alias('u')
                      .leftJoin('user_data as ud', 'u.id = ud.user_id')
                      .where(cond)
                      .select(fields)

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

  let r = await pqorm.transaction(async (db, handle) => {
    //一定要使用db，否则就不是原子操作。
    //即使没有执行SQL的错误，但是某一过程的逻辑出错可以利用handle取消事务。
    //设计方案是返回值是一个对象，其中failed字段如果为true则表示执行失败，可以设置errmsg描述错误信息。
    //或者，如果返回false，则也认为是执行失败了。

    let a = await db.table('user').where('user_id = ?', [user_id]).select();
    
    if (a.length === 0) {
      handle.throwFailed('执行失败')
    }

    //result将会保存返回的数据，最终要在外层的transaction函数返回值里通过result属性拿到数据。
    ret.result = a;
  });

  if (r.ok) {
    console.log(r.result);
  } else {
    console.error(r.message);
  }

})();


```

### 事务运行的返回值

transaction不会抛出异常，相反，它会捕获异常然后设定相关数据并返回。

返回值是一个对象，三个属性ok、result、message :

``` JavaScript
{
    //result是callback返回值的数据，如果是一个object则result指向result属性。
    //否则result指向返回值本身。
    result : {
      id: '111',
      username: 'xxxxx'
    },

    //ok表示事务执行是否成功。
    ok : true,

    //errmsg是执行sql失败后抛出错误的信息描述。
    message : ''
}
```

## trigger

Model支持trigger和triggerCommit函数用于开启触发器，触发器支持insert、update、delete操作。这需要你提前编写trigger函数进行相关的处理，为了方便开发，直接在PostgreModel中编写trigger开头的函数即可。

```javascript

let pqorm = initORM(dbconfig);

//执行后，trigger表示开启触发器，此时会触发insert事件。
pqorm.model('users').reutrning('id').trigger().insert(data);

```

具体的要参考PostgreModel。

**注意：触发器是异步操作。**


## connect和model锁定

> **推荐通过pqorm.model()去自动执行，不要保存pqorm.model()的返回模型实例反复使用。**

通过pqorm.model()获取的模型实例是自动从连接池找到或创建的新的实例。一个实例执行一次sql以后会自动释放。若要使用中间变量保存返回的模型继续执行sql，则需要使用connect()方法锁定模型不被自动释放，运行结束后，使用free()方法释放。

```javascript

;(async () => {
    //等效代码：let m = pqorm.connect('users')
    let m = pqorm.model('users').connect()

    let r = await m.where('id = ?', [123]).get()

    console.log(r)

    r = await m.where('role = ?', ['admin']).select()

    console.log(r)

    //释放，若不调用free()，则m不会被放回连接池。
    //如果连接池为空，pqormmodel()会自动创建新的实例。
    m.free()
})();

```

**不调用Model.prototype.free()只是不会让模型实例放回连接池，函数运行结束，此实例就会被垃圾回收清理掉。并不会引发其他问题。**

## FOR UPDATE 和 FOR SHARE

以下两种方法分别提供支持：

- Model.prototype.forUpdate(k = '') 

SELECT ... FOR UPDATE操作，查询的行锁定。具体参考Postgresql的文档。此操作主要用在事务处理中，锁定查询到的行，其他事务无法对锁定的行进行修改。

如果传递参数true或'key'表示执行：

SELECT ... FOR KEY UPDATE

- Model.prototype.forShare(k = '')

SELECT ... FOR SAHRE

如果传递参数true或'no key'表示执行：

SELECT ... FOR NO KEY SHARE

> 数据库相关文档：<a target=_blank href="http://www.postgres.cn/docs/14/explicit-locking.html">显示锁定</a>

## where条件查询

where()方法用于构建SQL的WHERE条件语句，where()最强大的地方在于支持传递字符串格式的条件和object格式，支持链式调用。并且可以融合原生SQL。where链式调用是AND连接，若要使用OR操作则需要传递字符串格式的条件，具体参考示例。


**where(cond:string, args:Array)**
字符串格式的条件，可以使用?表示参数的值，?个数必须要和args数组的长度一致。使用?作为占位符，使用args传递参数，会进行字符串的引用处理，避免sql注入问题或其他安全问题。

**where(cond:object)**
object格式的条件使用key值作为字段名。value值即为条件的值。

**如何使用OR**

```javascript
//SELECT id,username,role,level FROM users WHERE (role = 'user' OR level > 1) AND is_active=1;
pqorm.model('users')
    .where('(role=? OR level > ?)', ['user', 1])
    .where({is_active: 1})
    .select(['id', 'username', 'role', 'level'])
```

**where 示例1**

```javascript
//SELECT * FROM content where tags ILIKE '%news%' AND is_delete=0 AND is_publish=1 ORDER BY create_time DESC;
pqorm.model('content')
     .where({
         tags: {'ILIKE': '%news%'},
         is_delete: 0,
         is_publish: 1
     })
     .order('create_time', 'DESC')
     .select()

```

**where 示例2**

```javascript
//SELECT * FROM content where tags ILIKE '%news%' AND is_delete=0 AND is_publish=1 AND group_id in (1,2,3) ORDER BY create_time DESC;
pqorm.model('content')
     .where({
         tags: {'ILIKE': '%news%'},
         is_delete: 0,
         is_publish: 1
     })
     .where({group_id: [1,2,3]})
     .order('create_time', 'DESC')
     .select()

```

## PostgreModel

PostgreModel更高一层ORM实现，但是对Postgres的类型支持有限，仅支持常用的类型：

> 数字（int、bigint、smallint、numeric）、字符串（text、char、varchar）、bytea、时间戳、jsonb。

对于不支持的类型，仍然可以创建并使用，只是在自动更新表结构时，对类型的处理会忽略。

这部分功能是稳定的，只是类型的支持不够全面，psotgresql支持的类型和功能太多了···

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
| innerJoin(m, on) | m可以是字符串表示表名也可以是另一个模型实例 | |
| leftJoin(m, on) | on是join条件 |  |
| rightJoin(m, on) | schema可以设置数据库schema |  |
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
| sync (debug = false) | 是否调试，会输出相关信息 | 同步表 |
| createSchema (schema) | 字符串 | 创建schema |
| check(data, quiet = true) | data为要插入或更新的数据对象，quiet为true表示不抛出错误。 | 检测数据的列是否和数据标结构一致。返回值为this，方便进行链式调用。 |

## 事务

```javascript

//测试代码
;async (() => {

  let r = await db.university.transaction(async (tb, ret) => {

    let a = await tb.model(db.userResult.tableName)
                    .returning('id,name,sex,subject')
                    .insert({
                      id: db.university.makeId(),
                      name: '王大力',
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

    //如果设置了result属性，则最后r得到的数据就是ooo而不是success
    //ret.result = 'ooo'

    //如果不设置ret.result属性，则return值作为r的结果
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

const PostgreModel = require('psqlorm').Model;

class dataTest extends PostgreModel {

  constructor(pqorm) {
    
    //必须写
    super(pqorm);

    //主要用于外键自动更新，需要初始化模型。
    this.modelPath = __dirname;

    //主键id前缀，建议不要超过2字符，或者要把主键id字符长度上限设置为24+
    this.idPre = '';
    
    //默认主键名为id，并且是字符串类型，默认禁止使用自增序列，如果确实需要使用，请调整你的想法或需求
    //this.primaryKey = 'id';

    //需要替换成数据表真正的名称

    this.tableName = 'data_test';

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
          //指定外键引用为users模型的id字段。
          ref: 'users:id',
          //指定更新动作。
          refActionDelete: 'cascade',
          refActionUpdate: 'cascade',
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

  //insert触发器。注意：触发器是异步操作。
  triggerInsert(tg) {
    console.log(tg);
  }

  //调用此函数，创建数据，会自动执行triggerInsert。
  async create (data) {
    return this.returning(['id', 'data_id']).trigger().insert(data);
  }

}

module.exports = dataTest;

```
