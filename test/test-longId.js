'use strict'

const longId = require('../makeId').longId

let tid = {}
let id
let count = 0

console.time('longid')

for (let i = 0; i < 1000000; i++) {
  id = longId()
  if (tid[id]) {
    console.log(id, ++count)
    continue
  }

  tid[id] = true
}

console.timeEnd('longid')
