const porm = require('../pqorm.js');

let pm = new porm(null);

let total = 100000;

start_time = Date.now();

var t = '';
for (let i=0; i < total; i++) {
  t = pm.model(`a${i}`);
}

end_time = Date.now();

console.log('total:', total, '; timing:' , end_time - start_time, 'ms');

