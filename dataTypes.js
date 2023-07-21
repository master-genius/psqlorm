'use strict'

let types = {
  STRING: (len=200) => {
    return `varchar(${len})`
  },

  NUMBER: (l, p=2) => {
    if (typeof l === 'number' && typeof p === 'number') {
      return `numeric(${l},${p})`
    }

    return `numeric(7,2)`
  },
  
  CHAR: (len=100) => {
    return `char(${len})`
  },

  ARRAY: (t) => {
    return `${t}[]`
  },

  TEXT: 'text',
  INT: 'int',
  BIGINT: 'bigint',
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
  ID: 'varchar(13)',
  OPENID: 'varchar(40)'
}

types.DECIMAL = types.NUMBER

module.exports = types

