const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // ต้อง false สำหรับ 587
  auth: {
    user: process.env.EMAIL_USER, // apikey
    pass: process.env.EMAIL_PASS  // SG.xxxxxx
  }
});

module.exports = transporter;