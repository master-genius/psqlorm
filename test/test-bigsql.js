const porm = require('../pqorm.js');

var pm = new porm(null);

start_time = Date.now();

var t = '';
for (let i=0; i < 100000; i++) {
  t = pm.model(`a${i}`);
}

end_time = Date.now();

console.log(end_time - start_time, 'ms');

