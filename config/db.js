const mysql = require("mysql2/promise");
require("dotenv").config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 4000,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  timezone: "+07:00",
  waitForConnections: true,
  connectionLimit: 10,
  ssl: {
    rejectUnauthorized: true
  },

  // ✅ เพิ่มส่วนนี้ป้องกัน ECONNRESET
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 10000,
  idleTimeout: 60000,
});

// ✅ เพิ่ม error handler ป้องกัน crash
db.on('connection', (conn) => {
  conn.on('error', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST') {
      console.warn('DB connection lost, pool will reconnect automatically');
    }
  });
});

module.exports = db;