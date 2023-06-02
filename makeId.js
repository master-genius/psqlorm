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

let sloopch = loopch.concat([
  'A', 'B', 'C', 'D', 'E', 'F', 'G',
  'H', 'I', 'J', 'K', 'L', 'M', 'N',
  'O', 'P', 'Q', 'R', 'S', 'T', 'U',
  'V', 'W', 'X', 'Y', 'Z', '_'
])

//不要在意一点点内存，用空间换时间
let msloopch = []
for (let x of loopch) {
  for (let y of loopch) {
    msloopch.push(x+y)
  }
}

msloopch = msloopch.slice(parseInt(Math.random() * 100))

let loopLength = loopch.length
let sloopLength = sloopch.length

class Clocks {
  constructor() {
    this.clocks = {
      y: 0,
      m: 0,
      d: 0
    }

    this.startYear = 2023
  }

  rand() {
    for (let k in this.clocks) {
      this.clocks[k] = parseInt(loopLength * Math.random())
    }
  }

  getFullTime() {
    return this.getTime() + this.getCharTime()
  }

  getTime() {
    let t = new Date()
    let year = t.getFullYear()
    let month = t.getMonth()
    let dat = t.getDate()
    let hour = t.getHours()
    let minute = t.getMinutes()
    let seconds = t.getSeconds()
    let ms = t.getMilliseconds()
    
    let yind = year - this.startYear

    if (yind < 1 || yind > sloopLength) yind = 1

    return sloopch[yind] + loopch[month] + loopch[dat] + loopch[hour] + sloopch[minute] + sloopch[seconds] + msloopch[ms]
  }

  getCharTime() {
    let str = loopch[this.clocks.y] + loopch[this.clocks.m] + loopch[this.clocks.d]
    
    this.clocks.d++
    if (this.clocks.d >= loopLength) {
      this.clocks.d = 0
      this.clocks.m++
      if (this.clocks.m >= loopLength) {
        this.clocks.m = 0
        this.clocks.y++
        if (this.clocks.y >= loopLength) {
          this.clocks.y = 0
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

    return function sid (idLen=13, idPre='') {
      if (idLen < 12) return makeId(idLen, idPre)

      return idPre + _next.getFullTime() + randstring(idLen - 11)
    }
  }
})

module.exports = makeId;

