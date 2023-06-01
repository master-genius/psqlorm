'use strict'

const randstring = require('./randstring.js');

//2017-2-25  2050
let start_time = 1490390182066
let t = new Date()
if (t.getFullYear() > 2050) {
  start_time = t.setFullYear(2045, 1, 25)
}

function longId(idLen=16, idPre = '') {
  let pstr = (Date.now() - start_time).toString(16)
  let leng = pstr.length
  if (idLen < 16) idLen = 16
  return idPre + pstr + randstring(idLen - leng)
}

function mlongId(mid='', idLen=16, idPre = '') {
  let pstr = (Date.now() - start_time).toString(16)
  let leng = pstr.length
  if (idLen < 16) idLen = 16
  return idPre + pstr + '-' + mid + randstring(idLen - leng)
}

function makeId (idLen = 12, idPre = '') {
  if (idLen > 15) {
    return longId(idLen, idPre);
  }

  let tmstr = Math.random().toString(16).substring(2);

  if (tmstr.length < idLen) {
    tmstr = `${tmstr}${randstring(idLen - tmstr.length)}`;
  }

  if (tmstr.length > idLen) {
    tmstr = tmstr.substring(tmstr.length - idLen);
  }

  if (idPre) {
    return `${idPre}${tmstr}`;
  }

  return tmstr;
}


makeId.longId = longId
makeId.mlongId = mlongId

/*
Object.defineProperty(makeId, 'serialId', {
  enumerable: false,
  configurable: false,
  get: function () {
    let _next = 0
    let n = 0

    return function serialId() {
      _next++
      if (_next > 999) _next = 0

      let tm = Date.now() - start_time
      
      if (n > 8) n = 0
      n++

      return tm * 10000000 + _next * 10000 
          + n * 1000
          + (parseInt(Math.random() * 9) + 1) * 100
          + (parseInt(Math.random() * 9) + 1) * 10
          + parseInt(Math.random() * 10)
      
    }
  }
})
*/

module.exports = makeId;

