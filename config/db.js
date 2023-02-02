const { Pool } = require('pg')

const pool = new Pool({
  user: 'postgres',
  database: 'filemanager',
  password: 'admin',
  port: 5433,
  host: 'localhost',
})

module.exports = { pool };

