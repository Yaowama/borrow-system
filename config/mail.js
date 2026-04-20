// const nodemailer = require("nodemailer");

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS
//   }
// });

// // function กลาง
// const sendEmail = async ({ to, subject, html }) => {
//   try {
//     await transporter.sendMail({
//       from: `"Borrow System" <${process.env.EMAIL_USER}>`,
//       to,
//       subject,
//       html
//     });
//   } catch (err) {
//     console.error("Send email error:", err);
//   }
// };

// module.exports = { sendEmail };

const nodemailer = require("nodemailer");

let _transporter = null;
let _etherealUser = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  const hasRealConfig =
    process.env.EMAIL_HOST &&
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS &&
    process.env.EMAIL_USER !== "test";

  if (hasRealConfig) {
    _transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    console.log("📧 Mail: using real SMTP →", process.env.EMAIL_HOST);
  } else {
    // Auto-create Ethereal test account
    const testAccount = await nodemailer.createTestAccount();
    _etherealUser = testAccount.user;
    _transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
    console.log("📧 Mail: using Ethereal (test mode)");
    console.log("   Inbox → https://ethereal.email/messages");
    console.log("   User  →", testAccount.user);
  }

  return _transporter;
}

const sendEmail = async ({ to, subject, html }) => {
  try {
    const t = await getTransporter();
    const from = process.env.EMAIL_FROM ||
      (_etherealUser ? `"ระบบยืม-คืน" <${_etherealUser}>` : '"ระบบยืม-คืน" <noreply@borrowsystem.com>');

    const info = await t.sendMail({ from, to, subject, html });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`📧 Preview: ${previewUrl}`);
    }

    return { success: true, previewUrl };
  } catch (err) {
    console.error("📧 sendEmail error:", err.message);
    return { success: false, error: err.message };
  }
};


function emailWrapper({ headerColor, iconText, headerTitle, bodyHtml }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <div style="background:${headerColor};padding:24px 28px 20px;display:flex;align-items:center;gap:12px">
        <div style="width:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${iconText}</div>
        <div style="color:#fff;font-size:17px;font-weight:600">${headerTitle}</div>
      </div>
      <div style="padding:24px 28px;background:#ffffff">${bodyHtml}</div>
      <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
        ระบบยืม–คืนอุปกรณ์ IT &nbsp;•&nbsp; อีเมลนี้ส่งโดยอัตโนมัติ กรุณาอย่าตอบกลับ
      </div>
    </div>`;
}

function tableRow(label, value, highlight = false) {
  return `<tr>
    <td style="color:#6b7280;padding:7px 0;width:130px;font-size:13px;vertical-align:top">${label}</td>
    <td style="font-size:13px;font-weight:500;padding:7px 0;color:${highlight ? '#dc2626' : '#111827'}">${value}</td>
  </tr>`;
}

function infoTable(rows) {
  const inner = rows.map(([l, v, h]) => tableRow(l, v, h)).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${inner}</table>`;
}

function note(text) {
  return `<p style="font-size:12px;color:#9ca3af;margin-top:16px;padding-top:14px;border-top:1px solid #f3f4f6;line-height:1.6">${text}</p>`;
}

function remarkBox(text, color = '#dc2626', bg = '#fef2f2', textColor = '#991b1b') {
  return `<div style="border-left:4px solid ${color};margin:12px 0;padding:10px 14px;background:${bg};color:${textColor};border-radius:0 6px 6px 0;font-size:13px">${text}</div>`;
}

// ── 1. ยื่นคำขอ → แจ้ง Admin ──────────────────────────────────
function emailNewRequest({ borrowCode, empName, empNum, typeName, purpose, dueDate, borrowDate }) {
  return emailWrapper({
    headerColor: '#1e3a5f', iconText: '📋',
    headerTitle: 'มีคำขอยืมอุปกรณ์รออนุมัติ',
    bodyHtml: `
      <p style="font-size:14px;color:#374151;margin-bottom:4px">สวัสดี <strong>Admin</strong></p>
      <p style="font-size:13px;color:#374151;margin-bottom:0">มีคำขอยืมอุปกรณ์ใหม่เข้ามาในระบบ กรุณาตรวจสอบและดำเนินการ</p>
      ${infoTable([
        ['เลขที่คำขอ', borrowCode],
        ['ผู้ยื่นคำขอ', `${empName} (${empNum})`],
        ['ประเภทอุปกรณ์', typeName],
        ['วัตถุประสงค์', purpose || '-'],
        ['กำหนดคืน', dueDate, true],
        ['วันที่ส่งคำขอ', borrowDate],
      ])}
      ${note('กรุณาเข้าสู่ระบบเพื่ออนุมัติหรือปฏิเสธคำขอ')}
    `
  });
}

// ── 2. อนุมัติ → แจ้ง User ────────────────────────────────────
function emailApproved({ borrowCode, name, deviceName, assetTag, dueDate, approveBy }) {
  return emailWrapper({
    headerColor: '#1d4ed8', iconText: '✅',
    headerTitle: 'คำขอยืมอุปกรณ์ได้รับการอนุมัติ',
    bodyHtml: `
      <p style="font-size:14px;color:#374151;margin-bottom:4px">สวัสดี <strong>${name}</strong></p>
      <p style="font-size:13px;color:#374151;margin-bottom:0">คำขอยืมอุปกรณ์ของคุณได้รับการอนุมัติเรียบร้อยแล้ว</p>
      ${infoTable([
        ['เลขที่คำขอ', borrowCode],
        ['อุปกรณ์', `${deviceName}`],
        ['Asset Tag	', assetTag || '-'],
        ['กำหนดคืน', dueDate, true],
        ['อนุมัติโดย', approveBy],
      ])}
      ${note('กรุณารับอุปกรณ์ที่อาคาร A ชั้น 3 (IT) และคืนให้ตรงตามกำหนด')}
    `
  });
}

