// config/mailer.js
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

// จำลอง interface เดิมของ nodemailer ให้ใช้งานได้เหมือนเดิม
const transporter = {
  sendMail: async ({ from, to, subject, html }) => {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Borrow System <onboarding@resend.dev>",
      to,
      subject,
      html
    });
    return result;
  }
};

module.exports = transporter;