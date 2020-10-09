const porm = require('../pqorm.js');

var pgdb = {};

var pm = new porm(pgdb);
pm.schema = 'www';

;(async () => {

  start_time = Date.now();

  var t = '';
  let r = null;
  for (let i=0; i<20000; i++) {
    
    t = pm.model('goods').fetch();
    r = await t.where('take_on=? AND (goods_type=? OR goods_type=?)', [1, 'g','p'])
              .select('id,goods_name,image_thumb,inventory');

    r = await pm.model('user_msg')
                .fetch()
                .where({
                  user_id : '1234',
                  'is_delete&1' : 0,
                  msg_time : {
                    '<' : start_time
                  },
                })
                .limit(0,123)
                .select('id,user_id,msg_time,is_delete,content');
    
  }

  end_time = Date.now();

  console.log(end_time - start_time, 'ms');

})();

