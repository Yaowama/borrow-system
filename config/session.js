const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
require("dotenv").config();

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

module.exports = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { maxAge: 1000 * 60 * 60 }
});