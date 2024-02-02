'use strict'

const randstring = require('./randstring.js');

//2017-2-25  2050
let start_time = 1490390182066

let start_year = 2023

if ((new Date()).getFullYear() > 2085) {
  //start_time = t.setFullYear(2045, 1, 25)
  start_year = 2086
}

let loopch = [
  "0","1","2","3","4","5","6","7","8","9",
  "a","b","c","d","e","f","g","h","i","j",
  "k","l","m","n","o","p","q","r","s","t",
  "u","v","w","x","y","z"
]

//不要在意一点点内存，用空间换时间
let msloopch = []
for (let x of loopch) {
  for (let y of loopch) {
    msloopch.push(x+y)
  }
}

let sloopch = msloopch.slice(0, 100)
let yloopch = msloopch.slice(36, 500)

msloopch = msloopch.slice(parseInt(Math.random() * 100))

let loopLength = loopch.length
let sloopLength = sloopch.length
let yloopLength = yloopch.length

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

    if (yind < 0 || yind >= yloopLength) yind = 0

    //bits: 2 + 1 + 1 + 1 + 2 + 2 + 2 = 11
    return yloopch[yind] + loopch[month] + loopch[dat] + loopch[hour] + sloopch[minute] + sloopch[seconds] + msloopch[ms]
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

function longId(idLen=18, idPre = '') {
  let pstr = (Date.now() - start_time).toString(16)
  let leng = pstr.length
  if (idLen < 18) idLen = 18
  return idPre + pstr + randstring(idLen - leng)
}

function makeId (idLen = 12, idPre = '') {
  if (idLen > 17) {
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

let b_year = 2**47
let b_month = 2**43
let b_date = 2**38
let b_hour = 2**33
let b_min = 2**27
let b_sec = 2**21
let b_msec = 2**11

let end_max = 4096

function numId (obj) {
  let t = new Date()

  let first_num = (t.getFullYear() - start_year) * b_year + (t.getMonth()+1) * b_month
                  + t.getDate() * b_date + t.getHours() * b_hour + t.getMinutes() * b_min
                  + t.getSeconds() * b_sec + t.getMilliseconds() * b_msec

  let fnum = first_num + obj.endnum

  obj.endnum++

  if (obj.endnum >= end_max) {
    obj.endnum = 0
  }

  return fnum
}

function bigId(obj, a='', b='') {
  let fnum = numId(obj)
  return (BigInt(fnum) * 1000n + BigInt(parseInt(Math.random() * 1000))).toString()
}

Object.defineProperty(makeId, 'numId', {
  enumerable: false,
  configurable: false,
  get: function () {
    let oo = {
      endnum: parseInt(Math.random() * 2000)
    }

    return numId.bind(null, oo)
  }
})

Object.defineProperty(makeId, 'bigId', {
  enumerable: false,
  configurable: false,
  get: function () {
    let oo = {
      endnum: parseInt(Math.random() * 2000)
    }

    return bigId.bind(null, oo)
  }
})

makeId.longId = longId

Object.defineProperty(makeId, 'serialId', {
  enumerable: false,
  configurable: false,
  get: function () {
    let _next = new Clocks()
    _next.rand()

    return function sid (idLen=16, idPre='') {
      if (idLen < 14) return makeId(idLen, idPre)

      return idPre + _next.getFullTime() + randstring(idLen - 14)
    }
  }
})

module.exports = makeId;
