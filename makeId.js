'use strict'

const randstring = require('./randstring.js');

/* function nrand (f, t) {
  let discount = t - f;
  return parseInt((Math.random() * discount) + f);
} */

makeId () {
    
  let tmstr = Math.random().toString(16).substring(2);

  if (tmstr.length < this.idLen) {
    tmstr = `${tmstr}${randstring(this.idLen - tmstr.length)}`;
  }

  if (tmstr.length > this.idLen) {
    tmstr = tmstr.substring(tmstr.length - this.idLen);
  }

  if (this.idPre) {
    return `${this.idPre}${tmstr}`;
  }

  return tmstr;
}

module.exports = makeId;
