'use strict';

const porm = require('../pqorm');
const pqmodel = require('../pqmodel');

const db = {
  release: () => {},
  query: () => {},
  rollback:()=>{},
  connect: () => {
    return db
  }
};

let m = new porm(db);

class TestModel extends pqmodel {
  constructor (db) {
    super(db);
    this.tableName = 'test';
  }

}

let pm = new TestModel(m);


;(async () => {

  let r = await m.model('users')
            .fetch()
            .where('age > ? AND role ILIKE ?', [29, '%user%'])
            .where({username : {ILIKE : '%brave%'}})
            .where('(points > ? OR points < ?)', [500, 200])
            .limit(0, 2)
            .select();

  console.log(r);

  r = await m.model('point_log')
          .fetch()
          .where({role: 'user', id : ['qwe','123','wee12','233e'], level: 2.5})
          .where({
            openid: null,
            info: {
              'is not': null,
              'ilike': '%teacher%'
            }
          })
          .update({
            '@points' : 'points+5',
            point_type : 'increase'
          });
  console.log(r);
  
  r = await m.model('point_log')
          .fetch()
          .where({id : ['qwe','123','wee12','233e'], role : 'user'})
          .where('is_test', 1)
          .where('status', 'ok')
          .where({
              point_time : {
                '>' : Date.now() - 864000000,
                '<' : Date.now() - 3600
              }
           })
          .update({
            '@points' : 'points+5',
            point_type : 'increase'
          });

  console.log(r);

  r = await m.model('special_limit')
              .fetch()
              .where({
                '[special_name SIMILAR TO ? OR special_list SIMILAR TO ?]' : [
                  '%计算机%|%数学%', '%计算机%|%数学%'
                ],
                'first_mask & 1' : {
                  '!=' : 0
                },
                uncode : ['12345', '10086', '10085'],
              })
              .order('create_time', 'DESC')
              .order('weight ASC')
              .select();

  console.log(r);

  let dataList = [
    {
      id : '123',
      points : '15',
      point_type : 'increase',
    },
    {
      id : '124',
      points : 12,
      point_type : 'increase'
    }

  ];

  r = await m.model('point_log')
          .fetch()
          .insertAll(dataList);

  console.log(r);

  await pm.transaction(async (db, ret) => {
    
    let sqltext = await db.where({id: [1,2,3]}).fetch().select();

    console.log(sqltext);

    sqltext = await db.model('user').where({id:234}).fetch().update({key: 234});

    console.log(sqltext);

  });


})();

