const express = require("express");
const router = express.Router();
const db = require("../config/db");
const ExcelJS = require("exceljs");
const { isLogin, check2FAWarning } = require("../middleware/auth");
const bcrypt = require("bcrypt");
const { sendEmail,emailApproved, emailRejected ,emailReturned  } = require('../config/mail');
const uploadProfile = require("../middleware/uploadProfile");
const uploadDevice = require("../middleware/uploadDevice");
const uploadAsset = require("../middleware/uploadAsset");
const controller = require("../controllers/admin.controller");
const multer = require('multer');
const path = require('path');


// multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/profile');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });



/* ===============================
   ADMIN MIDDLEWARE
================================ */
function isAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.RoleID !== 2)
    return res.status(403).send("⛔ Admin only");
  next();
}

// ============================
// 🔔 NOTIFICATION API
// ============================
router.get("/notifications", async (req, res) => {
  try {
    const empId = req.session.user?.EMPID;

    // ✅ ถ้าไม่มี session ให้ return เลย ไม่ต้อง query
    if (!empId) return res.json({ count: 0, items: [] });

    let readKeys = new Set();
    try {
      const [readRows] = await db.query(
        "SELECT NotiKey FROM tb_t_notificationread WHERE EMPID = ?",
        [empId]
      );
      readRows.forEach(r => readKeys.add(r.NotiKey));
    } catch (dbErr) {
      // ✅ ถ้า DB หลุด ให้ treat ทุกอันว่า read ไว้ก่อน ไม่แจ้งซ้ำ
      console.warn("readKeys query failed, treating all as read:", dbErr.message);
      return res.json({ count: 0, items: [] });
    }

    const notifications = [];

    // ---- 1. รออนุมัติ ----
    const [pending] = await db.query(`
      SELECT 
        bt.BorrowID, bt.BorrowCode,
        CONCAT(e.fname,' ',e.lname) AS name,
        DATE_FORMAT(bt.BorrowDate,'%d/%m/%Y %H:%i') AS BorrowDate,
        bt.BorrowDate AS rawTime
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      WHERE bt.BorrowStatusID = 1
      ORDER BY bt.BorrowDate DESC
      LIMIT 10
    `);
    pending.forEach(r => notifications.push({
      notiKey: `pending-${r.BorrowID}`,
      rawTime: new Date(r.rawTime),
      type: "pending", icon: "clock", color: "#f59e0b",
      title: "รออนุมัติ",
      desc: `${r.name} • ${r.BorrowCode}`,
      time: r.BorrowDate,
      url: "/admin/borrow?status=1"
    }));

    // ---- 2. เกินกำหนด ----
    const [overdue] = await db.query(`
      SELECT 
        bt.BorrowID, bt.BorrowCode,
        CONCAT(e.fname,' ',e.lname) AS name,
        DATEDIFF(CURDATE(), bt.DueDate) AS days,
        DATE_FORMAT(bt.DueDate,'%d/%m/%Y') AS DueDate,
        bt.DueDate AS rawTime
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      WHERE bt.BorrowStatusID = 6
        AND bt.ReturnDate IS NULL
        AND bt.DueDate < DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
        ORDER BY days DESC
      LIMIT 10
    `);
    overdue.forEach(r => notifications.push({
      notiKey: `overdue-${r.BorrowID}`,
      rawTime: new Date(r.rawTime),
      type: "overdue", icon: "triangle-exclamation", color: "#ef4444",
      title: `เกินกำหนด ${r.days} วัน`,
      desc: `${r.name} • ${r.BorrowCode}`,
      time: `ครบ ${r.DueDate}`,
      url: "/admin/borrow?status=6"
    }));

    // ---- 3. ใกล้ครบกำหนด ----
    const [nearDue] = await db.query(`
      SELECT 
        bt.BorrowID, bt.BorrowCode,
        CONCAT(e.fname,' ',e.lname) AS name,
        DATEDIFF(bt.DueDate, CURDATE()) AS remain,
        DATE_FORMAT(bt.DueDate,'%d/%m/%Y') AS DueDate,
        bt.BorrowDate AS rawTime      
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      WHERE bt.BorrowStatusID = 6
        AND bt.ReturnDate IS NULL
        AND DATEDIFF(bt.DueDate, DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))) BETWEEN 0 AND 3
      ORDER BY bt.BorrowDate DESC
      LIMIT 10
    `);
    nearDue.forEach(r => notifications.push({
      notiKey: `neardue-${r.BorrowID}`,
      rawTime: new Date(r.rawTime),
      icon: "bell", color: "#f97316",
      title: `ใกล้ครบกำหนด ${r.remain} วัน`,
      desc: `${r.name} • ${r.BorrowCode}`,
      time: `ครบ ${r.DueDate}`,
      url: "/admin/borrow?status=6"
    }));

    // ---- 4. ปฏิเสธล่าสุด ----
    const [recentRejected] = await db.query(`
      SELECT
        bt.BorrowID, bt.BorrowCode,
        CONCAT(e.fname,' ',e.lname) AS borrowerName,
        CONCAT(ea.fname,' ',ea.lname) AS rejectedBy,
        DATE_FORMAT(bt.ApproveDate,'%d/%m/%Y %H:%i') AS RejectDate,
        bt.ApproveDate AS rawTime,
        COALESCE(d.DeviceName, t.TypeName) AS DeviceName
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      LEFT JOIN tb_t_employee ea ON bt.ApproveBy = ea.EMPID
      LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      LEFT JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      LEFT JOIN tb_m_type t ON bt.TypeID = t.TypeID
      WHERE bt.BorrowStatusID = 3
        AND bt.ApproveDate >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY bt.ApproveDate DESC
      LIMIT 5
    `);
    recentRejected.forEach(r => notifications.push({
      notiKey: `rejected-${r.BorrowID}`,
      rawTime: new Date(r.rawTime),
      type: "rejected", icon: "xmark", color: "#ef4444",
      title: `ปฏิเสธแล้ว`,
      desc: `${r.borrowerName} • ${r.BorrowCode}${r.rejectedBy ? ' — โดย ' + r.rejectedBy : ''}`,
      time: r.RejectDate,
      url: "/admin/borrow?status=3"
    }));

    notifications.sort((a, b) => b.rawTime - a.rawTime);

    // ✅ ใช้ readKeys ที่ดึงมาตั้งแต่ต้น ไม่ดึงซ้ำ
    const items = notifications.map(n => ({
      ...n,
      rawTime: undefined,
      isRead: readKeys.has(n.notiKey)
    }));

    const unreadCount = items.filter(i => !i.isRead).length;
    res.json({ count: unreadCount, items });

  } catch (err) {
    console.error("NOTI ERROR:", err);
    res.json({ count: 0, items: [] });
  }
});


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
   DASHBOARD
================================ */
router.use(isAdmin, check2FAWarning);

router.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

router.get("/", isAdmin, async (req, res) => {

  const [[deviceTotal]] = await db.query(`
  SELECT COUNT(*) total 
  FROM tb_t_deviceadd
`);

  const [[availableDevice]] = await db.query(`
    SELECT COUNT(*) total
    FROM tb_t_deviceadd
    WHERE DVStatusID = 1
  `);
  
  const [[deviceStatus]] = await db.query(`
    SELECT
      SUM(CASE WHEN DVStatusID = 1 THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN DVStatusID = 2 THEN 1 ELSE 0 END) AS borrowed,
      SUM(CASE WHEN DVStatusID = 3 THEN 1 ELSE 0 END) AS repair
    FROM tb_t_deviceadd
  `);
  
  const total =
  deviceStatus.available +
  deviceStatus.borrowed +
  deviceStatus.repair;

  const devicePercent = total === 0
    ? { a: 0, b: 0, c: 0 }
    : {
        a: Math.round((deviceStatus.available / total) * 100),
        b: Math.round((deviceStatus.borrowed / total) * 100),
        c: Math.round((deviceStatus.repair / total) * 100),
      };

  const [[pending]] = await db.query(`
    SELECT COUNT(*) total FROM tb_t_borrowtransaction WHERE BorrowStatusID = 1
  `);

  const [[approved]] = await db.query(`
    SELECT COUNT(*) total FROM tb_t_borrowtransaction WHERE BorrowStatusID IN (2,6)
  `);

  const [[rejected]] = await db.query(`
    SELECT COUNT(*) total FROM tb_t_borrowtransaction WHERE BorrowStatusID = 3
  `);

  const [[returned]] = await db.query(`
    SELECT COUNT(*) total FROM tb_t_borrowtransaction WHERE BorrowStatusID = 4
  `);

  const [[overdue]] = await db.query(`
    SELECT COUNT(*) total
    FROM tb_t_borrowtransaction
    WHERE BorrowStatusID = 6
      AND ReturnDate IS NULL
      AND DueDate < DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
  `);


  const [[employeeTotal]] = await db.query(`
    SELECT COUNT(*) total FROM tb_t_employee
  `);

  const [nearDueList] = await db.query(`
  SELECT
    bt.BorrowCode,
    bt.DueDate,
    DATEDIFF(bt.DueDate, DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))) AS remain_day,
    e.fname,
    e.lname,
    COALESCE(da.ITCode, t.TypeName, '-') AS ITCode,
    COALESCE(da.AssetTag, '-') AS AssetTag,
    COALESCE(m.ModelName, '-') AS ModelName
  FROM tb_t_borrowtransaction bt
  JOIN tb_t_employee e ON bt.EMPID = e.EMPID
  LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
  LEFT JOIN tb_t_device d ON da.DeviceID = d.DeviceID
  LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
  LEFT JOIN tb_m_type t ON bt.TypeID = t.TypeID
  WHERE bt.BorrowStatusID = 6
    AND bt.ReturnDate IS NULL
    AND DATEDIFF(bt.DueDate, DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))) BETWEEN -30 AND 3
  ORDER BY remain_day ASC
`);

  res.render("admin/layout", {
    page: "admin",
    active: "dashboard",
    deviceTotal,
    availableDevice,
    pending,
    approved,
    rejected,
    returned,
    overdue,
    employeeTotal,
    nearDueList,
    deviceStatus,
    devicePercent
  });
});


router.get("/dashboard-data", async (req, res) => {
  try {
    const [[borrowStatus]] = await db.query(`
      SELECT
        SUM(CASE WHEN BorrowStatusID IN (2,6) AND NOT (BorrowStatusID = 6 AND ReturnDate IS NULL AND DueDate < DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))) THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN BorrowStatusID = 1 THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN BorrowStatusID = 3 THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN BorrowStatusID = 4 THEN 1 ELSE 0 END) AS returned,
        SUM(CASE WHEN BorrowStatusID = 6 AND ReturnDate IS NULL AND DueDate < DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00')) THEN 1 ELSE 0 END) AS overdue
      FROM tb_t_borrowtransaction
    `);

    const [[deviceStatus]] = await db.query(`
      SELECT
        SUM(CASE WHEN DVStatusID = 1 THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN DVStatusID = 2 THEN 1 ELSE 0 END) AS borrowed,
        SUM(CASE WHEN DVStatusID = 3 THEN 1 ELSE 0 END) AS repair
      FROM tb_t_deviceadd
    `);

    res.json({
      approved: borrowStatus.approved || 0,
      pending:  borrowStatus.pending  || 0,
      rejected: borrowStatus.rejected || 0,
      returned: borrowStatus.returned || 0,
      overdue:  borrowStatus.overdue  || 0,
      deviceStatus
    });

  } catch (err) {
    console.error("DASHBOARD API ERROR:", err);
    res.status(500).json({ error: "dashboard error" });
  }
});


