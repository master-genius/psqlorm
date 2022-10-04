'use strict'

const randstring = require('./randstring.js');

function makeId (idLen = 12, idPre = '') {
  
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

module.exports = makeId;
