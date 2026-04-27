const express = require("express");
const helmet = require("helmet");
const path = require("path");
require("dotenv").config();

const db = require("./config/db");
const session = require("./config/session");
require("./config/cron");

const authRoute = require("./routes/auth.route");
const userRoute = require("./routes/user.route");
const adminRoute = require("./routes/admin.route");

const app = express();
const expressLayouts = require("express-ejs-layouts");

const cron = require('node-cron');
const { sendEmail,emailNearDue, emailOverdue } = require('./config/mail');



app.use(expressLayouts);
app.set("layout", false);

/* ===============================
   🔔 CREATE NOTIFICATION
================================ */
async function createNotification({
  receiverId,
  type,
  title,
  message,
  refId = null,
  link = null
}) {
  try {
    await db.query(`
      INSERT INTO tb_t_notification 
      (ReceiverID, NotiType, Title, Message, RefID, Link, IsRead, IsDeleted, CreatedDate)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, NOW())
    `, [receiverId, type, title, message, refId, link]);

  } catch (err) {
    console.error("Notification error:", err);
  }
}

// ทุกวัน 08:00
cron.schedule('0 8 * * *', async () => {
  try {
    // ── ใกล้ครบกำหนด (0-3 วัน) ──
    const [nearDues] = await db.query(`
      SELECT bt.BorrowID, bt.BorrowCode,
        CONCAT(e.fname,' ',e.lname) AS name, e.email,
        d.DeviceName, da.AssetTag, da.ITCode,
        DATE_FORMAT(bt.DueDate,'%d/%m/%Y') AS DueDate,
        DATEDIFF(bt.DueDate, CURDATE()) AS remainDays
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      WHERE bt.BorrowStatusID = 6
        AND bt.ReturnDate IS NULL
        AND DATEDIFF(bt.DueDate, CURDATE()) BETWEEN 0 AND 3
        AND e.email IS NOT NULL
    `);

    for (const r of nearDues) {
      await Promise.all(
        nearDues.map(r =>
          sendEmail({
            to: r.email,
            subject: `แจ้งเตือน: อุปกรณ์ใกล้ครบกำหนดคืน ${r.BorrowCode}`,
            html: emailNearDue(r)
          })
        )
      );
    }

    // ── เกินกำหนด ──
    const [overdues] = await db.query(`
      SELECT bt.BorrowID, bt.BorrowCode,
        CONCAT(e.fname,' ',e.lname) AS name, e.email,
        d.DeviceName, da.AssetTag, da.ITCode,
        DATE_FORMAT(bt.DueDate,'%d/%m/%Y') AS DueDate,
        DATEDIFF(CURDATE(), bt.DueDate) AS overdueDays
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      WHERE bt.BorrowStatusID = 6
        AND bt.ReturnDate IS NULL
        AND bt.DueDate < CURDATE()
        AND e.email IS NOT NULL
    `);

    for (const r of overdues) {
      await Promise.all(
        overdues.map(r =>
          sendEmail({
            to: r.email,
            subject: `⚠ แจ้งเตือน: อุปกรณ์เกินกำหนดคืน ${r.BorrowCode}`,
            html: emailOverdue(r)
          })
        )
      );
    }

  } catch (err) {
    console.error('CRON EMAIL ERROR:', err);
  }
});
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
   STATIC
================================ */
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

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