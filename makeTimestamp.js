'use strict'

module.exports = function makeTimestamp(data, t) {
  if (!t || !Array.isArray(t)) return false;
  if (data[t[0]] !== undefined) return true;
  if (!t[1]) return false;

  if (typeof t[1] === 'function') {
    data[t[0]] = t[1]()
    return true
  }

  switch (t[1]) {
    case 'bigint':
      data[t[0]] = Date.now()
      break

    case 'int':
      data[t[0]] = parseInt(Date.now() / 1000)
      break

    case 'timestamp':
      data[t[0]] = (new Date()).toLocaleString().replaceAll('/', '-')
      break
  }
  
  return true
}