// ── NEW: dashboard monthly borrow trend (12 เดือนย้อนหลัง) ──
router.get("/dashboard/monthly", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        DATE_FORMAT(BorrowDate, '%Y-%m') AS month,
        COUNT(*) AS total,
        SUM(CASE WHEN BorrowStatusID IN (2,6,4) THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN BorrowStatusID = 3 THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN BorrowStatusID = 4 THEN 1 ELSE 0 END) AS returned
      FROM tb_t_borrowtransaction
      WHERE BorrowDate >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(BorrowDate, '%Y-%m')
      ORDER BY month ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("MONTHLY API ERROR:", err);
    res.status(500).json({ error: "monthly error" });
  }
});

// ── NEW: top borrowed device types ──
router.get("/dashboard/top-devices", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        COALESCE(d.DeviceName, t.TypeName) AS name,
        COUNT(*) AS count,
        COALESCE(d.DeviceImage, t.TypeImage) AS image,
        CASE WHEN d.DeviceImage IS NOT NULL THEN 'device'
             WHEN t.TypeImage IS NOT NULL THEN 'type'
             ELSE NULL END AS imageFolder
      FROM tb_t_borrowtransaction bt
      LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      LEFT JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      LEFT JOIN tb_m_type t ON bt.TypeID = t.TypeID
      WHERE bt.BorrowStatusID IN (2,6,4,3)
        AND COALESCE(d.DeviceName, t.TypeName) IS NOT NULL
      GROUP BY COALESCE(d.DeviceName, t.TypeName), d.DeviceImage, t.TypeImage
      ORDER BY count DESC
      LIMIT 5
    `);
    res.json(rows);
  } catch (err) {
    console.error("TOP DEVICES API ERROR:", err);
    res.status(500).json({ error: "top devices error" });
  }
});

// ── NEW: top borrowers ──
router.get("/dashboard/top-borrowers", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        e.fname, e.lname, e.EMP_NUM,
        COUNT(*) AS total,
        SUM(CASE WHEN bt.BorrowStatusID = 6 AND bt.ReturnDate IS NULL AND bt.DueDate < CURDATE() THEN 1 ELSE 0 END) AS overdue
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      GROUP BY bt.EMPID, e.fname, e.lname, e.EMP_NUM
      ORDER BY total DESC
      LIMIT 5
    `);
    res.json(rows);
  } catch (err) {
    console.error("TOP BORROWERS API ERROR:", err);
    res.status(500).json({ error: "top borrowers error" });
  }
});

