const porm = require('../pqorm.js');

var pgdb = {};

var pm = new porm(pgdb);
pm.schema = 'www';

;(async () => {

  start_time = Date.now();

  var t = '';
  let r = null;
  let count = 0;
  for (let i=0; i<20000; i++) {
    t = pm.model('goods').fetch();
    r = await t.where('take_on=? AND (goods_type=? OR goods_type=?)', [1, 'g','p'])
                .where({info: null})
                .where('is_publish', 1)
                .where({
                  hid: {
                    'is not' : null,
                    'ilike' : '%x__%'
                  }
                })
                .select('id,goods_name,image_thumb,inventory');
    count++;

    r = await pm.model('user_msg')
                .fetch()
                .where({
                  user_id : '1234',
                  'is_delete&1' : 0,
                  msg_time : {
                    '<' : start_time
                  },
                })
                .where('role', 'user')
                .limit(0,123)
                .select('id,user_id,msg_time,is_delete,content');

    count++;

    r = await pm.model('users', 'uni').fetch()
                .returning('id,username')
                .where({id: 'sdf32947239v', is_delete: 0})
                .update({level: 5, role: 'admin', detail: '$$18236D$$$$'});
    count++;
    //console.log(r)
  }

  end_time = Date.now();

  console.log(end_time - start_time, 'ms', 'total', count);

})();

