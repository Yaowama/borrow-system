const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLogin, check2FAWarning } = require("../middleware/auth");
const { sendEmail , emailNewRequest } = require('../config/mail');
const multer = require("multer");
const path = require("path");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/profile");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น"));
    }
  }
});


/* ===============================
   CHECK ACTIVE
================================ */
async function checkActive(req, res, next) {

  try {

    const EMPID = req.session.user.EMPID;

    const [rows] = await db.query(
      "SELECT IsActive FROM tb_t_employee WHERE EMPID=?",
      [EMPID]
    );

    if (rows.length === 0 || rows[0].IsActive == 0) {

      req.session.destroy();

      return res.render("login", {
        error: "⛔ บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อ Admin"
      });

    }

    next();

  } catch (err) {

    console.error(err);
    res.redirect("/login");

  }

}
/* ===============================
   ROOT
================================ */

router.get("/", (req, res) => {
  res.redirect("/user/dashboard");
});

router.get("/notifications", async (req, res) => {
  const empId = req.session.user?.EMPID;
  if (!empId) return res.json({ count: 0, items: [] });

  // ✅ ดึง readKeys ก่อนเลย
  const [readRows] = await db.query(
    "SELECT NotiKey FROM tb_t_notificationread WHERE EMPID = ?", [empId]
  );
  const readKeys = new Set(readRows.map(r => r.NotiKey));

  const notifications = [];

  // ---- ส่งคำขอยืม (pending) ----
  const [sent] = await db.query(`
    SELECT bt.BorrowID, bt.BorrowCode,
           DATE_FORMAT(bt.BorrowDate,'%d/%m/%Y %H:%i') AS CreatedDate,
           bt.BorrowDate AS rawTime
    FROM tb_t_borrowtransaction bt
    WHERE bt.EMPID = ? AND bt.BorrowStatusID = 1
    ORDER BY bt.BorrowDate DESC LIMIT 5
  `, [empId]);
  sent.forEach(r => notifications.push({
    notiKey: `u-pending-${r.BorrowID}`,
    rawTime: new Date(r.rawTime),
    type: "borrow_sent", icon: "paper-plane", color: "#3b82f6",
    title: "ส่งคำขอยืมแล้ว", desc: r.BorrowCode,
    time: r.CreatedDate, url: "/user/borrow_status"
  }));

  // ---- อนุมัติแล้ว ----
  const [approved] = await db.query(`
    SELECT bt.BorrowID, bt.BorrowCode,
           DATE_FORMAT(bt.ApproveDate,'%d/%m/%Y %H:%i') AS ApproveDate,
           bt.ApproveDate AS rawTime
    FROM tb_t_borrowtransaction bt
    WHERE bt.EMPID = ? AND bt.BorrowStatusID = 2
    ORDER BY bt.ApproveDate DESC LIMIT 5
  `, [empId]);
  approved.forEach(r => notifications.push({
    notiKey: `u-approved-${r.BorrowID}`,
    rawTime: new Date(r.rawTime),
    type: "approved", icon: "circle-check", color: "#008afb",
    title: "อนุมัติแล้ว", desc: r.BorrowCode,
    time: r.ApproveDate, url: "/user/borrow_status"
  }));

  // ---- ใกล้ครบกำหนด ----
  const [nearDue] = await db.query(`
    SELECT bt.BorrowID, bt.BorrowCode,
          DATEDIFF(bt.DueDate, CURDATE()) AS remain,
          DATE_FORMAT(bt.DueDate,'%d/%m/%Y') AS DueDate,
          bt.BorrowDate AS rawTime    
    FROM tb_t_borrowtransaction bt
    WHERE bt.EMPID = ? AND bt.BorrowStatusID = 6
      AND bt.ReturnDate IS NULL
      AND DATEDIFF(bt.DueDate, CURDATE()) BETWEEN 0 AND 3
  `, [empId]);
  nearDue.forEach(r => notifications.push({
    notiKey: `u-neardue-${r.BorrowID}`,
    rawTime: new Date(r.rawTime),
    type: "neardue", icon: "bell", color: "#f97316",
    title: `ใกล้ครบกำหนด ${r.remain} วัน`,
    desc: r.BorrowCode, time: `ครบ ${r.DueDate}`, url: "/user/borrowing"
  }));

  // ---- คืนแล้ว ----
  const [returned] = await db.query(`
    SELECT bt.BorrowID, bt.BorrowCode,
          DATE_FORMAT(bt.ReturnDate,'%d/%m/%Y %H:%i') AS ReturnDate,
          bt.ReturnDate AS rawTime
    FROM tb_t_borrowtransaction bt
    WHERE bt.EMPID = ?
      AND bt.BorrowStatusID = 4
      AND bt.ReturnDate IS NOT NULL
      AND bt.ReturnDate >= DATE_SUB(NOW(), INTERVAL 3 DAY)
    ORDER BY bt.ReturnDate DESC LIMIT 5
  `, [empId]);
  returned.forEach(r => notifications.push({
    notiKey: `u-returned-${r.BorrowID}`,
    rawTime: new Date(r.rawTime),
    type: "returned", icon: "circle-check", color: "#16a34a",
    title: "คืนอุปกรณ์เรียบร้อย",
    desc: r.BorrowCode,
    time: r.ReturnDate,
    url: "/user/history"
  }));

  // ---- ถูกปฏิเสธ ----
  const [rejected] = await db.query(`
    SELECT bt.BorrowID, bt.BorrowCode,
          bt.Remark,
          DATE_FORMAT(bt.ApproveDate,'%d/%m/%Y %H:%i') AS ApproveDate,
          bt.ApproveDate AS rawTime
    FROM tb_t_borrowtransaction bt
    WHERE bt.EMPID = ?
      AND bt.BorrowStatusID = 3
      AND bt.ApproveDate >= DATE_SUB(NOW(), INTERVAL 3 DAY)
    ORDER BY bt.ApproveDate DESC LIMIT 5
  `, [empId]);
  rejected.forEach(r => notifications.push({
    notiKey: `u-rejected-${r.BorrowID}`,
    rawTime: new Date(r.rawTime),
    type: "rejected", icon: "circle-xmark", color: "#ef4444",
    title: "คำขอถูกปฏิเสธ",
    desc: r.BorrowCode + (r.Remark ? ` • ${r.Remark}` : ''),
    time: r.ApproveDate,
    url: "/user/history"
  }));

  notifications.sort((a, b) => b.rawTime - a.rawTime);

  // ✅ ใช้ readKeys ที่ดึงมาตั้งแต่ต้น ไม่ดึงซ้ำ
  const items = notifications.map(n => ({
    ...n,
    rawTime: undefined,
    isRead: readKeys.has(n.notiKey)
  }));

  res.json({ count: items.filter(i => !i.isRead).length, items });
});

