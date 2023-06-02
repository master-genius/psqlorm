'use strict'

const randstring = require('./randstring.js');

//2017-2-25  2050
let start_time = 1490390182066
let t = new Date()
if (t.getFullYear() > 2050) {
  start_time = t.setFullYear(2045, 1, 25)
}

let loopch = [
  "0","1","2","3","4","5","6","7","8","9",
  "a","b","c","d","e","f","g","h","i","j",
  "k","l","m","n","o","p","q","r","s","t",
  "u","v","w","x","y","z"
]

let loopLength = loopch.length

class Clocks {
  constructor() {
    this.charClocks = {
      y: 0,
      m: 0,
      d: 0
    }
  }

  rand() {
    this.charClocks.y = parseInt(loopLength * Math.random())
    this.charClocks.m = parseInt(loopLength * Math.random())
    this.charClocks.d = parseInt(loopLength * Math.random())
  }

  getCharTime() {
    let str = loopch[this.charClocks.y] + loopch[this.charClocks.m] + loopch[this.charClocks.d]
    
    this.charClocks.d++
    if (this.charClocks.d >= loopLength) {
      this.charClocks.d = 0
      this.charClocks.m++
      if (this.charClocks.m >= loopLength) {
        this.charClocks.m = 0
        this.charClocks.y++
        if (this.charClocks.y >= loopLength) {
          this.charClocks.y = 0
        }
      }
    }

    return str
  }

}

function longId(idLen=16, idPre = '') {
  let pstr = (Date.now() - start_time).toString(16)
  let leng = pstr.length
  if (idLen < 16) idLen = 16
  return idPre + pstr + randstring(idLen - leng)
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

Object.defineProperty(makeId, 'serialId', {
  enumerable: false,
  configurable: false,
  get: function () {
    let _next = new Clocks()
    _next.rand()

    return function sid (idLen=15, idPre='') {
      let pstr = (Date.now() - start_time).toString(16)
      let leng = pstr.length
      if (idLen < 14) idLen = 14

      return idPre + pstr + _next.getCharTime() + randstring(idLen - leng - 3)
    }
  }
})

module.exports = makeId;

