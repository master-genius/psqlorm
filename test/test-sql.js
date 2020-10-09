'use strict';

const porm = require('../pqorm');

var db = {};

var m = new porm(db);


;(async () => {

  let r = await m.model('users')
            .fetch()
            .where('age > ? AND role ILIKE ?', [29, '%user%'])
            .where({username : {ILIKE : '%brave%'}})
            .where('(points > ? OR points < ?)', [500, 200])
            .limit(20, 2)
            .select();

  console.log(r);

  r = await m.model('point_log')
          .fetch()
          .where({role: 'user', id : ['qwe','123','wee12','233e']})
          .update({
            points : '@points+5',
            point_type : 'increase'
          });
  console.log(r);
  
  r = await m.model('point_log')
          .fetch()
          .where({id : ['qwe','123','wee12','233e'], role : 'user'})
          .where({
              point_time : {
                '>' : Date.now() - 864000000,
                '<' : Date.now() - 3600
              }
           })
          .update({
            points : '@points+5',
            point_type : 'increase'
          });

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

})();

