'use strict'

const EventEmitter = require('node:events');

class TableTrigger extends EventEmitter {
  constructor (tables = {}) {
    super()

    Object.defineProperty(this, 'tables', {
      enumerable: false,
      value: {},
      writable: false,
      configurable: false
    })

    if (tables) {
      for (let k in tables) {
        this.tables[k] = tables[k]
      }
    }
    
    this.events = [
      //'beforeUpdate',
      //'beforeInsert',
      //'beforeDelete',
      'insert',
      'update',
      'delete',
    ]

    this.events.forEach(e => {
      this.on(e, this.handleEvent)
    })
  }

  addTable (t, val) {
    this.tables[t] = val
  }

  hasTable (name) {
    return this.tables[name] ? true : false
  }

  async handleEvent (schema, table, evtname, sql, data) {
    if (!this.tables[table] || !this.tables[table][evtname]) return;

    let f = this.tables[table][evtname]
    if (typeof f !== 'function') {
      return false
    }

    try {
      await f({schema, table, eventName: evtname, sql, data})
    } catch (err) {
      console.error(err)
    }

  }

}

module.exports = TableTrigger
