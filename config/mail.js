const nodemailer = require("nodemailer");

module.exports = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

const mailer = require("../config/mail");

for (let b of nearDueList) {

  await mailer.sendMail({
    to: b.email,
    subject: "แจ้งเตือนใกล้ครบกำหนดคืนอุปกรณ์",
    html: `
      <h3>แจ้งเตือนการคืนอุปกรณ์</h3>
      <p>
        อุปกรณ์: <b>${b.DeviceName}</b><br>
        เลขเอกสาร: ${b.BorrowCode}<br>
        กำหนดคืน: ${b.DueDate}<br>
        เหลือเวลา: ${b.remain_day} วัน
      </p>
    `
  });

}

