## psqlorm ：基于pg扩展的简单ORM

在Node.js环境，已经有非常成熟并且完善的ORM库，当然其复杂性和学习使用成本也非常高，轻量级之所以受到青睐的原因就是轻量级库学习和使用成本低，而且能解决大部分需求，项目对其依赖程度也相对较低，而且一个庞大的库，当复杂性升高时，其bug也会增多。

Node.js环境有一个使用非常广泛的PostgreSQL数据库扩展：pg。pg是对PostgreSQL客户端协议做了基础的封装，提供了基础的但是非常容易使用的功能。在长期开发时，具备简单的ORM功能的库则是非常必要的。

所以，这个扩展诞生了，它很简单，仅仅是生成PostgreSQL方式的SQL语句，最后使用pg去执行。

如果你希望使用它，或者希望学习到什么，可以看源代码，如果你希望联系我，我的QQ是1146040444，我们把它用在了一些业务系统上，在目前它在保持简洁的同时也很好的支撑了快速的开发工作。

我们在近两三年的时间，开发并维护了Node.js环境的大量框架和相关组件，目的在于能完善Node.js平台的生态并完成一套体系，可以让我们快速建立服务，然而很多方式并不和你们看到的方案相同，甚至有些会完全背离目前流行的方案，当然我们也会对比目前流行的方案。除了Node.js，其实我们也用Go开发一些辅助工具，目前我们还没有把Go作为主要服务。

对于通过编写程序并自动创建表的和修改字段的程序，我们还没有准备发布，等正式运行一段时间后再发布···

现在让我们来看看如何使用吧。

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
    max      : 10
});

const pqorm = new psqlorm(pgdb);

;(async () => {
    pqorm.model('user')
        .where({
            is_delete: 0
        })
        .select();
});


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

## 事物

事物有两种调用方式，一个是直接调用pqorm.transaction，另一个是从pqorm.model().transaction。实际上，第一种是对第二种的封装，不过支持第二个参数设置schema，默认为public。

``` JavaScript

const pqorm = new psqlorm(pgdb);

;(async () => {

  let r = await pqorm.transaction(async (db) => {
    //一定要使用db，否则就不是原子操作。
    //即使没有执行SQL的错误，但是某一过程的逻辑出错可以利用返回值表示执行失败
    //设计方案是返回值是一个对象，其中failed字段如果为true则表示执行失败，可以设置errmsg描述错误信息。
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

  //返回值r是一个对象，三个属性cret、result、errmsg
  /*
    {
        //cret是callback返回值的信息
        //cret还可以包括其他属性，这是开发者自行处理的。
        cret : {
            failed: false,
            errmsg : ''
        },
        //result是commit之后的pg执行结果，基本没有太多有用的信息，但是也返回了。
        result : {},
        //errmsg是执行sql失败后抛出错误的信息描述。
        errmsg : ''
    }
  */

});


```

> 尽管我总是说我们，其实所有的开发工作都是我。
