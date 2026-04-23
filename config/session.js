const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const db = require("./db");
require("dotenv").config();

const sessionStore = new MySQLStore({}, db);

module.exports = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { maxAge: 1000 * 60 * 60 }
});