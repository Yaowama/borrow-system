const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isLogin } = require("../middleware/auth");
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
      "SELECT IsActive FROM TB_T_Employee WHERE EMPID=?",
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

/* ===============================
   USER DASHBOARD
================================ */
router.get("/dashboard", isLogin, checkActive, async (req, res) => {

  const [types] = await db.query(`
    SELECT TypeID, TypeName
    FROM tb_m_type
    ORDER BY TypeName
  `);

  const [devices] = await db.query(`
    SELECT
      d.DeviceID,
      d.DeviceName,
      d.DeviceImage,
      d.TypeID,
      t.TypeName,
      c.CategoryName,
      b.BrandName,
      m.ModelName,
      COUNT(da.DVID) AS Stock,
      MIN(da.DVID) AS DVID
    FROM tb_t_device d
    JOIN tb_t_deviceadd da
      ON d.DeviceID = da.DeviceID
      AND da.DVStatusID = 1
    LEFT JOIN tb_m_type t ON d.TypeID = t.TypeID
    LEFT JOIN tb_m_category c ON d.CategoryID = c.CategoryID
    LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
    LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
    GROUP BY d.DeviceID
    ORDER BY d.DeviceName
  `);

  res.render("user/layout", {
    title: "ระบบยืม–คืน",
    page: "user",
    user: req.session.user,
    types,
    devices,
    success: req.query.success,
    active: "dashboard"
  });
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
    return res.redirect("/user/dashboard?success=borrow");
  }

  res.render("user/layout", {
    title: "ยืมอุปกรณ์",
    page: "borrow_form",
    user: req.session.user,
    device,
    active: "borrow_form"
  });
});



/* ===============================
   SUBMIT BORROW
================================ */
router.post("/borrow/:id", isLogin, checkActive, async (req, res) => {

  const EMPID = req.session.user.EMPID;
  const DeviceID = req.params.id;

  const {
  BorrowDate,
  DueDate,
  purpose,
  location,
  note,
  qty = 1
} = req.body;

const qtyNum = Number(qty);
if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
  throw new Error("qty ไม่ถูกต้อง");
}

const [devices] = await db.query(`
  SELECT DVID
  FROM tb_t_deviceadd
  WHERE DeviceID = ?
    AND DVStatusID = 1
  LIMIT ?
`, [DeviceID, qtyNum]);


  if (devices.length < qtyNum) {
    return res.send(`
      <script>
        alert("❌ อุปกรณ์ไม่เพียงพอ");
        history.back();
      </script>
    `);
  }

  for (const d of devices) {

    await db.query(`
  INSERT INTO TB_T_BorrowTransaction
  (
    BorrowCode,
    EMPID,
    DVID,
    DueDate,
    Purpose,
    \`Location\`,
    BorrowStatusID,
    Remark
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`, [
  "BR" + Date.now(),
  EMPID,
  d.DVID,
  DueDate,
  purpose,
  location,
  1,
  note || null
]);


    await db.query(`
      UPDATE tb_t_deviceadd
      SET DVStatusID = 2
      WHERE DVID = ?
    `, [d.DVID]);
  }

  res.redirect("/user/borrow/history?success=borrow");
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
    FROM TB_T_BorrowTransaction bt
    JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    JOIN TB_M_BorrowStatus s
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
        d.DeviceName,
        d.DeviceImage,
        b.BrandName,
        m.ModelName,
        s.StatusName
      FROM TB_T_BorrowTransaction bt
      JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
      LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
      JOIN TB_M_BorrowStatus s
        ON bt.BorrowStatusID = s.BorrowStatusID
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

      DATE_FORMAT(bt.BorrowDate,'%d/%m/%Y') AS BorrowDate,
      DATE_FORMAT(bt.DueDate,'%d/%m/%Y') AS DueDate,
      DATE_FORMAT(bt.ReturnDate,'%d/%m/%Y') AS ReturnDate,

      bt.Purpose,
      bt.\`Location\`,
      bt.Remark,

      d.DeviceName,
      d.DeviceImage,
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

    FROM TB_T_BorrowTransaction bt
    JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
    LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
    JOIN TB_M_BorrowStatus s ON bt.BorrowStatusID = s.BorrowStatusID

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
      UPDATE TB_T_BorrowTransaction
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
      FROM TB_T_BorrowTransaction
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
      UPDATE TB_T_BorrowTransaction
      SET BorrowStatusID = 5
      WHERE BorrowID = ?
        AND BorrowStatusID = 1
    `, [id]);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.redirect("/user/borrow/status?error=invalid_cancel");
    }

    await conn.query(`
      UPDATE TB_T_DeviceAdd
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
      UPDATE TB_T_BorrowTransaction
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
  FROM TB_T_BorrowTransaction bt
  JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
  JOIN tb_t_device d ON da.DeviceID = d.DeviceID
  LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
  LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
  LEFT JOIN tb_m_category c ON d.CategoryID = c.CategoryID
  JOIN TB_M_BorrowStatus s
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
      d.DeviceName,
      d.DeviceImage,
      b.BrandName,
      m.ModelName,
      c.CategoryName,
      s.StatusName
    FROM TB_T_BorrowTransaction bt
    JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
    JOIN tb_t_device d ON da.DeviceID = d.DeviceID
    LEFT JOIN tb_m_brand b ON d.BrandID = b.BrandID
    LEFT JOIN tb_m_model m ON d.ModelID = m.ModelID
    LEFT JOIN tb_m_category c ON d.CategoryID = c.CategoryID
    JOIN TB_M_BorrowStatus s ON bt.BorrowStatusID = s.BorrowStatusID
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
    FROM TB_T_Employee e
    LEFT JOIN Roles r 
      ON e.RoleID = r.RoleID
    LEFT JOIN TB_M_Department d 
      ON e.DepartmentID = d.DepartmentID
    LEFT JOIN TB_M_Institution i 
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
      SELECT * FROM TB_T_Employee WHERE EMPID = ?
    `, [empId]);

    const [departments] = await db.query(`
      SELECT * FROM TB_M_Department
    `);

    const [institutions] = await db.query(`
      SELECT * FROM TB_M_Institution
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
        UPDATE TB_T_Employee
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
      "SELECT password FROM TB_T_Employee WHERE EMPID = ?",
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
      "UPDATE TB_T_Employee SET password = ? WHERE EMPID = ?",
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
