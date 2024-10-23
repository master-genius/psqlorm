'use strict'

module.exports = {
  quote: [
    "select",   "from",     "where",    "group",    "order",
    "having",   "join",     "left",     "right",
    "inner",    "outer",    "full",     "between",
    "case",     "when",     "then",     "end",      "to",
    "union",    "all",      "limit",    "offset",   "desc",
    "type",     "like",     "ilike",

    "insert",   "update",   "delete",   "into", 
    "set",      "add",      "alter",    "column",   "table",
    "default",  "check",    "unique",   "primary",  "foreign",
    "key",      "index",    "constraint",  "using",

    "user",     "session",  "trigger",  "view", "schema",

    "over",     "window",   "range",  "fetch",
    "only",     "cascade",  "references",
    "grant",    "revoke",   "return",   "call",

    "current_user", "session_user",
  ],

  forbid: [
    "null", "not", "and", "or", "asc", "else", "by", "on", "if",
  ]
}