// ── NEW: recent activity feed ──
router.get("/dashboard/activity", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        bt.BorrowCode,
        bt.BorrowStatusID,
        bt.BorrowDate,
        bt.ApproveDate,
        bt.ReturnDate,
        CONCAT(e.fname,' ',e.lname) AS borrowerName,
        COALESCE(d.DeviceName, t.TypeName) AS deviceName,
        CONCAT(a.fname,' ',a.lname) AS actionBy,
        CASE
          WHEN bt.ReturnDate IS NOT NULL THEN bt.ReturnDate
          WHEN bt.ApproveDate IS NOT NULL THEN bt.ApproveDate
          ELSE bt.BorrowDate
        END AS latestTime
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      LEFT JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      LEFT JOIN tb_m_type t ON bt.TypeID = t.TypeID
      LEFT JOIN tb_t_employee a ON bt.ApproveBy = a.EMPID
      ORDER BY latestTime DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (err) {
    console.error("ACTIVITY API ERROR:", err);
    res.status(500).json({ error: "activity error" });
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

router.get("/employee", isAdmin, async (req, res) => {
  try {

    const [employees] = await db.query(`
      SELECT 
        e.EMPID,
        e.EMP_NUM,
        e.fname,
        e.lname,
        e.username,
        e.email,
        e.phone,
        e.fax,
        e.CreateDate,
        e.RoleID,
        e.IsActive,
        e.InstitutionID,
        e.DepartmentID,

        r.RoleName,
        i.InstitutionName,
        d.DepartmentName,

        IFNULL(ab.activeBorrow, 0) AS activeBorrow,
        IFNULL(tb.totalBorrow, 0) AS totalBorrow,
        IFNULL(lb.lateCount, 0) AS lateCount

      FROM tb_t_employee e

      LEFT JOIN roles r 
        ON e.RoleID = r.RoleID

      LEFT JOIN tb_m_institution i 
        ON e.InstitutionID = i.InstitutionID

      LEFT JOIN tb_m_department d 
        ON e.DepartmentID = d.DepartmentID

      -- 🔹 กำลังยืม
      LEFT JOIN (
        SELECT EMPID, COUNT(*) AS activeBorrow
        FROM tb_t_borrowtransaction
        WHERE BorrowStatusID IN (1,2,6)
        GROUP BY EMPID
      ) ab 
        ON e.EMPID = ab.EMPID

      -- 🔹 ยืมทั้งหมด
      LEFT JOIN (
        SELECT EMPID, COUNT(*) AS totalBorrow
        FROM tb_t_borrowtransaction
        GROUP BY EMPID
      ) tb 
        ON e.EMPID = tb.EMPID

      -- 🔹 คืนเกินกำหนด
      LEFT JOIN (
        SELECT EMPID, COUNT(*) AS lateCount
        FROM tb_t_borrowtransaction
        WHERE ReturnDate IS NOT NULL
          AND DATE(ReturnDate) > DATE(DueDate)
        GROUP BY EMPID
      ) lb 
        ON e.EMPID = lb.EMPID

      ORDER BY e.EMPID DESC
    `);


    const [departments] = await db.query(`
      SELECT DepartmentID, DepartmentName
      FROM tb_m_department
      ORDER BY DepartmentName ASC
    `);


    const [institutions] = await db.query(`
      SELECT InstitutionID, InstitutionName
      FROM tb_m_institution
      ORDER BY InstitutionName ASC
    `);


    res.render("admin/layout", {
      page: "employee",
      active: "employee",
      employees,
      departments,
      institutions
    });

  } catch (err) {

    console.error("EMPLOYEE PAGE ERROR:", err);
    res.status(500).send(err.message);

  }
});

router.get("/employee/detail/:id", isAdmin, async (req, res) => {
  try {

    const { id } = req.params;

    const [rows] = await db.query(`
      SELECT 
        e.*,
        r.RoleName,
        d.DepartmentName,
        i.InstitutionName
      FROM tb_t_employee e

      LEFT JOIN roles r 
        ON e.RoleID = r.RoleID

      LEFT JOIN tb_m_department d 
        ON e.DepartmentID = d.DepartmentID

      LEFT JOIN tb_m_institution i
        ON e.InstitutionID = i.InstitutionID

      WHERE e.EMPID = ?
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({
        error: "ไม่พบพนักงาน"
      });
    }

    res.json(rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "Server error"
    });

  }
});


router.put("/employee/toggle/:id", isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const currentAdminId = req.session.user.EMPID;

    // ❌ ห้าม admin ปิดตัวเอง
    if (parseInt(id) === currentAdminId) {
      return res.status(400).json({
        success: false,
        message: "คุณไม่สามารถปิดบัญชีของตัวเองได้"
      });
    }

    // 🔎 ดึงข้อมูล user เป้าหมาย
    const [[user]] = await db.query(
      "SELECT RoleID, IsActive FROM tb_t_employee WHERE EMPID=?",
      [id]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบผู้ใช้งาน"
      });
    }

    // ❌ ถ้าเป็น admin → เช็คว่าเป็น admin คนสุดท้ายไหม
    if (user.RoleID === 2 && user.IsActive === 1) {

      const [[adminCount]] = await db.query(`
        SELECT COUNT(*) total
        FROM tb_t_employee
        WHERE RoleID = 2 AND IsActive = 1
      `);

      if (adminCount.total <= 1) {
        return res.status(400).json({
          success: false,
          message: "ไม่สามารถปิด Admin คนสุดท้ายได้"
        });
      }
    }

    // 🔄 toggle status
    const newStatus = user.IsActive ? 0 : 1;

    await db.query(`
      UPDATE tb_t_employee
      SET IsActive=?
      WHERE EMPID=?
    `, [newStatus, id]);

    res.json({
      success: true,
      message: newStatus
        ? "เปิดใช้งานบัญชีสำเร็จ"
        : "ปิดใช้งานบัญชีสำเร็จ",
      IsActive: newStatus
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในระบบ"
    });

  }
});

router.put("/employee/update/:id", isAdmin, uploadProfile.single("profileImage"),
  async (req, res) => {

    try {

      const { id } = req.params;

      const {
        fname,
        lname,
        email,
        phone,
        fax,
        EMP_NUM,
        DepartmentID,
        InstitutionID,
        RoleID,
        IsActive
      } = req.body;

      let profileImage = null;

      if (req.file) {
        profileImage = req.file.filename;
      }

      const [oldData] = await db.query(
        "SELECT * FROM tb_t_employee WHERE EMPID=?",
        [id]
      );

      if (!oldData.length) {
        return res.status(404).json({
          error: "ไม่พบพนักงาน"
        });
      }
      // ❌ ห้าม admin ปิดตัวเองผ่าน edit form
      if (parseInt(id) === req.session.user.EMPID && parseInt(IsActive) === 0) {
        return res.status(400).json({
          success: false,
          message: "ไม่สามารถปิดบัญชีตัวเองได้"
        });
      }
            // ❌ ห้าม downgrade ตัวเองจาก admin → user
      if (parseInt(id) === req.session.user.EMPID && parseInt(RoleID) !== 2) {
        return res.status(400).json({
          success: false,
          message: "ไม่สามารถเปลี่ยนสิทธิ์ตัวเองได้"
        });
      }
      await db.query(`
        UPDATE tb_t_employee
        SET
          fname=?,
          lname=?,
          email=?,
          phone=?,
          fax=?,
          EMP_NUM=?, 
          DepartmentID=?,
          InstitutionID=?,
          RoleID=?,
          IsActive=?,
          ProfileImage=COALESCE(?, ProfileImage)
        WHERE EMPID=?
      `, [
        fname,
        lname,
        email,
        phone,
        fax,
        EMP_NUM,
        DepartmentID,
        InstitutionID,
        RoleID,
        IsActive,
        profileImage,
        id
      ]);

      if (parseInt(id) === req.session.user.EMPID) {

        const [rows] = await db.query(
          "SELECT * FROM tb_t_employee WHERE EMPID=?",
          [id]
        );

        if (rows.length) {
          req.session.user = rows[0];
        }

      }

      res.json({
        success: true
      });

    } catch (err) {

      console.error("UPDATE EMPLOYEE ERROR:", err);

      res.status(500).json({
        error: err.message
      });

    }

});
router.get("/borrow/available/:borrowId", async (req, res) => {
  const { borrowId } = req.params;

  // ดึง TypeID จาก borrow โดยตรง
  const [[borrow]] = await db.query(`
    SELECT TypeID
    FROM tb_t_borrowtransaction
    WHERE BorrowID = ?
  `, [borrowId]);

  if (!borrow) return res.json([]);

  // ดึงเครื่องที่พร้อมใช้งานใน Type เดียวกัน
  const [devices] = await db.query(`
    SELECT
      da.DVID,
      da.ITCode,
      da.AssetTag,
      da.SerialNumber,
      d.DeviceName,
      b.BrandName,
      m.ModelName
    FROM tb_t_deviceadd da
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
    LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
    WHERE d.TypeID = ?
      AND da.DVStatusID = 1
    ORDER BY da.ITCode ASC
  `, [borrow.TypeID]);

  res.json(devices);
});

/* ===============================
   PROFILE
================================ */
router.get("/profile", async (req, res) => {

  const [[user]] = await db.query(`
    SELECT 
      e.*,
      r.RoleName,
      d.DepartmentName,
      i.InstitutionName
    FROM tb_t_employee e
    LEFT JOIN roles r
      ON e.RoleID = r.RoleID
    LEFT JOIN tb_m_department d 
      ON e.DepartmentID = d.DepartmentID
    LEFT JOIN tb_m_institution i 
      ON e.InstitutionID = i.InstitutionID
    WHERE e.EMPID = ?
  `, [req.session.user.EMPID]);

  res.render("admin/layout", {
    page: "profile",
    active: "profile",
    user
  });
});


router.get("/profile/edit", async (req, res) => {
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

    res.render("admin/layout", {
      page: "profile_edit",
      active: "profile",
      user,
      departments,
      institutions
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});


router.post(
  "/profile/edit",
  uploadProfile.single("profile"),
  async (req, res) => {
    try {
      const empId = req.session.user.EMPID;
      const { fname, lname, email, phone, fax, DepartmentID, InstitutionID } = req.body;

      let imageSql = "";
      let params = [fname, lname, email, phone, fax, DepartmentID, InstitutionID];

      if (req.file) {
        imageSql = ", ProfileImage = ?";
        params.push(req.file.filename);
      }

      params.push(empId);

      await db.query(`
        UPDATE tb_t_employee
        SET
          fname = ?,
          lname = ?,
          email = ?,
          phone = ?,
          fax = ?,
          DepartmentID = ?,
          InstitutionID = ?
          ${imageSql}
        WHERE EMPID = ?
        `, params);

    // ✅ ถ้ามีอัปโหลดรูป → อัปเดต session
    if (req.file) {
      req.session.user.ProfileImage = req.file.filename;
    }

    res.redirect("/admin/profile?success=edit");

    } catch (err) {
      console.error(err);
      res.redirect("/admin/profile?error=edit");
    }
  }
);

router.post("/toggle-2fa", isLogin, async (req, res) => {
  const userId = req.session.user.EMPID;
  const { enable } = req.body;

  try {
    await db.query(`
      UPDATE tb_t_employee 
      SET two_fa_enabled = ?
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

router.get("/change_password", (req, res) => {
  res.render("admin/layout", {
    page: "change_password",
    active: "change_password",
    error: req.query.error || null,
    success: req.query.success || null
  });
});

router.post("/change_password", async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    // 1 ตรวจ confirm password
    if (newPassword !== confirmPassword) {
      return res.redirect("/admin/change_password?error=notmatch");
    }

    // 2 Password Policy
    const passwordRule =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordRule.test(newPassword)) {
      return res.redirect("/admin/change_password?error=passwordrule");
    }

    // 3 ดึง password เดิม
    const [[user]] = await db.query(
      "SELECT password FROM tb_t_employee WHERE EMPID = ?",
      [req.session.user.EMPID]
    );

    const bcrypt = require("bcrypt");

    // 4 ตรวจรหัสเดิม
    const match = await bcrypt.compare(oldPassword, user.password);

    if (!match) {
      return res.redirect("/admin/change_password?error=wrongold");
    }

    // 5 hash password ใหม่
    const hashed = await bcrypt.hash(newPassword, 10);

    await db.query(
      "UPDATE tb_t_employee SET password = ? WHERE EMPID = ?",
      [hashed, req.session.user.EMPID]
    );

    // 6 success modal
    res.redirect("/admin/profile?success=password");

  } catch (err) {
    console.error(err);
    return res.redirect("/admin/change_password?error=passwordrule");
  }
});

/* ===============================
   DEVICE MODEL
================================ */
router.get("/device", async (req, res) => {

    const [models] = await db.query(`
    SELECT
      d.DeviceID, 
      m.ModelID,
      m.ModelName,
      d.DeviceName,
      d.DeviceImage,
      c.CategoryName,
      b.BrandName,
      t.TypeName,
      COUNT(da.DVID) AS TotalQty,
      SUM(CASE WHEN da.DVStatusID = 1 THEN 1 ELSE 0 END) AS AvailableQty,
      SUM(CASE WHEN da.DVStatusID = 2 THEN 1 ELSE 0 END) AS BorrowQty,
      SUM(CASE WHEN da.DVStatusID = 3 THEN 1 ELSE 0 END) AS RepairQty,
      SUM(CASE WHEN da.DVStatusID = 4 THEN 1 ELSE 0 END) AS DisabledQty
    FROM tb_t_device d
    JOIN tb_m_model m ON d.ModelID = m.ModelID
    LEFT JOIN tb_m_category c ON d.CategoryID = c.CategoryID
    LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
    LEFT JOIN tb_m_type t ON d.TypeID = t.TypeID
    LEFT JOIN tb_t_deviceadd da ON d.DeviceID = da.DeviceID
    GROUP BY d.DeviceID, m.ModelID, m.ModelName, d.DeviceName, d.DeviceImage, c.CategoryName, b.BrandName, t.TypeName
  `);

  const [types] = await db.query(`
    SELECT TypeID, TypeName, TypeImage
    FROM tb_m_type
    ORDER BY TypeName ASC
  `);

  const [brands] = await db.query("SELECT * FROM tb_m_brand ORDER BY BrandName");
      const [categories] = await db.query("SELECT * FROM tb_m_category ORDER BY CategoryName");
      const [allModels] = await db.query(`
      SELECT m.*, b.BrandName 
      FROM tb_m_model m 
      JOIN tb_m_brand b ON m.BrandID = b.BrandID 
      ORDER BY m.ModelName
    `);

    res.render("admin/layout", {
      page: "device",
      active: "device",
      models,
      types,
      brands,
      categories,
      allModels,
      success: req.query.success || null,
      error: req.query.error || null
    });
  });
// ============================
// ลบรุ่นอุปกรณ์ (MODEL)
// ============================
router.get("/device/model/delete/:id", async (req, res) => {
  const modelId = req.params.id;

  // 🔹 เช็กว่ามีเครื่องถูกเพิ่มแล้วหรือไม่
  const [[used]] = await db.query(`
    SELECT 1
    FROM tb_t_device d
    JOIN tb_t_deviceadd da ON d.DeviceID = da.DeviceID
    WHERE d.ModelID = ?
    LIMIT 1
  `, [modelId]);

  // ❌ ถ้ามีเครื่อง → ห้ามลบ
  if (used) {
    return res.redirect("/admin/device?error=used");
  }

  // 🔥 ลบได้
  await db.query(
    "DELETE FROM tb_t_device WHERE ModelID = ?",
    [modelId]
  );

  res.redirect("/admin/device?success=delete");
});


// ============================
// เพิ่มรุ่นอุปกรณ์ (MODEL)
// ============================
router.get("/device/add", async (req, res) => {

  const [models] = await db.query(`
    SELECT ModelID, ModelName
    FROM tb_m_model
  `);

  const [categories] = await db.query("SELECT * FROM tb_m_category");
  const [brands] = await db.query("SELECT * FROM tb_m_brand");
  const [types] = await db.query("SELECT * FROM tb_m_type");

  res.render("admin/layout", {
    page: "device_add",
    active: "device",
    models,
    categories,
    brands,
    types
  });
});


router.post(
  "/device/add",
  uploadDevice.single("DeviceImage"),
  async (req, res) => {

    const {
      DeviceName,
      ModelID,
      CategoryID,
      BrandID,
      TypeID,
      Description
    } = req.body;

    await db.query(`
      INSERT INTO tb_t_device
      (DeviceName, ModelID, CategoryID, BrandID, TypeID, Description, DeviceImage, CreateDate)
      VALUES (?,?,?,?,?,?,?,NOW())
    `,[
      DeviceName,
      ModelID,
      CategoryID,
      BrandID,
      TypeID,
      Description,
      req.file?.filename || null,
    ]);

    res.redirect("/admin/device?success=add");
});

router.get("/device/models/:brandId", async (req, res) => {
  const brandId = req.params.brandId;

  const [models] = await db.query(`
    SELECT ModelID, ModelName
    FROM tb_m_model
    WHERE BrandID = ?
  `,[brandId]);

  res.json(models);
});
// หน้าแก้ไข (GET)
router.get("/device/edit/:id", async (req, res) => {
  const id = req.params.id;

  const [[device]] = await db.query(`
    SELECT d.*, m.ModelName
    FROM tb_t_device d
    LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
    WHERE d.DeviceID = ?
  `, [id]);

  const [models] = await db.query(`
    SELECT ModelID, ModelName
    FROM tb_m_model
  `);

  const [categories] = await db.query("SELECT * FROM tb_m_category");
  const [brands] = await db.query("SELECT * FROM tb_m_brand");
  const [types] = await db.query("SELECT * FROM tb_m_type");

  res.render("admin/layout", {
    page: "device_edit",
    active: "device",
    device,
    models,      
    categories,
    brands,
    types
  });
});


router.post(
  "/device/edit/:id",
  uploadDevice.single("DeviceImage"),
  async (req, res) => {
    try {
      const id = req.params.id;
      const {
        DeviceName,
        ModelID,
        CategoryID,
        BrandID,
        TypeID,
        Description
      } = req.body;

      // 1) ดึงรูปเดิมมาก่อน
      const [rows] = await db.query(
        "SELECT DeviceImage FROM tb_t_device WHERE DeviceID = ?",
        [id]
      );

      if (rows.length === 0) {
        return res.redirect("/admin/device");
      }

      const oldImage = rows[0].DeviceImage;

      // 2) ถ้ามีอัปโหลดรูปใหม่ ใช้รูปใหม่ ไม่งั้นใช้รูปเดิม
      let imageName = oldImage;
      if (req.file) {
        imageName = req.file.filename;
      }

      // 3) UPDATE ข้อมูลทั้งหมด
      await db.query(
        `
        UPDATE tb_t_device
        SET
          DeviceName = ?,
          ModelID = ?,
          CategoryID = ?,
          BrandID = ?,
          TypeID = ?,
          Description = ?,
          DeviceImage = ?,
          UpdatedDate = NOW()
        WHERE DeviceID = ?
        `,
        [
          DeviceName,
          ModelID,
          CategoryID,
          BrandID,
          TypeID,
          Description,
          imageName,
          id
        ]
      );

      // 4) กลับหน้า list
      res.redirect("/admin/device?success=edit");

    } catch (err) {
      console.error(err);
      res.redirect("/admin/device");
    }
  }
);

// ============================
// ลบเครื่องอุปกรณ์ (DELETE)
// ============================
router.get("/device/item/:id/delete", async (req, res) => {
  const id = req.params.id;

  // 🔹 หา ModelID (ไว้ redirect)
  const [[row]] = await db.query(`
    SELECT d.ModelID
    FROM tb_t_deviceadd da
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    WHERE da.DVID = ?
  `, [id]);

  if (!row) {
    return res.redirect("/admin/device");
  }

  // ❗ เช็กว่ากำลังถูกยืมอยู่หรือไม่
  const [[borrowed]] = await db.query(`
    SELECT 1
    FROM tb_t_borrowtransaction
    WHERE DVID = ?
      AND ReturnDate IS NULL
  `, [id]);

  // 🚫 ถ้ากำลังถูกยืม → ห้ามลบ
  if (borrowed) {
    return res.redirect(`/admin/device/${row.ModelID}?error=borrowed`);
  }

  // 🔥 ลบได้
  await db.query(
    "DELETE FROM tb_t_deviceadd WHERE DVID = ?",
    [id]
  );

  res.redirect(`/admin/device/${row.ModelID}?success=delete`);
});


// ============================
// CATEGORY CRUD
// ============================
router.get("/api/categories", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM tb_m_category ORDER BY CategoryName");
  res.json(rows);
});

router.post("/category/add", async (req, res) => {
  const { CategoryID, CategoryName } = req.body;
  if (CategoryID) {
    await db.query("UPDATE tb_m_category SET CategoryName=? WHERE CategoryID=?", [CategoryName, CategoryID]);
  } else {
    await db.query("INSERT INTO tb_m_category (CategoryName) VALUES (?)", [CategoryName]);
  }
  res.redirect("/admin/device?success=add");
});

router.get("/category/delete/:id", async (req, res) => {
  const { id } = req.params;
  const [[used]] = await db.query("SELECT 1 FROM tb_t_device WHERE CategoryID=? LIMIT 1", [id]);
  if (used) return res.redirect("/admin/device?error=used");
  await db.query("DELETE FROM tb_m_category WHERE CategoryID=?", [id]);
  res.redirect("/admin/device?success=delete");
});

// ============================
// BRAND CRUD
// ============================
router.post("/brand/add", async (req, res) => {
  const { BrandID, BrandName } = req.body;
  if (BrandID) {
    await db.query("UPDATE tb_m_brand SET BrandName=? WHERE BrandID=?", [BrandName, BrandID]);
  } else {
    await db.query("INSERT INTO tb_m_brand (BrandName) VALUES (?)", [BrandName]);
  }
  res.redirect("/admin/device?success=add");
});

router.get("/brand/delete/:id", async (req, res) => {
  const { id } = req.params;
  const [[used]] = await db.query("SELECT 1 FROM tb_m_model WHERE BrandID=? LIMIT 1", [id]);
  if (used) return res.redirect("/admin/device?error=used");
  await db.query("DELETE FROM tb_m_brand WHERE BrandID=?", [id]);
  res.redirect("/admin/device?success=delete");
});

// ============================
// MODEL CRUD
// ============================
router.post("/model/add", async (req, res) => {
  const { ModelID, ModelName, BrandID } = req.body;
  if (ModelID) {
    await db.query("UPDATE tb_m_model SET ModelName=?, BrandID=? WHERE ModelID=?", [ModelName, BrandID, ModelID]);
  } else {
    await db.query("INSERT INTO tb_m_model (ModelName, BrandID) VALUES (?,?)", [ModelName, BrandID]);
  }
  res.redirect("/admin/device?success=add");
});

router.get("/model/delete/:id", async (req, res) => {
  const { id } = req.params;
  const [[used]] = await db.query("SELECT 1 FROM tb_t_device WHERE ModelID=? LIMIT 1", [id]);
  if (used) return res.redirect("/admin/device?error=used");
  await db.query("DELETE FROM tb_m_model WHERE ModelID=?", [id]);
  res.redirect("/admin/device?success=delete");
});


// ============================
// HELPER
// ============================
function normalize(val) {
  if (!val || val.trim() === "-") return null;
  return val.trim();
}
/* ===============================
   DEVICE EXPORT EXCEL
================================ */
router.get("/device/export/excel", isAdmin, async (req, res) => {
  try {
    const { type, brand, status } = req.query;

    let where = [];
    let params = [];

    if (type) {
      where.push("t.TypeID = ?");
      params.push(type);
    }

    if (brand) {
      where.push("b.BrandID = ?");
      params.push(brand);
    }

    if (status) {
      where.push("da.DVStatusID = ?");
      params.push(status);
    }

    const whereSQL = where.length ? "WHERE " + where.join(" AND ") : "";

    const [rows] = await db.query(`
      SELECT
        da.ITCode,
        da.AssetTag,
        da.SerialNumber,
        d.DeviceName,
        b.BrandName,
        m.ModelName,
        c.CategoryName,
        t.TypeName,
        s.StatusName,
        DATE_FORMAT(da.CreatedDate, '%d/%m/%Y %H:%i') AS CreatedDate,
        DATE_FORMAT(da.UpdatedDate, '%d/%m/%Y %H:%i') AS UpdatedDate,
        e.username AS CreatedBy
      FROM tb_t_deviceadd da
      JOIN tb_t_device d   ON da.DeviceID  = d.DeviceID
      LEFT JOIN tb_m_brand b    ON d.BrandID    = b.BrandID
      LEFT JOIN tb_m_model m    ON d.ModelID    = m.ModelID
      LEFT JOIN tb_m_category c ON d.CategoryID = c.CategoryID
      LEFT JOIN tb_m_type t     ON d.TypeID     = t.TypeID
      JOIN tb_m_devicestatus s  ON da.DVStatusID = s.DVStatusID
      LEFT JOIN tb_t_employee e ON da.CreatedBy  = e.EMPID
      ${whereSQL}
      ORDER BY t.TypeName, d.DeviceName, da.ITCode
    `, params);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("คลังอุปกรณ์");

    // ---- Header style ----
    const headerFill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: "FF1E3A5F" }
    };
    const headerFont  = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    const centerAlign = { horizontal: "center", vertical: "middle" };
    const borderStyle = {
      top:    { style: "thin", color: { argb: "FFCCCCCC" } },
      left:   { style: "thin", color: { argb: "FFCCCCCC" } },
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      right:  { style: "thin", color: { argb: "FFCCCCCC" } }
    };

    // ---- Title row ----
    sheet.mergeCells("A1:L1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "รายงานคลังอุปกรณ์";
    titleCell.font  = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
    titleCell.alignment = centerAlign;
    sheet.getRow(1).height = 28;

    // ---- Sub-title (filter info) ----
    sheet.mergeCells("A2:L2");
    const now = new Date();
    const exportDate = `${now.getDate().toString().padStart(2,"0")}/${(now.getMonth()+1).toString().padStart(2,"0")}/${now.getFullYear()}  ${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;
    sheet.getCell("A2").value = `ส่งออกเมื่อ: ${exportDate}  |  จำนวนทั้งหมด: ${rows.length} รายการ`;
    sheet.getCell("A2").font  = { italic: true, size: 10, color: { argb: "FF666666" } };
    sheet.getCell("A2").alignment = centerAlign;
    sheet.getRow(2).height = 18;

    // ---- Columns ----
    sheet.columns = [
      { key: "no",           width: 6  },
      { key: "CategoryName", width: 14 },
      { key: "TypeName",     width: 16 },
      { key: "DeviceName",   width: 26 },
      { key: "BrandName",    width: 16 },
      { key: "ModelName",    width: 18 },
      { key: "ITCode",       width: 16 },
      { key: "AssetTag",     width: 18 },
      { key: "SerialNumber", width: 20 },
      { key: "StatusName",   width: 14 },
      { key: "CreatedDate",  width: 18 },
      { key: "CreatedBy",    width: 16 },
    ];

    // ---- Header row (row 3) ----
    const headers = [
      "No.", "หมวด", "ประเภท", "ชื่ออุปกรณ์",
      "ยี่ห้อ", "รุ่น", "IT Code", "Asset Tag",
      "Serial Number", "สถานะ", "วันที่เพิ่ม", "เพิ่มโดย"
    ];

    const headerRow = sheet.getRow(3);
    headerRow.height = 22;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value     = h;
      cell.font      = headerFont;
      cell.fill      = headerFill;
      cell.alignment = centerAlign;
      cell.border    = borderStyle;
    });

    // ---- Status color map ----
    const statusColor = {
      "พร้อมใช้งาน": "FFD4EDDA",
      "ถูกยืม":      "FFFFF3CD",
      "ซ่อม":        "FFF8D7DA",
      "ปิดใช้งาน":   "FFE2E3E5",
    };

    // ---- Data rows ----
    rows.forEach((r, idx) => {
      const row = sheet.addRow({
        no:           idx + 1,
        CategoryName: r.CategoryName || "-",
        TypeName:     r.TypeName     || "-",
        DeviceName:   r.DeviceName   || "-",
        BrandName:    r.BrandName    || "-",
        ModelName:    r.ModelName    || "-",
        ITCode:       r.ITCode       || "-",
        AssetTag:     r.AssetTag     || "-",
        SerialNumber: r.SerialNumber || "-",
        StatusName:   r.StatusName   || "-",
        CreatedDate:  r.CreatedDate  || "-",
        CreatedBy:    r.CreatedBy    || "-",
      });

      row.height = 20;

      // สีแถวสลับ + สีสถานะ
      const bgColor = statusColor[r.StatusName] || (idx % 2 === 0 ? "FFFFFFFF" : "FFF8F9FA");

      row.eachCell((cell, colNum) => {
        cell.border    = borderStyle;
        cell.alignment = { vertical: "middle", horizontal: colNum === 4 ? "left" : "center" };
        // สีเฉพาะคอลัมน์สถานะ (col 10)
        if (colNum === 10) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusColor[r.StatusName] || "FFFFFFFF" } };
          cell.font = { bold: true };
        } else {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: idx % 2 === 0 ? "FFFFFFFF" : "FFF8F9FA" } };
        }
      });
    });

    // ---- Freeze pane ----
    sheet.views = [{ state: "frozen", ySplit: 3 }];

    // ---- Send ----
    const filename = `Device_Export_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("DEVICE EXPORT ERROR:", err);
    res.status(500).send("Export error");
  }
  
});

router.get("/api/brands", async (req, res) => {
  const [brands] = await db.query(`
    SELECT BrandID, BrandName FROM tb_m_brand ORDER BY BrandName ASC
  `);
  res.json(brands);
});
// ============================
// LIST
// ============================
router.get("/device/:modelId", async (req, res) => {
  const modelId = req.params.modelId;

  const [devices] = await db.query(`
    SELECT 
      da.DVID,
      da.DeviceID,
      da.DVStatusID,
      DATE_FORMAT(da.CreatedDate, '%d/%m/%Y %H:%i:%s') AS CreatedDate,
      DATE_FORMAT(da.UpdatedDate, '%d/%m/%Y %H:%i:%s') AS UpdatedDate,
      da.CreatedBy,
      da.SerialNumber,
      da.ITCode,
      da.AssetTag,
      da.BarcodeImage,
      s.StatusName,
      e.username AS CreatedByName
    FROM tb_t_deviceadd da
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    JOIN tb_m_devicestatus s ON da.DVStatusID = s.DVStatusID
    LEFT JOIN tb_t_employee e ON da.CreatedBy = e.EMPID
    WHERE d.ModelID = ?
    ORDER BY da.CreatedDate DESC
  `, [modelId]);

  res.render("admin/layout", {
    page: "device-list",
    active: "device",
    user: req.session.user,
    devices,
    modelId,
    error: req.query.error || null,
    success: req.query.success || null
  });
});


// ============================
// ADD PAGE
// ============================
router.get("/device/:modelId/item/add", async (req, res) => {
  const modelId = req.params.modelId;

  const [[model]] = await db.query(
    "SELECT * FROM tb_m_model WHERE ModelID = ?",
    [modelId]
  );

  const [status] = await db.query(
    "SELECT * FROM tb_m_devicestatus"
  );

  res.render("admin/layout", {
    page: "device-listadd",
    active: "device",
    locals: { modelId, model, status }
  });
});


// ============================
// ADD
// ============================
router.post("/device/:modelId/item/add",
  uploadAsset.single("AssetImage"),
  async (req, res) => {

    const modelId = req.params.modelId;

    let { SerialNumber, AssetTag, DVStatusID, ITCode } = req.body;

    SerialNumber = normalize(SerialNumber);
    AssetTag = normalize(AssetTag);
    ITCode = normalize(ITCode);

    const [[device]] = await db.query(
      "SELECT DeviceID FROM tb_t_device WHERE ModelID = ?",
      [modelId]
    );

    // 🔥 เช็คซ้ำ (3 field)
    const [dup] = await db.query(`
      SELECT 1 FROM tb_t_deviceadd
      WHERE 
        (
          (SerialNumber = ? AND ? IS NOT NULL)
          OR
          (ITCode = ? AND ? IS NOT NULL)
          OR
          (AssetTag = ? AND ? IS NOT NULL)
        )
    `, [
      SerialNumber, SerialNumber,
      ITCode, ITCode,
      AssetTag, AssetTag
    ]);

    if (dup.length > 0) {

      const [[model]] = await db.query(
        "SELECT * FROM tb_m_model WHERE ModelID = ?",
        [modelId]
      );

      const [status] = await db.query(
        "SELECT * FROM tb_m_devicestatus"
      );

      return res.render("admin/layout", {
        page: "device-listadd",
        active: "device",
        locals: {
          modelId,
          model,
          status,
          error: "Serial / IT Code / AssetTag ซ้ำ ❌"
        }
      });
    }

    const imagePath = req.file ? req.file.filename : null;

    await db.query(`
      INSERT INTO tb_t_deviceadd
      (DeviceID, SerialNumber, AssetTag, ITCode, DVStatusID, BarcodeImage, CreatedBy, CreatedDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      device.DeviceID,
      SerialNumber,
      AssetTag,
      ITCode,
      DVStatusID,
      imagePath,
      req.session.user.EMPID
    ]);

    res.redirect(`/admin/device/${modelId}?success=add`);
  }
);


// ============================
// EDIT PAGE
// ============================
router.get("/device/item/:id/edit", async (req, res) => {
  const id = req.params.id;

  const [[device]] = await db.query(`
    SELECT da.*, d.ModelID
    FROM tb_t_deviceadd da
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    WHERE da.DVID = ?
  `, [id]);

  const [[model]] = await db.query(
    "SELECT * FROM tb_m_model WHERE ModelID = ?",
    [device.ModelID]
  );

  const [statusList] = await db.query(
    "SELECT * FROM tb_m_devicestatus"
  );

  res.render("admin/layout", {
    page: "device_listedit",
    active: "device",
    user: req.session.user,
    device,              
    model,
    statusList
  });
});


// ============================
// EDIT
// ============================
router.post("/device/item/:id/edit",
  uploadAsset.single("AssetImage"),
  async (req, res) => {

    try {

      const id = req.params.id;

      let { SerialNumber, AssetTag, DVStatusID, ITCode } = req.body;

      SerialNumber = normalize(SerialNumber);
      AssetTag = normalize(AssetTag);
      ITCode = normalize(ITCode);

      // 🔥 เช็คซ้ำ (กันชนตัวเอง)
      const [dup] = await db.query(`
        SELECT 1 FROM tb_t_deviceadd
        WHERE 
          (
            (SerialNumber = ? AND ? IS NOT NULL)
            OR
            (ITCode = ? AND ? IS NOT NULL)
            OR
            (AssetTag = ? AND ? IS NOT NULL)
          )
          AND DVID != ?
      `, [
        SerialNumber, SerialNumber,
        ITCode, ITCode,
        AssetTag, AssetTag,
        id
      ]);

      if (dup.length > 0) {

        const [[device]] = await db.query(`
          SELECT da.*, d.ModelID
          FROM tb_t_deviceadd da
          JOIN tb_t_device d ON da.DeviceID = d.DeviceID
          WHERE da.DVID = ?
        `, [id]);

        const [[model]] = await db.query(
          "SELECT * FROM tb_m_model WHERE ModelID = ?",
          [device.ModelID]
        );

        const [statusList] = await db.query(
          "SELECT * FROM tb_m_devicestatus"
        );

        return res.render("admin/layout", {
          page: "device_listedit",
          active: "device",
          locals: {
            device,
            model,
            statusList,
            error: "Serial / IT Code / AssetTag ซ้ำ ❌"
          }
        });
      }

      // ✅ UPDATE
      let sql = `
        UPDATE tb_t_deviceadd
        SET
          SerialNumber = ?,
          AssetTag = ?,
          ITCode = ?,
          DVStatusID = ?,
          UpdatedDate = NOW()
      `;

      const params = [SerialNumber, AssetTag, ITCode, DVStatusID];

      if (req.file) {
        sql += `, BarcodeImage = ?`;
        params.push(req.file.filename);
      }

      sql += ` WHERE DVID = ?`;
      params.push(id);

      await db.query(sql, params);

      const [[row]] = await db.query(
        "SELECT DeviceID FROM tb_t_deviceadd WHERE DVID = ?",
        [id]
      );

      const [[device]] = await db.query(
        "SELECT ModelID FROM tb_t_device WHERE DeviceID = ?",
        [row.DeviceID]
      );

      res.redirect(`/admin/device/${device.ModelID}?success=edit`);

    } catch (err) {

      console.error(err);

      if (err.code === "ER_DUP_ENTRY") {

        const id = req.params.id;

        const [[device]] = await db.query(`
          SELECT da.*, d.ModelID
          FROM tb_t_deviceadd da
          JOIN tb_t_device d ON da.DeviceID = d.DeviceID
          WHERE da.DVID = ?
        `, [id]);

        const [[model]] = await db.query(
          "SELECT * FROM tb_m_model WHERE ModelID = ?",
          [device.ModelID]
        );

        const [statusList] = await db.query(
          "SELECT * FROM tb_m_devicestatus"
        );

        return res.render("admin/layout", {
          page: "device_listedit",
          active: "device",
          locals: {
            device,
            model,
            statusList,
            error: "ข้อมูลซ้ำในระบบ ❌"
          }
        });
      }

      res.redirect("/admin/device");
    }
  }
);

router.get("/api/types", async (req, res) => {
  const [types] = await db.query(`
    SELECT TypeID, TypeName, TypeImage
    FROM tb_m_type
    ORDER BY TypeName ASC
  `);

  res.json(types);
});

router.get("/api/devices/type/:typeId", async (req, res) => {
  const typeId = req.params.typeId;

  const [devices] = await db.query(`
    SELECT 
      d.DeviceID,
      d.DeviceName,
      d.DeviceImage,
      m.ModelName,
      b.BrandName
    FROM tb_t_device d
    LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
    LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
    WHERE d.TypeID = ?
  `, [typeId]);

  res.json(devices);
});

router.get("/borrow", async (req, res) => {

  let { status } = req.query;

  if (!status) {
    status = "all";
  }

  let where = "";
  let params = [];

  if (status !== "all") {
    where = "WHERE bt.BorrowStatusID = ?";
    params.push(status);
  }

  const [borrows] = await db.query(`
    SELECT
      bt.BorrowID,
      bt.BorrowCode,
      bt.BorrowStatusID,
      bt.EMPID, 
      DATE_FORMAT(bt.BorrowDate, '%d/%m/%Y') AS BorrowDate,
      bt.DueDate AS DueDateRaw,
      DATE_FORMAT(bt.DueDate, '%d/%m/%Y') AS DueDate,

      e.fname,
      e.lname,
      t.TypeID,
      t.TypeImage,
      t.TypeName,
      d.DeviceImage,
      d.DeviceName,
      da.ITCode,
      da.AssetTag,
      da.DVID,
      da.DVStatusID,

      EXISTS (
      SELECT 1
      FROM tb_t_borrowtransaction bt2
      WHERE bt2.DVID = da.DVID
      AND bt2.BorrowStatusID = 6
    ) AS IsBorrowing,

      CASE
        WHEN bt.ReturnDate IS NULL 
            AND bt.BorrowStatusID IN (2,6)
            AND bt.DueDate < CURDATE()
        THEN 'เกินกำหนด'
        ELSE s.StatusName
      END AS StatusName,

      CONCAT(a.fname, ' ', a.lname) AS ActionBy,
      DATE_FORMAT(bt.ApproveDate, '%Y-%m-%d %H:%i') AS ActionDate,
    
      r.RepairID

    FROM tb_t_borrowtransaction bt
    JOIN tb_t_employee e ON bt.EMPID = e.EMPID
    LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
    LEFT JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    LEFT JOIN tb_m_type t ON bt.TypeID = t.TypeID
    JOIN tb_m_borrowstatus s ON bt.BorrowStatusID = s.BorrowStatusID
    LEFT JOIN tb_t_employee a ON bt.ApproveBy = a.EMPID
    LEFT JOIN tb_t_repair r
      ON da.DVID = r.DVID
      AND r.RepairStatusID IN (1,2)

    ${where}

    ORDER BY bt.BorrowDate DESC
    `, params);

  const today = new Date();
  // ✅ แปลงเป็น timezone ไทย
  const bangkokToday = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  bangkokToday.setHours(0, 0, 0, 0);

  borrows.forEach(b => {
    if (b.BorrowStatusID == 2) {
      b.statusText = "อนุมัติแล้ว";
      b.statusClass = "badge purple";
    }
    else if (b.BorrowStatusID == 6 && b.DueDate) {
      const due = new Date(b.DueDateRaw);
      due.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((due - bangkokToday) / (1000*60*60*24));

      if (diffDays < 0) {
        b.statusText = `เกินกำหนด ${Math.abs(diffDays)} วัน`;
        b.statusClass = "badge red";
      } 
      else if (diffDays <= 2) {
        b.statusText = `ใกล้ครบกำหนด (${diffDays} วัน)`;
        b.statusClass = "badge orange";
      } 
      else {
        b.statusText = "กำลังยืม";
        b.statusClass = "badge blue";
      }
    }
  });
  
  res.render("admin/layout", {
    page: "borrow_list",
    active: "borrow",
    borrows,
    status,
    success: req.query.success || null
  });
});


router.get("/borrow/detail/data/:code", async (req, res) => {
  const { code } = req.params;

  const [rows] = await db.query(`
    SELECT
      bt.BorrowCode,
      bt.BorrowStatusID,

      DATE_FORMAT(bt.BorrowDate,'%d/%m/%Y %H:%i:%s') AS BorrowDate,
      DATE_FORMAT(bt.DueDate,'%d/%m/%Y') AS DueDate,

      bt.Purpose,
      bt.Location,
      bt.Remark,

      e.fname,
      e.lname,

      da.ITCode,
      da.AssetTag,
      da.SerialNumber,
      da.BarcodeImage,

      d.DeviceName,
      d.DeviceImage,

      b.BrandName,
      m.ModelName,

      s.StatusName,

      CASE
        -- คืนแล้ว และคืนเกินกำหนด
        WHEN bt.BorrowStatusID = 4
            AND bt.ReturnDate IS NOT NULL
            AND DATE(bt.ReturnDate) > DATE(bt.DueDate)
        THEN CONCAT('เกินกำหนด ', DATEDIFF(bt.ReturnDate, bt.DueDate), ' วัน')

        -- ยังไม่คืน และกำลังยืมอยู่
        WHEN bt.BorrowStatusID IN (2,6)
            AND bt.ReturnDate IS NULL
            AND CURDATE() > bt.DueDate
        THEN CONCAT('เกินกำหนด ', DATEDIFF(CURDATE(), bt.DueDate), ' วัน')

        ELSE NULL
      END AS OverdueText,

      CASE
        WHEN bt.ReturnBy IS NOT NULL
          THEN CONCAT(er.fname, ' ', er.lname)
        WHEN bt.ApproveBy IS NOT NULL
          THEN CONCAT(ea.fname, ' ', ea.lname)
        ELSE NULL
      END AS ActionBy,

      CASE
        WHEN bt.ReturnBy IS NOT NULL THEN 'return'
        WHEN bt.BorrowStatusID = 3 THEN 'reject'
        WHEN bt.BorrowStatusID IN (2,6) THEN 'approve'
        ELSE NULL
      END AS ActionType,

      DATE_FORMAT(
        CASE
          WHEN bt.ReturnBy IS NOT NULL THEN bt.ReturnDate
          ELSE bt.ApproveDate
        END,
        '%d/%m/%Y %H:%i:%s'
      ) AS ActionDate

    FROM tb_t_borrowtransaction bt
    JOIN tb_t_employee e ON bt.EMPID = e.EMPID
    JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
    LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
    JOIN tb_m_borrowstatus s ON bt.BorrowStatusID = s.BorrowStatusID

    LEFT JOIN tb_t_employee ea ON bt.ApproveBy = ea.EMPID
    LEFT JOIN tb_t_employee er ON bt.ReturnBy = er.EMPID

    WHERE bt.BorrowCode = ?
  `, [code]);

  res.json(rows);
});

// อนุมัติการยืม
router.post("/borrow/approve/:id", async (req, res) => {
  const borrowId = req.params.id;
  const adminId = req.session.user.EMPID;
  const { DVID } = req.body;

  try {
    await db.query(`
      UPDATE tb_t_borrowtransaction
      SET BorrowStatusID = 2, DVID = ?, ApproveBy = ?, ApproveDate = NOW()
      WHERE BorrowID = ?
    `, [DVID, adminId, borrowId]);

    await db.query(`
      UPDATE tb_t_deviceadd SET DVStatusID = 2 WHERE DVID = ?
    `, [DVID]);

    const [[borrower]] = await db.query(`
      SELECT 
        e.email, e.fname, e.lname,
        bt.BorrowCode, bt.DueDate,
        d.DeviceName, da.AssetTag, da.ITCode,
        ea.fname AS approverFname,
        ea.lname AS approverLname
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e  ON bt.EMPID     = e.EMPID
      JOIN tb_t_deviceadd da ON da.DVID     = ?
      JOIN tb_t_device d     ON da.DeviceID = d.DeviceID
      JOIN tb_t_employee ea  ON bt.ApproveBy = ea.EMPID   -- ✅ ดึงชื่อ admin จาก DB ตรงๆ
      WHERE bt.BorrowID = ?
    `, [DVID, borrowId]);

    res.redirect("/admin/borrow?success=approve");

    (async () => {
      try {
        if (borrower?.email) {
          await sendEmail({
            to: borrower.email,
            subject: 'คำขอยืมอุปกรณ์ได้รับการอนุมัติ',
            html: emailApproved({
              borrowCode: borrower.BorrowCode,
              name: `${borrower.fname} ${borrower.lname}`,
              deviceName: borrower.DeviceName,
              assetTag: borrower.AssetTag,
              itCode: borrower.ITCode,
              dueDate: new Date(borrower.DueDate).toLocaleDateString('th-TH'),
              approveBy: `${borrower.approverFname} ${borrower.approverLname}`, // ✅ แก้ตรงนี้
            })
          });
        }
      } catch (e) {
        console.error("EMAIL ERROR:", e.message);
      }
    })();

  } catch (err) {
    console.error("APPROVE ERROR:", err);
    res.status(500).send("Approve error");
  }
});

// ============================
// คืนอุปกรณ์ (RETURN)
// ============================
router.post("/borrow/return/:id", async (req, res) => {
  const borrowId = req.params.id;
  const adminId = req.session.user.EMPID;

  try {
    const [[borrow]] = await db.query(`
      SELECT BorrowStatusID, DVID
      FROM tb_t_borrowtransaction
      WHERE BorrowID = ?
    `, [borrowId]);

    if (!borrow || borrow.BorrowStatusID !== 6) {
      return res.redirect("/admin/borrow?error=invalid_return");
    }

    await db.query(`
      UPDATE tb_t_borrowtransaction
      SET
        BorrowStatusID = 4,
        ReturnDate = NOW(),
        ReturnBy = ?
      WHERE BorrowID = ?
    `, [adminId, borrowId]);

    await db.query(`
      UPDATE tb_t_deviceadd
      SET
        DVStatusID = 1,
        UpdatedDate = NOW()
      WHERE DVID = ?
    `, [borrow.DVID]);

    // ✅ ดึงข้อมูลก่อน redirect
    const [[borrower]] = await db.query(`
    SELECT 
      e.email, e.fname, e.lname, 
      bt.BorrowCode, d.DeviceName,
      ea.fname AS returnFname,
      ea.lname AS returnLname
    FROM tb_t_borrowtransaction bt
    JOIN tb_t_employee e  ON bt.EMPID    = e.EMPID
    JOIN tb_t_deviceadd da ON bt.DVID   = da.DVID
    JOIN tb_t_device d     ON da.DeviceID = d.DeviceID
    JOIN tb_t_employee ea  ON bt.ReturnBy = ea.EMPID   -- ✅ ดึงชื่อคนรับคืน
    WHERE bt.BorrowID = ?
  `, [borrowId]);

    // 🚀 redirect ก่อน (เร็วทันที)
    res.redirect("/admin/borrow?success=return");

    // 📧 ส่ง email แบบ async
    (async () => {
      try {
        if (borrower?.email) {
          await sendEmail({
            to: borrower.email,
            subject: 'การคืนอุปกรณ์เรียบร้อยแล้ว',
            html: emailReturned({
              borrowCode: borrower.BorrowCode,
              name: `${borrower.fname} ${borrower.lname}`,
              deviceName: borrower.DeviceName,
              returnDate: new Date().toLocaleString('th-TH', {
                dateStyle: 'medium',
                timeStyle: 'short'
              }),
              returnBy: `${borrower.returnFname} ${borrower.returnLname}`,
            })
          });
        }
      } catch (e) {
        console.error("EMAIL ERROR:", e.message);
      }
    })();

  } catch (err) {
    console.error("RETURN ERROR:", err);
    res.redirect("/admin/borrow?error=return");
  }
});


// ============================
// ปฏิเสธการยืม (REJECT)
// ============================
router.post("/borrow/reject/:id", async (req, res) => {
  const borrowId = req.params.id;
  const { remark } = req.body;
  const adminId = req.session.user.EMPID;

  if (!remark || remark.trim() === "") {
    return res.redirect("/admin/borrow?error=reject_reason");
  }

  try {
    // 🔹 ดึงข้อมูลการยืม + DVID
    const [[borrow]] = await db.query(`
      SELECT BorrowStatusID, DVID
      FROM tb_t_borrowtransaction
      WHERE BorrowID = ?
      FOR UPDATE
    `, [borrowId]);

    if (!borrow || borrow.BorrowStatusID !== 1) {
      return res.redirect("/admin/borrow?error=invalid_status");
    }

    // 1️⃣ ปฏิเสธการยืม
    await db.query(`
      UPDATE tb_t_borrowtransaction
      SET
        BorrowStatusID = 3,
        Remark = ?,
        ApproveBy = ?,
        ApproveDate = NOW()
      WHERE BorrowID = ?
    `, [remark, adminId, borrowId]);

    // 2️⃣ 🔥 ตั้งค่าอุปกรณ์กลับเป็น "พร้อมใช้งาน" (ถ้ามี DVID)
    if (borrow.DVID) {
      await db.query(`
        UPDATE tb_t_deviceadd
        SET
          DVStatusID = 1,
          UpdatedDate = NOW()
        WHERE DVID = ?
      `, [borrow.DVID]);
    }

      res.redirect("/admin/borrow?success=reject");

      // 📧 ยิง async แยก
      (async () => {
        try {
          const [[borrower]] = await db.query(`
            SELECT
              e.email, e.fname, e.lname,
              bt.BorrowCode,
              COALESCE(d.DeviceName, t.TypeName) AS DeviceName,
              ea.fname AS rejectFname,
              ea.lname AS rejectLname
            FROM tb_t_borrowtransaction bt
            JOIN tb_t_employee e   ON bt.EMPID    = e.EMPID
            LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
            LEFT JOIN tb_t_device d    ON da.DeviceID = d.DeviceID
            LEFT JOIN tb_m_type t      ON bt.TypeID   = t.TypeID
            JOIN tb_t_employee ea  ON bt.ApproveBy = ea.EMPID   -- ✅ ดึงชื่อคนปฏิเสธ
            WHERE bt.BorrowID = ?
          `, [borrowId]);

          if (borrower?.email) {
            await sendEmail({
              to: borrower.email,
              subject: 'คำขอยืมอุปกรณ์ถูกปฏิเสธ',
              html: emailRejected({
                borrowCode: borrower.BorrowCode,
                name: `${borrower.fname} ${borrower.lname}`,
                deviceName: borrower.DeviceName || '-',
                rejectBy: `${borrower.rejectFname} ${borrower.rejectLname}`,
                rejectDate: new Date().toLocaleString('th-TH'),
                remark,
              })
            });
          }
        } catch (e) {
          console.error("EMAIL ERROR:", e.message);
        }
      })();
  } catch (err) {
    console.error("REJECT ERROR:", err);
    res.redirect("/admin/borrow?error=reject");
  }
});

router.get("/user/data/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    const [[user]] = await db.query(`
      SELECT
        e.EMPID,
        e.EMP_NUM,
        e.fname,
        e.lname,
        e.email,
        e.phone,
        e.fax,
        d.DepartmentName,
        i.InstitutionName,

        (
          SELECT COUNT(*)
          FROM tb_t_borrowtransaction b
          WHERE b.EMPID = e.EMPID
          AND b.BorrowStatusID IN (1,2,6)
        ) AS activeBorrow

      FROM tb_t_employee e
      LEFT JOIN tb_m_department d ON e.DepartmentID = d.DepartmentID
      LEFT JOIN tb_m_institution i ON e.InstitutionID = i.InstitutionID
      WHERE e.EMPID = ?
    `, [userId]);

    res.json(user);

  } catch (err) {
    console.error("USER DATA ERROR:", err);
    res.status(500).json({ error: "user_data_error" });
  }
});

// ============================
// รายการแจ้งซ่อม (REPAIR LIST)
// ============================
router.get("/repair", async (req, res) => {
  let { status, success } = req.query;


if (status === undefined) {
  status = "all";
}
  let where = "";
  let params = [];

  // ✅ ถ้าไม่ใช่ "all" ให้กรองตาม status
  if (status !== "all") {
    where = "WHERE r.RepairStatusID = ?";
    params.push(status);
  }

  const [repairs] = await db.query(`
    SELECT
      r.RepairID,
      r.RepairCode,
      r.RepairStatusID,
      DATE_FORMAT(r.CreateDate,'%d/%m/%Y %H:%i:%s') AS CreateDate,

      da.ITCode,
      da.AssetTag,
      d.DeviceName,
      d.DeviceImage,

      s.StatusName AS RepairStatusName,
      CONCAT(e.fname,' ',e.lname) AS CreateBy,
      r.Technician

    FROM tb_t_repair r
    JOIN tb_t_deviceadd da ON r.DVID = da.DVID
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    JOIN tb_m_repairstatus s ON r.RepairStatusID = s.RepairStatusID
    LEFT JOIN tb_t_employee e ON r.EMPID = e.EMPID
    ${where}
    ORDER BY r.CreateDate DESC
  `, params);

  res.render("admin/layout", {
    page: "repair",
    active: "repair",
    repairs,
    status,
    success
  });
});

// ============================
// สร้างรายการแจ้งซ่อมจาก admin
// ============================
router.post("/repair/create/:dvid", async (req, res) => {
  const { dvid } = req.params;
  const adminId = req.session.user.EMPID;
  const { repair_remark } = req.body; 
  try {
    // 1️⃣ เช็กงานซ่อมค้าง
    const [[exists]] = await db.query(`
      SELECT RepairID
      FROM tb_t_repair
      WHERE DVID = ?
        AND RepairStatusID IN (1, 2)
      LIMIT 1
    `, [dvid]);

    if (exists) {
      return res.redirect("/admin/borrow?error=repair_exists");
    }

    // 2️⃣ กันกรอกว่าง
    if (!repair_remark || repair_remark.trim() === "") {
      return res.redirect("/admin/borrow?error=empty_remark");
    }

    // 3️⃣ INSERT (ใช้ข้อความจาก user)
    const [result] = await db.query(`
      INSERT INTO tb_t_repair
        (DVID, EMPID, ProblemDetail, RepairStatusID, CreateDate)
      VALUES
        (?, ?, ?, 1, NOW())
    `, [
      dvid,
      adminId,
      repair_remark.trim() 
    ]);

    const repairID = result.insertId;

    // 4️⃣ สร้าง RepairCode
    const now = new Date();
    const repairCode =
      `RP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
      `-${String(repairID).padStart(4, '0')}`;

    // 5️⃣ UPDATE RepairCode
    await db.query(`
      UPDATE tb_t_repair
      SET RepairCode = ?
      WHERE RepairID = ?
    `, [repairCode, repairID]);

    // 6️⃣ เปลี่ยนสถานะอุปกรณ์ → ซ่อม
    await db.query(`
      UPDATE tb_t_deviceadd
      SET
        DVStatusID = 3,
        UpdatedDate = NOW()
      WHERE DVID = ?
    `, [dvid]);

    // 7️⃣ redirect
    res.redirect("/admin/repair?success=create");

  } catch (err) {
    console.error("CREATE REPAIR ERROR:", err);
    res.redirect("/admin/borrow?error=repair");
  }
});

// ============================
// หน้า "ส่งซ่อมอุปกรณ์"
// ============================
router.get("/repair/:dvid", async (req, res) => {
  const { dvid } = req.params;

  try {
    const [[device]] = await db.query(`
      SELECT
        da.DVID,
        da.ITCode,
        da.AssetTag,
        da.SerialNumber,
        da.DVStatusID,

        d.DeviceName,
        d.DeviceImage,

        s.StatusName
      FROM tb_t_deviceadd da
      JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      JOIN tb_m_devicestatus s ON da.DVStatusID = s.DVStatusID
      WHERE da.DVID = ?
    `, [dvid]);

    if (!device) {
      return res.redirect("/admin/borrow?error=device_not_found");
    }

    res.render("admin/layout", {
      page: "device_repair",
      active: "borrow",
      device
    });

  } catch (err) {
    console.error("REPAIR PAGE ERROR:", err);
    res.redirect("/admin/borrow?error=repair");
  }
});

router.get("/repair/detail/:id", async (req, res) => {
  const { id } = req.params;

  const [[repair]] = await db.query(`
    SELECT
      r.RepairCode,
      DATE_FORMAT(r.CreateDate,'%d/%m/%Y %H:%i:%s') AS CreateDate,
      r.ProblemDetail,
      DATE_FORMAT(r.StartRepairDate,'%d/%m/%Y %H:%i:%s') AS StartRepairDate,
      DATE_FORMAT(r.FinishDate,'%d/%m/%Y %H:%i:%s') AS FinishDate,

      d.DeviceName,
      d.DeviceImage,
      da.ITCode,
      da.AssetTag,
      da.SerialNumber,

      s.StatusName AS RepairStatusName,
      CONCAT(e.fname,' ',e.lname) AS CreateBy,
      r.Technician

    FROM tb_t_repair r
    JOIN tb_t_deviceadd da ON r.DVID = da.DVID
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    JOIN tb_m_repairstatus s ON r.RepairStatusID = s.RepairStatusID
    LEFT JOIN tb_t_employee e ON r.EMPID = e.EMPID
    WHERE r.RepairID = ?
  `, [id]);

  res.json(repair);
});
router.post('/repair/start/:id', async (req, res) => {
  const repairId = req.params.id;
  const adminId = req.session.user.EMPID;

  try {
  
    const [[admin]] = await db.query(`
      SELECT fname, lname
      FROM tb_t_employee
      WHERE EMPID = ?
    `, [adminId]);

    const adminName = `${admin.fname} ${admin.lname}`;

    await db.query(`
      UPDATE tb_t_repair
      SET 
        RepairStatusID = 2,
        Technician = ?,
        StartRepairDate = NOW()
      WHERE RepairID = ?
    `, [adminName, repairId]);

    res.redirect("/admin/repair?status=2&success=start");
  } catch (err) {
    console.error(err);
    res.redirect('/admin/repair?error=1');
  }
});

// ============================
// ซ่อมเสร็จ
// ============================
router.post('/repair/process/:id', async (req, res) => {
  const repairId = req.params.id;

  try {
    // 1️⃣ เปลี่ยนสถานะงานซ่อม → ซ่อมเสร็จ (สมมติ ID = 3)
    await db.query(`
      UPDATE tb_t_repair
      SET
        RepairStatusID = 3,
        FinishDate = NOW()
      WHERE RepairID = ?
    `, [repairId]);

    // 2️⃣ คืนสถานะอุปกรณ์ → พร้อมใช้งาน
    await db.query(`
      UPDATE tb_t_deviceadd da
      JOIN tb_t_repair r ON da.DVID = r.DVID
      SET
        da.DVStatusID = 1,
        da.UpdatedDate = NOW()
      WHERE r.RepairID = ?
    `, [repairId]);

    // 3️⃣ กลับหน้า list
   res.redirect("/admin/repair?status=3&success=finish");
  } catch (err) {
    console.error(err);
    res.redirect('/admin/repair?error=1');
  }
});


// ============================
// ยกเลิกการซ่อม 
// ============================
router.get('/repair/cancel/:id', async (req, res) => {
  const repairId = req.params.id;

  try {
    // 1️⃣ ดึง DVID มาก่อน
    const [[repair]] = await db.query(`
      SELECT DVID
      FROM tb_t_repair
      WHERE RepairID = ?
    `, [repairId]);

    if (!repair) {
      return res.redirect('/admin/repair?success=cancel');
    }

    // 2️⃣ อัปเดตสถานะการซ่อม → ยกเลิก
    await db.query(`
      UPDATE tb_t_repair
      SET RepairStatusID = 4
      WHERE RepairID = ?
    `, [repairId]);

    // 3️⃣ คืนสถานะอุปกรณ์ → พร้อมใช้งาน
    await db.query(`
      UPDATE tb_t_deviceadd
      SET
        DVStatusID = 1,
        UpdatedDate = NOW()
      WHERE DVID = ?
    `, [repair.DVID]);

    res.redirect('/admin/repair?status=4&success=cancel');

  } catch (err) {
    console.error(err);
    res.status(500).send('Cancel repair failed');
  }
});

/* ===============================
   REPORT
================================ */
router.get("/report", isAdmin, async (req, res) => {
  try {

    const query = req.query;  
    const { start, end, status, department, empid, Institution } = query;

    let where = [];
    let params = [];

    // ช่วงวันที่
    if (start && end) {
      where.push("DATE(bt.BorrowDate) BETWEEN ? AND ?");
      params.push(start, end);
    }

    // filter รหัสพนักงาน
    if (empid) {
      where.push("e.EMPID LIKE ?");
      params.push(`%${empid}%`);
    }

    // filter สถานะ
    if (status === "pending") {
      where.push("bt.BorrowStatusID = 1");
    }

    else if (status === "borrowing") {
      where.push(`
        bt.BorrowStatusID = 6
        AND bt.ReturnDate IS NULL
        AND bt.DueDate >= CURDATE()
      `);
    }

    else if (status === "returned") {
      where.push("bt.BorrowStatusID = 4");
    }

    else if (status === "overdue") {
      where.push(`
        bt.BorrowStatusID = 6
        AND bt.ReturnDate IS NULL
        AND bt.DueDate < CURDATE()
      `);
    }

    // filter แผนก
    if (department) {
      where.push("e.DepartmentID = ?");
      params.push(department);
    }

    // filter หน่วยงาน
    if (Institution) {
      where.push("e.InstitutionID = ?");
      params.push(Institution);
    }
    const whereSQL = where.length ? "WHERE " + where.join(" AND ") : "";

    const [reports] = await db.query(`
      SELECT
        bt.BorrowCode,
        DATE_FORMAT(bt.BorrowDate, '%d/%m/%Y') AS BorrowDate,
        DATE_FORMAT(bt.DueDate, '%d/%m/%Y') AS DueDate,
        DATE_FORMAT(bt.ReturnDate, '%d/%m/%Y') AS ReturnDate,

        e.fname,
        e.lname,
        da.ITCode,
        e.EMP_NUM,
        ins.InstitutionName,
        dep.DepartmentName,
        da.ITCode AS DeviceCode,
        da.AssetTag AS AssetTag,
        d.DeviceName,
        IFNULL(NULLIF(da.SerialNumber, ''), '-') AS SerialNumber,
        IFNULL(NULLIF(b.BrandName, ''), '-') AS Brand,
        IFNULL(NULLIF(m.ModelName, ''), '-') AS Model,

        -- คำนวณวันเกิน
        CASE
          WHEN bt.BorrowStatusID = 4
              AND bt.ReturnDate IS NOT NULL
            THEN GREATEST(DATEDIFF(bt.ReturnDate, bt.DueDate), 0)
          WHEN bt.BorrowStatusID = 6
              AND bt.ReturnDate IS NULL
            THEN GREATEST(DATEDIFF(CURDATE(), bt.DueDate), 0)
          ELSE 0
        END AS LateDays,

        -- สถานะแสดงผล (ผูกกับ BorrowStatusID เท่านั้น)
        CASE
          WHEN bt.BorrowStatusID = 3 THEN 'ปฏิเสธ'
          WHEN bt.BorrowStatusID = 5 THEN 'ยกเลิก'
          WHEN bt.BorrowStatusID = 4 THEN 'คืนแล้ว'
          WHEN bt.BorrowStatusID = 6
              AND bt.ReturnDate IS NULL
              AND bt.DueDate < CURDATE()
            THEN 'เกินกำหนด'
          WHEN bt.BorrowStatusID = 6
              AND bt.ReturnDate IS NULL
            THEN 'กำลังยืม'
          WHEN bt.BorrowStatusID = 2 THEN 'อนุมัติแล้ว'
          ELSE 'รออนุมัติ'
        END AS StatusLabel

      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      LEFT JOIN tb_m_department dep ON e.DepartmentID = dep.DepartmentID
      LEFT JOIN tb_m_institution ins ON e.InstitutionID = ins.InstitutionID
      JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
      LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID

      ${whereSQL}
      ORDER BY bt.BorrowDate DESC
    `, params);

    // 🔹 ดึงแผนกไว้ใช้ใน dropdown
    const [departments] = await db.query(`
      SELECT DepartmentID, DepartmentName
      FROM tb_m_department
      ORDER BY DepartmentName
    `);

    const [institutions] = await db.query(`
      SELECT InstitutionID, InstitutionName
      FROM tb_m_institution
      ORDER BY InstitutionName
    `);

    // 🔹 สรุปตัวเลข
    const summary = {
      total: reports.length,
      borrowing: reports.filter(r => r.StatusLabel === "กำลังยืม").length,
      returned: reports.filter(r => r.StatusLabel === "คืนแล้ว").length,
      late: reports.filter(r => r.StatusLabel === "เกินกำหนด").length
    };

    res.render("admin/layout", {
      page: "report",
      active: "report",
      reports,
      departments,
      institutions,  // เพิ่ม
      summary,
      query
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Report error");
  }
});

router.get("/report/excel", isAdmin, async (req, res) => {
  try {
    const { start, end, status, department, empid, Institution } = req.query;

    let where = [];
    let params = [];

    if (empid) {
      where.push("e.EMPID LIKE ?");
      params.push(`%${empid}%`);
    }

    if (Institution) {
      where.push("e.InstitutionID = ?");
      params.push(Institution);
    }
    if (start && end) {
      where.push("DATE(bt.BorrowDate) BETWEEN ? AND ?");
      params.push(start, end);
    }

    if (status === "pending") {
      where.push("bt.BorrowStatusID = 1");
    }

    else if (status === "borrowing") {
      where.push(`
        bt.BorrowStatusID = 6
        AND bt.ReturnDate IS NULL
        AND bt.DueDate >= CURDATE()
      `);
    }

    else if (status === "returned") {
      where.push("bt.BorrowStatusID = 4");
    }

    else if (status === "overdue") {
      where.push(`
        bt.BorrowStatusID = 6
        AND bt.ReturnDate IS NULL
        AND bt.DueDate < CURDATE()
      `);
    }

    if (department) {
      where.push("e.DepartmentID = ?");
      params.push(department);
    }

    const whereSQL = where.length ? "WHERE " + where.join(" AND ") : "";

    const [rows] = await db.query(`
      SELECT
        bt.BorrowCode,
        e.EMP_NUM,
        e.fname,
        e.lname,
        da.ITCode,
        ins.InstitutionName,
        dep.DepartmentName,
        da.ITCode,
        da.AssetTag,
        d.DeviceName,
        da.SerialNumber,
        b.BrandName AS Brand,
        m.ModelName AS Model,

        DATE_FORMAT(bt.BorrowDate, '%d/%m/%Y') AS BorrowDate,
        DATE_FORMAT(bt.DueDate, '%d/%m/%Y') AS DueDate,
        DATE_FORMAT(bt.ReturnDate, '%d/%m/%Y') AS ReturnDate,

        CASE
          WHEN bt.BorrowStatusID = 4
            AND bt.ReturnDate IS NOT NULL
            THEN GREATEST(DATEDIFF(bt.ReturnDate, bt.DueDate), 0)
          WHEN bt.BorrowStatusID = 6
            AND bt.ReturnDate IS NULL
            THEN GREATEST(DATEDIFF(CURDATE(), bt.DueDate), 0)
          ELSE 0
        END AS LateDays,

        CASE
          WHEN bt.BorrowStatusID = 3 THEN 'ปฏิเสธ'
          WHEN bt.BorrowStatusID = 5 THEN 'ยกเลิก'
          WHEN bt.BorrowStatusID = 4 THEN 'คืนแล้ว'
          WHEN bt.BorrowStatusID = 6
            AND bt.ReturnDate IS NULL
            AND bt.DueDate < CURDATE()
            THEN 'เกินกำหนด'
          WHEN bt.BorrowStatusID = 6
            AND bt.ReturnDate IS NULL
            THEN 'กำลังยืม'
          WHEN bt.BorrowStatusID = 2 THEN 'อนุมัติแล้ว'
          ELSE 'รออนุมัติ'
        END AS StatusLabel

      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
      LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
      LEFT JOIN tb_m_department dep ON e.DepartmentID = dep.DepartmentID
      LEFT JOIN tb_m_institution ins ON e.InstitutionID = ins.InstitutionID
      
      ${whereSQL}
      ORDER BY bt.BorrowDate DESC
    `, params);

     const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("รายงานการยืม-คืน");

    const headerFill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: "FF1E3A5F" }
    };
    const headerFont  = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    const centerAlign = { horizontal: "center", vertical: "middle", wrapText: true };
    const leftAlign   = { horizontal: "left",   vertical: "middle", wrapText: true };
    const border = {
      top:    { style: "thin", color: { argb: "FFD1D5DB" } },
      left:   { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right:  { style: "thin", color: { argb: "FFD1D5DB" } }
    };

    const statusFill = {
      "กำลังยืม":  { argb: "FFDBEAFE" },
      "คืนแล้ว":   { argb: "FFDCFCE7" },
      "เกินกำหนด": { argb: "FFFEE2E2" },
      "รออนุมัติ": { argb: "FFFFF9C3" },
      "ปฏิเสธ":    { argb: "FFFEE2E2" },
      "ยกเลิก":    { argb: "FFFFEDD5" },
    };

    const statusColor = {
      "กำลังยืม":  { argb: "FF1D4ED8" },
      "คืนแล้ว":   { argb: "FF15803D" },
      "เกินกำหนด": { argb: "FFB91C1C" },
      "รออนุมัติ": { argb: "FF854D0E" },
      "ปฏิเสธ":    { argb: "FFB91C1C" },
      "ยกเลิก":    { argb: "FFC2410C" },
    };

    // Title
    sheet.mergeCells("A1:P1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "รายงานการยืม–คืนอุปกรณ์";
    titleCell.font = { bold: true, size: 16, color: { argb: "FF1E3A5F" } };
    titleCell.alignment = centerAlign;
    sheet.getRow(1).height = 32;

    // Sub title
    sheet.mergeCells("A2:P2");
    const now = new Date();
    const exportDate = now.toLocaleString("th-TH", {
      dateStyle: "medium", timeStyle: "short"
    });
    sheet.getCell("A2").value = `ส่งออกเมื่อ: ${exportDate}  |  จำนวน: ${rows.length} รายการ`;
    sheet.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
    sheet.getCell("A2").alignment = centerAlign;
    sheet.getRow(2).height = 18;

    // Columns
    sheet.columns = [
      { key: "no",              width: 5  },
      { key: "BorrowCode",      width: 20 },
      { key: "EMP_NUM",         width: 14 },
      { key: "Borrower",        width: 24 },
      { key: "InstitutionName", width: 20 },
      { key: "DepartmentName",  width: 20 },
      { key: "DeviceName",      width: 22 },
      { key: "AssetTag",        width: 16 },
      { key: "SerialNumber",    width: 18 },
      { key: "Brand",           width: 14 },
      { key: "Model",           width: 16 },
      { key: "BorrowDate",      width: 14 },
      { key: "DueDate",         width: 14 },
      { key: "ReturnDate",      width: 14 },
      { key: "LateDays",        width: 10 },
      { key: "StatusLabel",     width: 14 },
    ];

    // Header row
    const headers = [
      "No.", "เลขเอกสาร", "รหัสพนักงาน", "ผู้ยืม",
      "สำนัก", "ฝ่าย", "อุปกรณ์", "รหัสครุภัณฑ์",
      "Serial No.", "ยี่ห้อ", "รุ่น",
      "วันยืม", "กำหนดคืน", "วันคืน", "วันเกิน", "สถานะ"
    ];

    const hRow = sheet.getRow(3);
    hRow.height = 24;
    headers.forEach((h, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value     = h;
      cell.font      = headerFont;
      cell.fill      = headerFill;
      cell.alignment = centerAlign;
      cell.border    = border;
    });

    // Data rows
    rows.forEach((r, idx) => {
      const rowBg = idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";

      const row = sheet.addRow({
        no:              idx + 1,
        BorrowCode:      r.BorrowCode,
        EMP_NUM:         r.EMP_NUM         || "-",
        Borrower:        `${r.fname} ${r.lname}`,
        InstitutionName: r.InstitutionName || "-",
        DepartmentName:  r.DepartmentName  || "-",
        DeviceName:      r.DeviceName      || "-",
        AssetTag:        r.AssetTag        || "-",
        SerialNumber:    r.SerialNumber    || "-",
        Brand:           r.Brand           || "-",
        Model:           r.Model           || "-",
        BorrowDate:      r.BorrowDate      || "-",
        DueDate:         r.DueDate         || "-",
        ReturnDate:      r.ReturnDate      || "-",
        LateDays:        r.LateDays > 0 ? `${r.LateDays} วัน` : "-",
        StatusLabel:     r.StatusLabel,
      });

      row.height = 22;

      row.eachCell((cell, colNum) => {
        cell.border    = border;
        cell.alignment = [4, 5, 6, 7].includes(colNum) ? leftAlign : centerAlign;

        if (colNum === 16) {
          cell.fill = { type: "pattern", pattern: "solid",
            fgColor: statusFill[r.StatusLabel] || { argb: "FFE5E7EB" } };
          cell.font = { bold: true,
            color: statusColor[r.StatusLabel] || { argb: "FF374151" }, size: 11 };
        } else if (colNum === 15 && r.LateDays > 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          cell.font = { bold: true, color: { argb: "FFB91C1C" }, size: 11 };
        } else {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        }
      });
    });

    sheet.views = [{ state: "frozen", ySplit: 3 }];
    sheet.autoFilter = { from: "A3", to: "P3" };

    const filename = `BorrowReport_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("EXCEL ERROR:", err);
    res.status(500).send("Excel error");
  }
});

/* ===============================
   TYPE (ประเภทอุปกรณ์)
================================ */

// multer สำหรับ type image (ใช้ diskStorage ที่มีอยู่แล้ว)
const uploadType = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/type'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  })
});

// เพิ่ม / แก้ไขประเภท (ใช้ route เดียว แยกด้วย TypeID)
router.post("/type/add", uploadType.single("TypeImage"), async (req, res) => {
  try {
    const { TypeID, TypeName } = req.body;
    const image = req.file ? req.file.filename : null;

    if (TypeID && TypeID !== "") {
      // แก้ไข
      await db.query(`
        UPDATE tb_m_type
        SET TypeName = ?, TypeImage = COALESCE(?, TypeImage)
        WHERE TypeID = ?
      `, [TypeName, image, TypeID]);
    } else {
      // เพิ่มใหม่
      await db.query(`
        INSERT INTO tb_m_type (TypeName, TypeImage)
        VALUES (?, ?)
      `, [TypeName, image]);
    }

    res.redirect("/admin/device?success=add");

  } catch (err) {
    console.error("TYPE ADD/EDIT ERROR:", err);
    res.redirect("/admin/device?error=type");
  }

});
router.get("/search-asset", async (req, res) => {
  const q = req.query.q?.trim();
  if (!q || q.length < 2) return res.json({ found: false, suggestions: [] });

  try {
    // ถ้าพิมพ์ครบ exact → redirect ทันที
    const [[exact]] = await db.query(`
      SELECT da.AssetTag, da.ITCode, da.SerialNumber, d.ModelID
      FROM tb_t_deviceadd da
      JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      WHERE da.AssetTag = ? OR da.ITCode = ? OR da.SerialNumber = ?
      LIMIT 1
    `, [q, q, q]);

    if (exact) {
      return res.json({
        found: true,
        modelId: exact.ModelID,
        assetTag: exact.AssetTag || exact.ITCode || exact.SerialNumber,
        suggestions: []
      });
    }

    // ถ้ายังไม่ครบ → ส่ง suggestion กลับมา
    const [suggestions] = await db.query(`
      SELECT 
        da.AssetTag, da.ITCode, da.SerialNumber,
        d.ModelID, dev.DeviceName, m.ModelName
      FROM tb_t_deviceadd da
      JOIN tb_t_device dev ON da.DeviceID = dev.DeviceID
      JOIN tb_m_model m ON dev.ModelID = m.ModelID
      JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      WHERE da.AssetTag LIKE ? OR da.ITCode LIKE ? OR da.SerialNumber LIKE ?
      LIMIT 8
    `, [`%${q}%`, `%${q}%`, `%${q}%`]);

    res.json({ found: false, suggestions });

  } catch (err) {
    console.error(err);
    res.status(500).json({ found: false, suggestions: [] });
  }
});

// ลบประเภท
router.get("/type/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // เช็กว่ามีอุปกรณ์ใช้ type นี้อยู่ไหม
    const [[used]] = await db.query(`
      SELECT 1 FROM tb_t_device WHERE TypeID = ? LIMIT 1
    `, [id]);

    if (used) {
      return res.redirect("/admin/device?error=used");
    }

    await db.query("DELETE FROM tb_m_type WHERE TypeID = ?", [id]);
    res.redirect("/admin/device?success=delete");

  } catch (err) {
    console.error("TYPE DELETE ERROR:", err);
    res.redirect("/admin/device?error=type");
  }
});

module.exports = router;