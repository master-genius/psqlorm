## psqlorm ：基于pg扩展的简单ORM

在Node.js环境，已经有非常成熟并且完善的ORM库，当然其复杂性和学习使用成本也非常高，轻量级之所以受到青睐的原因就是轻量级库学习和使用成本低，而且能解决大部分需求，项目对其依赖程度也相对较低，而且一个庞大的库，当复杂性升高时，其bug也会增多。

Node.js环境有一个使用非常广泛的PostgreSQL数据库扩展：pg。pg是对PostgreSQL客户端协议做了基础的封装，提供了基础的但是非常容易使用的功能。在长期开发时，具备简单的ORM功能的库则是非常必要的。

所以，这个扩展诞生了，它很简单，仅仅是生成PostgreSQL方式的SQL语句，最后使用pg去执行。

**它不会自动安装pg扩展，你需要自己安装。**

如果你希望使用它，或者希望学习到什么，可以看源代码，如果你希望联系我，我的QQ是1146040444，我们把它用在了一些业务系统上，在目前它在保持简洁的同时也很好的支撑了快速的开发工作。

我们在近两三年的时间，开发并维护了Node.js环境的大量框架和相关组件，目的在于能完善Node.js平台的生态并完成一套体系，可以让我们快速建立服务，然而很多方式并不和你们看到的方案相同，甚至有些会完全背离目前流行的方案，当然我们也会对比目前流行的方案。除了Node.js，其实我们也用Go开发一些辅助工具，目前我们还没有把Go作为主要服务。


## 安装

```
//目前你还是需要安装手动安装pg
npm i pg

npm i psqlorm

```

## 初始化和简单查询

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

## 封装初始化函数

``` JavaScript

/**
 * dbconfig : {
 *   database : '',
 *   password : '',
 *   user     : '',
 *   host     : '',
 *   // 连接池最大数量
 *   max      : 12
 * }
 */
function initpgorm (dbconfig) {

  let pdb = new pg.Pool(dbconfig)

  return new psqlorm(pdb)
}

```

## 复杂查询

``` JavaScript

const pqorm = new psqlorm(pgdb);

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

## 插入数据

``` JavaScript

const pqorm = new psqlorm(pgdb);

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


const pqorm = new psqlorm(pgdb);

;(async () => {

  //更新
  await pqorm.model('users').where('user_id = ?', ['123']).update({
      username : 'qaz'
  });

  //删除
  await pqorm.model('users').where({user_id : '234'}).delete();

});

```

## 统计

使用count函数进行数据统计。

``` JavaScript

const pqorm = new psqlorm(pgdb);

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

## 求和、均值、最大值、最小值

提供了 sum、avg、max、min用于计算求和、均值、最大值、最小值。这几个函数，在查找到数据后返回值为数字，avg返回值为浮点类型，其他函数返回数字要看数据库字段是什么类型。

**如果没有找到数据，则无法进行计算，此时会返回null。**

``` JavaScript

const pqorm = new psqlorm(pgdb);

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

## join、leftJoin、rightJoin

join默认是INNER JOIN。三个函数的参数都是以下形式：

```
join (table, on) {
  //...
}
```

table是表名字，on是条件。

``` JavaScript

const pqorm = new psqlorm(pgdb)

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

const pqorm = new psqlorm(pgdb)

;(async () => {

  let cond = {
    role : 'test',
  }

  let ulist = await pqorm.model('users')
                          .where(cond)
                          .order('age DESC,high ASC')
                          .limit(10, 5); //从第5条开始返回10条。

  console.log(ulist)

});

```


## 事务

事务有两种调用方式，一个是直接调用pqorm.transaction，另一个是从pqorm.model().transaction。实际上，第一种是对第二种的封装，不过支持第二个参数设置schema，默认为public。

``` JavaScript

const pqorm = new psqlorm(pgdb);

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

transaction不会抛出异常，相反，它会捕获你异常并设定相关数据并返回。

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
