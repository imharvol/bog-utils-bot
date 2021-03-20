const path = require('path')
const Database = require('better-sqlite3') // https://github.com/JoshuaWise/better-sqlite3/blob/HEAD/docs/api.md

const db = new Database(path.join(__dirname, 'db.sqlite'))

db.prepare(`
CREATE TABLE "users" (
  "id" INTEGER NOT NULL UNIQUE,
  "username" TEXT NOT NULL UNIQUE,
  "address" TEXT,
  PRIMARY KEY("id")
);
`).run()
