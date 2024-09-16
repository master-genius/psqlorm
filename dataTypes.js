'use strict'

let types = {
  STRING: (len=200) => {
    if (typeof len !== 'number' || len <= 0) { len = 200 }
    return `varchar(${len})`
  },

  NUMBER: (l, p=2) => {
    if (typeof l === 'number' && typeof p === 'number') {
      return `numeric(${l},${p})`
    }

    return `numeric(9,2)`
  },
  
  CHAR: (len=100) => {
    if (typeof len !== 'number' || len <= 0) { len = 100 }
    return `char(${len})`
  },

  ARRAY: (t) => {
    return `${t}[]`
  },

  TEXT: 'text',
  INT: 'int',
  BIGINT: 'bigint',
  BigInt: 'bigint',
  TIMESTAMP: 'timestamp',
  TIMESTAMPZ: 'timestamp with time zone',
  TIME: 'time',
  DATE: 'date',
  SMALLINT: 'smallint',
  BOOLEAN: 'boolean',
  BOOL: 'boolean',
  BYTE: 'bytea',
  BINARY: 'bytea',
  BLOB: 'bytea',
  JSONB: 'jsonb',
  ID: 'varchar(16)',
  OPENID: 'varchar(32)',
  UID: 'varchar(18)',
  BID: 'bigint',
  SERIAL: 'serial',
  BIGSERIAL: 'bigserial',
  BigSerial: 'bigserial',
}

types.DECIMAL = types.NUMBER
types.NUMERIC = types.NUMBER

for (let k in types) {
  let lk = k.toLowerCase()
  if (!types[lk]) {
    types[lk] = types[k]
  }
}

module.exports = types

