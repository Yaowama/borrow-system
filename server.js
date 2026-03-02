const express = require("express");
const helmet = require("helmet");
const path = require("path");
require("dotenv").config();

const db = require("./config/db");
const session = require("./config/session");

const authRoute = require("./routes/auth.route");
const userRoute = require("./routes/user.route");
const adminRoute = require("./routes/admin.route");


const app = express();
const expressLayouts = require('express-ejs-layouts');

app.use(express.static("public"));

app.use(expressLayouts);

app.set('layout', false); 

app.use("/uploads", express.static("public/uploads"));

/* ===============================
   SECURITY
================================ */
app.use(helmet());

/* ===============================
   BODY PARSER
================================ */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* ===============================
   STATIC FILES
================================ */
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static("uploads"));
app.use('/uploads/asset', express.static('uploads/asset'));

/* ===============================
   VIEW ENGINE
================================ */
app.set("view engine", "ejs");

/* ===============================
   SESSION
================================ */
app.use(session);

/* ===============================
   GLOBAL USER
================================ */
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

/* ===============================
   ROUTES
================================ */
app.use(authRoute);
app.use("/user", userRoute);
app.use("/admin", adminRoute);

/* ===============================
   DEFAULT
================================ */
app.get("/", (req, res) => {
  res.redirect("/login");
});

/* ===============================
   LOGOUT
================================ */
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

/* ===============================
   SERVER
================================ */
app.listen(3000, () => {
  console.log("🚀 Server running → http://localhost:3000");
});