// ── 3. ปฏิเสธ → แจ้ง User ────────────────────────────────────
function emailRejected({ borrowCode, name, deviceName, rejectBy, rejectDate, remark }) {
  return emailWrapper({
    headerColor: '#b91c1c', iconText: '❌',
    headerTitle: 'คำขอยืมอุปกรณ์ถูกปฏิเสธ',
    bodyHtml: `
      <p style="font-size:14px;color:#374151;margin-bottom:4px">สวัสดี <strong>${name}</strong></p>
      <p style="font-size:13px;color:#374151;margin-bottom:0">คำขอยืมอุปกรณ์ของคุณไม่ได้รับการอนุมัติ</p>
      ${infoTable([
        ['เลขที่คำขอ', borrowCode],
        ['ประเภทอุปกรณ์', deviceName || '-'],
        ['ปฏิเสธโดย', rejectBy],
        ['วันที่ปฏิเสธ', rejectDate],
      ])}
      <p style="font-size:13px;color:#374151;margin:4px 0">เหตุผล:</p>
      ${remarkBox(remark)}
      ${note('หากมีข้อสงสัยกรุณาติดต่อ Admin หรือยื่นคำขอใหม่อีกครั้ง')}
    `
  });
}

// ── 4. ใกล้ครบกำหนด → แจ้ง User ──────────────────────────────
function emailNearDue({ borrowCode, name, deviceName, assetTag, dueDate, remainDays }) {
  return emailWrapper({
    headerColor: '#c2410c', iconText: '⏰',
    headerTitle: 'อุปกรณ์ใกล้ถึงกำหนดคืน',
    bodyHtml: `
      <p style="font-size:14px;color:#374151;margin-bottom:4px">สวัสดี <strong>${name}</strong></p>
      <p style="font-size:13px;color:#374151;margin-bottom:0">อุปกรณ์ที่คุณยืมจะครบกำหนดคืนใน <strong style="color:#c2410c">${remainDays} วัน</strong> กรุณาเตรียมคืนอุปกรณ์ตามกำหนด</p>
      ${infoTable([
        ['เลขที่คำขอ', borrowCode],
        ['อุปกรณ์', `${deviceName}`],
        ['Asset Tag	', assetTag || '-'],
        ['กำหนดคืน', dueDate, true],
        ['เหลืออีก', `${remainDays} วัน`],
      ])}
      ${note('กรุณาคืนอุปกรณ์ที่อาคาร A ชั้น 3 (IT) ภายในวันที่กำหนด')}
    `
  });
}

// ── 5. เกินกำหนด → แจ้ง User ──────────────────────────────────
function emailOverdue({ borrowCode, name, deviceName, assetTag, dueDate, overdueDays }) {
  return emailWrapper({
    headerColor: '#7f1d1d', iconText: '🚨',
    headerTitle: 'อุปกรณ์เกินกำหนดคืน',
    bodyHtml: `
      <p style="font-size:14px;color:#374151;margin-bottom:4px">สวัสดี <strong>${name}</strong></p>
      <p style="font-size:13px;color:#374151;margin-bottom:0">อุปกรณ์ที่คุณยืมเกินกำหนดคืนแล้ว <strong style="color:#b91c1c">${overdueDays} วัน</strong> กรุณาคืนอุปกรณ์โดยด่วน</p>
      ${infoTable([
        ['เลขที่คำขอ', borrowCode],
        ['อุปกรณ์', `${deviceName}`],
        ['Asset Tag	', assetTag || '-'],
        ['กำหนดคืน', dueDate, true],
        ['เกินกำหนด', `${overdueDays} วัน`],
      ])}
      ${remarkBox(
        'กรุณาติดต่อฝ่าย IT เพื่อดำเนินการคืนอุปกรณ์โดยเร็วที่สุด หากไม่ดำเนินการอาจส่งผลต่อสิทธิ์การยืมในอนาคต'
      )}
      ${note('หากมีเหตุสุดวิสัย กรุณาแจ้งให้ฝ่าย IT ทราบล่วงหน้า')}
    `
  });
}

function emailReturned({ borrowCode, name, deviceName, returnDate, returnBy }) {
  return emailWrapper({
    headerColor: '#16a34a',
    iconText: '📦',
    headerTitle: 'คืนอุปกรณ์เรียบร้อย',
    bodyHtml: `
      <p style="font-size:14px;color:#374151;margin-bottom:4px">
        สวัสดี <strong>${name}</strong>
      </p>
      <p style="font-size:13px;color:#374151;margin-bottom:0">
        อุปกรณ์ที่คุณยืมได้รับการบันทึกคืนเรียบร้อยแล้ว
      </p>

      ${infoTable([
        ['เลขที่คำขอ', borrowCode],
        ['อุปกรณ์', deviceName],
        ['วันที่คืน', returnDate],
        ['รับคืนโดย', returnBy],
      ])}

      ${note('ขอบคุณที่ใช้บริการระบบยืม-คืนอุปกรณ์')}
    `
  });
}

module.exports = { sendEmail,emailNewRequest, emailApproved, emailRejected, emailNearDue, emailOverdue ,emailReturned };


