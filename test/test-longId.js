'use strict'

const longId = require('../makeId').serialId
const longId2 = require('../makeId').numId
const longId3 = require('../makeId').bigId
const longId4 = require('../makeId').serialId

let tid = {}
let id
let id2
let count = 0

function check(id) {
  if (tid[id]) {
    console.log(id, ++count)
    return true
  }
  //console.log(id, typeof id)

  tid[id] = true
  return false
}

console.time('longid')

for (let i = 0; i < 1000000; i++) {
  id = longId()
  id2 = longId2(14)
  check(id)
  check(id2)
  check(longId3())
  check(longId4())
}

console.timeEnd('longid')