// mark-read (user)
router.post("/notifications/mark-read", async (req, res) => {
  try {
    const empId = req.session.user?.EMPID;
    if (!empId) return res.json({ ok: false });

    const { keys } = req.body;
    if (!Array.isArray(keys) || !keys.length) return res.json({ ok: true });

    // ✅ แก้จาก VALUES ? เป็น loop แทน
    for (const key of keys) {
      await db.query(
        "INSERT IGNORE INTO tb_t_notificationread (EMPID, NotiKey) VALUES (?, ?)",
        [empId, key]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("MARK READ ERROR:", err);
    res.json({ ok: false });
  }
});

/* ===============================
   USER DASHBOARD
================================ */
router.use(isLogin, checkActive, check2FAWarning);
router.get("/dashboard", async (req, res) => {

  try {

    const [types] = await db.query(`
      SELECT 
        t.TypeID,
        t.TypeName,
        t.TypeImage,
        c.CategoryName,
        COUNT(da.DVID) AS Stock
      FROM tb_m_type t
      LEFT JOIN tb_t_device d 
        ON d.TypeID = t.TypeID
      LEFT JOIN tb_m_category c 
        ON d.CategoryID = c.CategoryID  
      LEFT JOIN tb_t_deviceadd da 
        ON da.DeviceID = d.DeviceID 
        AND da.DVStatusID = 1
      GROUP BY t.TypeID, t.TypeName, t.TypeImage, c.CategoryName
      ORDER BY t.TypeName
    `);
    const [[stats]] = await db.query(`
      SELECT
        SUM(CASE WHEN BorrowStatusID IN (2,6) AND ReturnDate IS NULL THEN 1 ELSE 0 END) AS borrowing,
        SUM(CASE WHEN BorrowStatusID = 1 THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN BorrowStatusID IN (2,6) AND ReturnDate IS NULL AND DueDate < CURDATE() THEN 1 ELSE 0 END) AS overdue,
        COUNT(*) AS history
      FROM tb_t_borrowtransaction
      WHERE EMPID = ?
    `, [req.session.user.EMPID]);

    // เปลี่ยนชื่อ variable ที่ query มาจาก DB
      const [[dbUser]] = await db.query(`
        SELECT fname, lname, ProfileImage
        FROM tb_t_employee
        WHERE EMPID = ?
      `, [req.session.user.EMPID]);

        // อัป session ด้วย ProfileImage ล่าสุด
        if (dbUser?.ProfileImage) {
          req.session.user.ProfileImage = dbUser.ProfileImage;
        }

        res.render("user/layout", {
          title: "ระบบยืม–คืน",
          page: "user",
          user: req.session.user,  // ✅ ใช้ session ที่อัปแล้ว
          types,
          stats,
          success: req.query.success,
          active: "dashboard"
        });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }

});

/* ===============================
   BORROW FORM
================================ */
router.get("/borrow/:id", isLogin, checkActive, async (req, res) => {
  
  const [[device]] = await db.query(`
    SELECT
      d.DeviceID,
      d.DeviceName,
      d.DeviceImage,
      t.TypeName,
      c.CategoryName,
      b.BrandName,
      m.ModelName,
      COUNT(da.DVID) AS RemainQty
    FROM tb_t_device d
    LEFT JOIN tb_t_deviceadd da
      ON d.DeviceID = da.DeviceID
      AND da.DVStatusID = 1
    LEFT JOIN tb_m_type t ON d.TypeID = t.TypeID
    LEFT JOIN tb_m_category c ON d.CategoryID = c.CategoryID
    LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
    LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
    WHERE d.DeviceID = ?
    GROUP BY d.DeviceID
  `, [req.params.id]);

  if (!device) {
    if (req.xhr || req.headers.accept.includes("json")) {
      return res.status(404).json({ error: "ไม่พบอุปกรณ์" });
    }
    return res.redirect("/user/dashboard?error=notfound");
  }

  // ถ้าเรียกแบบ AJAX ให้ส่ง JSON
  if (req.xhr || req.headers.accept.includes("json")) {
    return res.json({ device });
  }

  // ถ้าเรียกแบบปกติ ยัง render page ได้
  res.render("user/layout", {
    title: "ยืมอุปกรณ์",
    page: "borrow_form",
    user: req.session.user,
    device,
    active: "borrow_form"
  });
});


router.post("/borrow/:id", isLogin, checkActive, async (req, res) => {
  const EMPID = req.session.user.EMPID;
  const TypeID = req.params.id;
  const { BorrowDate, DueDate, purpose, location, note, qty = 1 } = req.body;
  const qtyNum = Number(qty);

  if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
    return res.status(400).json({ success: false, message: "จำนวนยืมไม่ถูกต้อง" });
  }

  try {
    const borrowCodes = []; // ✅ เก็บทุก code

    // =========================
    // 📝 INSERT BORROW + NOTI
    // =========================
    for (let i = 0; i < qtyNum; i++) {
      const borrowCode = "BR" + Date.now() + i;

      borrowCodes.push(borrowCode);

      await db.query(`
        INSERT INTO tb_t_borrowtransaction
        (BorrowCode, EMPID, TypeID, DVID, DueDate, Purpose, \`Location\`, BorrowStatusID, Remark)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
      `, [
        borrowCode,
        EMPID,
        TypeID,
        DueDate,
        purpose,
        location,
        1,
        note || null
      ]);

      await db.query(`
        INSERT INTO tb_t_notification
        (ReceiverID, NotiType, Title, Message, RefID, IsRead, CreatedDate)
        VALUES (?, ?, ?, ?, ?, 0, NOW())
      `, [
        EMPID,
        "borrow_sent",
        "ส่งคำขอยืมแล้ว",
        `คำขอเลขที่ ${borrowCode} ถูกส่งเรียบร้อย`,
        borrowCode
      ]);
    }

    // =========================
    // 📧 PREPARE EMAIL DATA
    // =========================
    const borrowCodeText = borrowCodes.join(", ");

    const [admins] = await db.query(`
      SELECT email FROM tb_t_employee 
      WHERE RoleID = 2 AND IsActive = 1 AND email IS NOT NULL
    `);

    const [[emp]] = await db.query(`
      SELECT fname, lname, EMP_NUM FROM tb_t_employee WHERE EMPID = ?
    `, [EMPID]);

    const [[type]] = await db.query(`
      SELECT TypeName FROM tb_m_type WHERE TypeID = ?
    `, [TypeID]);

    const dueDateFormatted = new Date(DueDate).toLocaleDateString('th-TH');
    const nowFormatted = new Date().toLocaleString('th-TH');


    res.json({ success: true });

    // =========================
    // 📧 SEND EMAIL (async หลังบ้าน)
    // =========================
    (async () => {
      try {
        await Promise.all(
          admins.map(admin =>
            sendEmail({
              to: admin.email,
              subject: `[รออนุมัติ] คำขอยืมอุปกรณ์ ${borrowCodeText}`,
              html: emailNewRequest({
                borrowCode: borrowCodeText,
                empName: `${emp.fname} ${emp.lname}`,
                empNum: emp.EMP_NUM,
                typeName: type.TypeName,
                purpose,
                dueDate: dueDateFormatted,
                borrowDate: nowFormatted,
              })
            })
          )
        );
      } catch (e) {
        console.error("EMAIL ERROR:", e.message);
      }
    })();

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});


/* ===============================
   BORROW HISTORY
================================ */

router.get("/borrow/history", isLogin, checkActive, async (req, res) => {

  const EMPID = req.session.user.EMPID;

  const [rows] = await db.query(`
    SELECT
      bt.*,
      DATE_FORMAT(bt.BorrowDate, '%d/%m/%Y') AS BorrowDate,
      DATE_FORMAT(bt.DueDate, '%d/%m/%Y') AS DueDate,
      d.DeviceName,
      s.StatusName
    FROM tb_t_borrowtransaction bt
    JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    JOIN tb_m_borrowstatus s
      ON bt.BorrowStatusID = s.BorrowStatusID
    WHERE bt.EMPID = ?
    ORDER BY bt.BorrowDate DESC
  `, [EMPID]);


  res.render("user/layout", {
    title: "ประวัติการยืม",
    page: "borrow_history",
    user: req.session.user,
    rows,
    success: req.query.success,
    active: "borrow_history"
  });
});

/* ===============================
   BORROW STATUS (คำขอที่ยังรอ / อนุมัติ)
================================ */
router.get("/borrow_status", isLogin, checkActive, async (req, res) => {
  try {
    const EMPID = req.session.user.EMPID;

    const [rows] = await db.query(`
      SELECT
        bt.BorrowID,
        bt.BorrowCode,
        DATE_FORMAT(bt.BorrowDate, '%d/%m/%Y') AS BorrowDate,
        DATE_FORMAT(bt.DueDate, '%d/%m/%Y') AS DueDate,
        bt.BorrowStatusID,
        bt.Remark,
        bt.IsUserViewed,
        bt.TypeID,
        t.TypeName,
        COALESCE(d.DeviceName, t.TypeName) AS DeviceName,
        b.BrandName,
        m.ModelName,
        c.CategoryName,
        s.StatusName,

        CASE
          WHEN bt.BorrowStatusID = 1
            THEN CONCAT('/uploads/type/', t.TypeImage)
          WHEN d.DeviceImage IS NOT NULL
            THEN CONCAT('/uploads/device/', d.DeviceImage)
          WHEN t.TypeImage IS NOT NULL
            THEN CONCAT('/uploads/type/', t.TypeImage)
          ELSE NULL
        END AS DeviceImagePath

      FROM tb_t_borrowtransaction bt
      LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      LEFT JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
      LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
      LEFT JOIN tb_m_category c ON d.CategoryID = c.CategoryID
      LEFT JOIN tb_m_type t ON bt.TypeID = t.TypeID
      JOIN tb_m_borrowstatus s ON bt.BorrowStatusID = s.BorrowStatusID
      WHERE bt.EMPID = ?
        AND (
          bt.BorrowStatusID IN (1,2)
          OR (bt.BorrowStatusID = 3 AND bt.IsUserViewed = 0)
        )
      ORDER BY bt.BorrowDate DESC
    `, [EMPID]);

    res.render("user/layout", {
      title: "สถานะคำขอยืมอุปกรณ์",
      page: "borrow_status",
      user: req.session.user,
      rows,
      success: req.query.success,
      active: "borrow_status"
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});



router.get("/borrow/detail/data/:code", isLogin, checkActive, async (req, res) => {
  const { code } = req.params;
  const EMPID = req.session.user.EMPID;

  const [rows] = await db.query(`
    SELECT
      bt.BorrowCode,
      bt.BorrowStatusID,

      bt.BorrowDate,
      bt.DueDate,
      bt.ReturnDate,

      bt.Purpose,
      bt.\`Location\`,
      bt.Remark,
      d.DeviceImage,
      t.TypeImage,

      COALESCE(d.DeviceName, t.TypeName) AS DeviceName,

      b.BrandName,
      m.ModelName,
      s.StatusName,

      CASE
        WHEN bt.BorrowStatusID = 4
          AND bt.ReturnDate IS NOT NULL
          AND bt.ReturnDate > bt.DueDate
        THEN CONCAT('เกินกำหนด ', DATEDIFF(bt.ReturnDate, bt.DueDate), ' วัน')

        WHEN bt.BorrowStatusID IN (2,6)
          AND bt.ReturnDate IS NULL
          AND CURDATE() > bt.DueDate
        THEN CONCAT('เกินกำหนด ', DATEDIFF(CURDATE(), bt.DueDate), ' วัน')

        ELSE NULL
      END AS OverdueText

    FROM tb_t_borrowtransaction bt
    LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
    LEFT JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
    LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
    LEFT JOIN tb_m_type t ON bt.TypeID = t.TypeID
    JOIN tb_m_borrowstatus s ON bt.BorrowStatusID = s.BorrowStatusID

    WHERE bt.BorrowCode = ?
      AND bt.EMPID = ?
  `, [code, EMPID]);

  res.json(rows);
});


router.post('/borrow/mark-viewed/:code', isLogin, checkActive, async (req, res) => {
  const code = req.params.code;
  const EMPID = req.session.user.EMPID;

  try {
    await db.query(`
      UPDATE tb_t_borrowtransaction
      SET IsUserViewed = 1
      WHERE BorrowCode = ?
        AND EMPID = ?
        AND BorrowStatusID = 3
    `, [code, EMPID]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

router.post("/borrow/cancel/:id", isLogin, checkActive, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.EMPID;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [[borrow]] = await conn.query(`
      SELECT DVID
      FROM tb_t_borrowtransaction
      WHERE BorrowID = ?
        AND EMPID = ?
        AND BorrowStatusID = 1
      FOR UPDATE
    `, [id, userId]);

    if (!borrow) {
      await conn.rollback();
      return res.redirect("/user/borrow/status?error=invalid_cancel");
    }

    const [result] = await conn.query(`
      UPDATE tb_t_borrowtransaction
      SET BorrowStatusID = 5
      WHERE BorrowID = ?
        AND BorrowStatusID = 1
    `, [id]);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.redirect("/user/borrow/status?error=invalid_cancel");
    }

    await conn.query(`
      UPDATE tb_t_deviceadd
      SET DVStatusID = 1
      WHERE DVID = ?
    `, [borrow.DVID]);

    await conn.commit();

    res.redirect("/user/history?success=cancel");

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.redirect("/user/borrow/status?error=server");
  } finally {
    conn.release();
  }
});

router.post("/borrow/acknowledge/:id", isLogin, checkActive, async (req, res) => {
  const { id } = req.params;
  const EMPID = req.session.user.EMPID;

  try {
    const [result] = await db.query(`
      UPDATE tb_t_borrowtransaction
      SET BorrowStatusID = 6
      WHERE BorrowID = ?
        AND EMPID = ?
        AND BorrowStatusID = 2
    `, [id, EMPID]);

    if (result.affectedRows === 0) {
      return res.redirect("/user/borrow_status?error=invalid_ack");
    }
    
    res.redirect("/user/borrowing?success=success");

  } catch (err) {
    console.error(err);
    res.redirect("/user/borrow_status?error=server");
  }
});

/* ===============================
   BORROWING (กำลังยืม)
================================ */
router.get("/borrowing", isLogin, checkActive, async (req, res) => {

  const EMPID = req.session.user.EMPID;

  const [rows] = await db.query(`
  SELECT
    bt.BorrowID,
    bt.BorrowCode,
    DATE_FORMAT(bt.BorrowDate, '%d/%m/%Y') AS BorrowDate,
    bt.DueDate,
    bt.BorrowStatusID,
    d.DeviceName,
    d.DeviceImage,
    b.BrandName,
    m.ModelName,
    c.CategoryName,
    s.StatusName
  FROM tb_t_borrowtransaction bt
  JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
  JOIN tb_t_device d ON da.DeviceID = d.DeviceID
  LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
  LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
  LEFT JOIN tb_m_category c ON d.CategoryID = c.CategoryID
  JOIN tb_m_borrowstatus s
    ON bt.BorrowStatusID = s.BorrowStatusID
  WHERE bt.EMPID = ?
    AND bt.BorrowStatusID IN (2,6)
    AND bt.ReturnDate IS NULL
  ORDER BY bt.BorrowDate DESC
`, [EMPID]);

  const today = new Date();
  today.setHours(0, 0, 0, 0); 
  rows.forEach(r => {

    const due = new Date(r.DueDate);
    due.setHours(0, 0, 0, 0); 

  const diffTime = due - today;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    r.statusText = `เกินกำหนด ${Math.abs(diffDays)} วัน`;
    r.statusClass = "status-danger";
  } else if (diffDays <= 2) {
    r.statusText = `ใกล้ครบกำหนด (เหลือ ${diffDays} วัน)`;
    r.statusClass = "status-warning";
  } else {
    r.statusText = "กำลังยืม";
    r.statusClass = "status-active";
  }

  r.DueDate = due.toLocaleDateString("th-TH-u-ca-gregory");
});


  res.render("user/layout", {
    title: "อุปกรณ์ที่กำลังยืม",
    page: "borrowing",
    user: req.session.user,
    rows,
    success: req.query.success ,
    active: "borrowing"
  });

});

router.get("/history", isLogin, checkActive, async (req, res) => {

  const EMPID = req.session.user.EMPID;

  const [rows] = await db.query(`
  SELECT
    bt.BorrowCode,
    DATE_FORMAT(bt.BorrowDate, '%d/%m/%Y') AS BorrowDate,
    DATE_FORMAT(bt.DueDate, '%d/%m/%Y') AS DueDate,
    DATE_FORMAT(bt.ReturnDate, '%d/%m/%Y') AS ReturnDate,
    bt.BorrowStatusID,

    COALESCE(d.DeviceName, t.TypeName) AS DeviceName,
    b.BrandName,
    m.ModelName,
    c.CategoryName,
    s.StatusName,

    -- แยก path รูปให้ถูกต้อง
    CASE
      WHEN d.DeviceImage IS NOT NULL THEN CONCAT('/uploads/device/', d.DeviceImage)
      WHEN t.TypeImage   IS NOT NULL THEN CONCAT('/uploads/type/', t.TypeImage)
      ELSE NULL
    END AS DeviceImagePath

  FROM tb_t_borrowtransaction bt
  LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
  LEFT JOIN tb_t_device d ON da.DeviceID = d.DeviceID
  LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
  LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
  LEFT JOIN tb_m_category c ON d.CategoryID = c.CategoryID
  LEFT JOIN tb_m_type t ON bt.TypeID = t.TypeID
  JOIN tb_m_borrowstatus s ON bt.BorrowStatusID = s.BorrowStatusID
  WHERE bt.EMPID = ?
    AND bt.BorrowStatusID IN (3,4,5)
  ORDER BY bt.BorrowDate DESC
`, [EMPID]);

  res.render("user/layout", {
    title: "ประวัติการยืม",
    page: "history",
    user: req.session.user,
    rows,
    success: req.query.success,
    active: "history"
  });

});

/* ===============================
   PROFILE
================================ */
router.get("/profile", isLogin, checkActive, async (req, res) => {
  const [[user]] = await db.query(`
    SELECT 
      e.*,
      r.RoleName,
      d.DepartmentName,
      i.InstitutionName
    FROM tb_t_employee e
    LEFT JOIN Roles r 
      ON e.RoleID = r.RoleID
    LEFT JOIN tb_m_department d 
      ON e.DepartmentID = d.DepartmentID
    LEFT JOIN tb_m_institution i 
      ON e.InstitutionID = i.InstitutionID
    WHERE e.EMPID = ?
  `, [req.session.user.EMPID]);

  res.render("user/layout", {
    title: "โปรไฟล์ของฉัน",
    page: "profile",
    user,
    success: req.query.success,
    active: "profile"
  });
});

router.get("/profile/edit", isLogin, checkActive, async (req, res) => {
  try {
    const empId = req.session.user.EMPID;

    const [[user]] = await db.query(`
      SELECT * FROM tb_t_employee WHERE EMPID = ?
    `, [empId]);

    const [departments] = await db.query(`
      SELECT * FROM tb_m_department
    `);

    const [institutions] = await db.query(`
      SELECT * FROM tb_m_institution
    `);

    res.render("user/layout", {
      title: "แก้ไขโปรไฟล์",
      page: "profile_edit",
      user,
      departments,
      institutions,
      active: "profile_edit"
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.post("/profile/edit",isLogin,checkActive,upload.single("profile"),
  async (req, res) => {
    try {
      const empId = req.session.user.EMPID;

      const {
        EMP_NUM,
        fname,
        lname,
        email,
        phone,
        fax,
        DepartmentID,
        InstitutionID
      } = req.body;

      let imageSql = "";
      let params = [
        EMP_NUM,
        fname,
        lname,
        email,
        phone,
        fax,
        DepartmentID,
        InstitutionID
      ];

      if (req.file) {
        imageSql = ", ProfileImage = ?";
        params.push(req.file.filename);
      }

      params.push(empId);

      await db.query(
        `
        UPDATE tb_t_employee
        SET
          EMP_NUM = ?,
          fname = ?,
          lname = ?,
          email = ?,
          phone = ?,
          fax = ?,
          DepartmentID = ?,
          InstitutionID = ?
          ${imageSql}
        WHERE EMPID = ?
        `,
        params
      );

      // อัปเดต session ถ้ามีรูปใหม่
      if (req.file) {
        req.session.user.ProfileImage = req.file.filename;
      }

      res.redirect("/user/profile?success=edit");

    } catch (err) {
      console.error(err);
      res.redirect("/user/profile?error=edit");
    }
  }
);

router.post("/toggle-2fa", isLogin, async (req, res) => {
  const userId = req.session.user.EMPID;
  const { enable } = req.body;

  try {
    await db.query(`
      UPDATE tb_t_employee 
      SET two_fa_enabled = ?, two_fa_dismissed = NULL
      WHERE EMPID = ?
    `, [enable ? 1 : 0, userId]);

    res.json({ 
      success: true,
      enabled: enable   
    });
  } catch (err) {
    console.error("2FA TOGGLE ERROR:", err);
    res.status(500).json({ success: false });
  }
});


router.post("/dismiss-2fa-banner", isLogin, async (req, res) => {
  try {
    const userId = req.session.user.EMPID;

    await db.query(
      `
      UPDATE tb_t_employee
      SET two_fa_dismissed = NOW()
      WHERE EMPID = ?
      `,
      [userId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("DISMISS 2FA ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/change_password", (req, res) => {
  res.render("user/layout", {
    title: "เปลี่ยนรหัสผ่าน",
    page: "change_password",
    active: "change_password",
    error: req.query.error || null,
    success: req.query.success || null,
    active: "change_password"
  });
});

router.post("/change_password", async (req, res) => {
  try {

    const { oldPassword, newPassword, confirmPassword } = req.body;

    // 1 confirm password
    if (newPassword !== confirmPassword) {
      return res.redirect("/user/change_password?error=notmatch");
    }

    // 2 password rule
    const passwordRule =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordRule.test(newPassword)) {
      return res.redirect("/user/change_password?error=passwordrule");
    }

    // 3 get password
    const [[user]] = await db.query(
      "SELECT password FROM tb_t_employee WHERE EMPID = ?",
      [req.session.user.EMPID]
    );

    const bcrypt = require("bcrypt");

    // 4 check old password
    const match = await bcrypt.compare(oldPassword, user.password);

    if (!match) {
      return res.redirect("/user/change_password?error=wrongold");
    }

    // 5 hash new password
    const hashed = await bcrypt.hash(newPassword, 10);

    await db.query(
      "UPDATE tb_t_employee SET password = ? WHERE EMPID = ?",
      [hashed, req.session.user.EMPID]
    );

    // 6 success
    return res.redirect("/user/profile?success=password");

  } catch (err) {
    console.error(err);
    return res.redirect("/user/change_password?error=server");
  }
});
/* ===============================
   EXPORT
================================ */

module.exports = router;