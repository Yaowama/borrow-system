const mysql = require("mysql2/promise");
require("dotenv").config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  timezone: "+07:00",   // 🔥 เพิ่มบรรทัดนี้

  waitForConnections: true,
  connectionLimit: 10
});

module.exports = db;
