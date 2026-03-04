const express = require("express");
const router = express.Router();
const db = require("../config/db");
const ExcelJS = require("exceljs");
const { isLogin } = require("../middleware/auth");
const bcrypt = require("bcrypt");
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


/* ===============================
   DASHBOARD
================================ */
router.get("/", isAdmin, async (req, res) => {

  const [[deviceTotal]] = await db.query(`
    SELECT COUNT(*) total FROM TB_T_Device
  `);

  const [[availableDevice]] = await db.query(`
    SELECT COUNT(*) total
    FROM TB_T_DeviceAdd
    WHERE DVStatusID = 1
  `);
  
  const [[deviceStatus]] = await db.query(`
    SELECT
      SUM(CASE WHEN DVStatusID = 1 THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN DVStatusID = 2 THEN 1 ELSE 0 END) AS borrowed,
      SUM(CASE WHEN DVStatusID = 3 THEN 1 ELSE 0 END) AS repair
    FROM TB_T_DeviceAdd
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
    SELECT COUNT(*) total FROM TB_T_BorrowTransaction WHERE BorrowStatusID = 1
  `);

  const [[approved]] = await db.query(`
    SELECT COUNT(*) total FROM TB_T_BorrowTransaction WHERE BorrowStatusID IN (2,6)
  `);

  const [[rejected]] = await db.query(`
    SELECT COUNT(*) total FROM TB_T_BorrowTransaction WHERE BorrowStatusID = 3
  `);

  const [[returned]] = await db.query(`
    SELECT COUNT(*) total FROM TB_T_BorrowTransaction WHERE BorrowStatusID = 4
  `);

  const [[overdue]] = await db.query(`
  SELECT COUNT(*) total
  FROM TB_T_BorrowTransaction
  WHERE BorrowStatusID = 6
    AND ReturnDate IS NULL
    AND DueDate < CURDATE()
`);


  const [[employeeTotal]] = await db.query(`
    SELECT COUNT(*) total FROM TB_T_Employee
  `);

  const [nearDueList] = await db.query(`
    SELECT
    bt.BorrowCode,
    bt.DueDate,
    DATEDIFF(bt.DueDate, CURDATE()) AS remain_day,

    e.fname,
    e.lname,

    da.AssetCode,
    m.ModelName

  FROM TB_T_BorrowTransaction bt

  JOIN TB_T_Employee e 
    ON bt.EMPID = e.EMPID

  JOIN TB_T_DeviceAdd da
    ON bt.DVID = da.DVID

  JOIN TB_T_Device d
    ON da.DeviceID = d.DeviceID

  JOIN TB_M_Model m
    ON d.ModelID = m.ModelID

  WHERE bt.BorrowStatusID = 6
    AND bt.ReturnDate IS NULL
    AND DATEDIFF(bt.DueDate, CURDATE()) BETWEEN 0 AND 3

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

        COUNT(b.BorrowID) AS activeBorrow

      FROM TB_T_Employee e

      LEFT JOIN roles r ON e.RoleID = r.RoleID


      LEFT JOIN TB_M_Institution i
        ON e.InstitutionID = i.InstitutionID

      LEFT JOIN TB_M_Department d
        ON e.DepartmentID = d.DepartmentID

      LEFT JOIN TB_T_BorrowTransaction b
        ON e.EMPID = b.EMPID
        AND b.BorrowStatusID IN (1,2)

      GROUP BY 
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
        d.DepartmentName

      ORDER BY e.EMPID DESC
    `);


    const [departments] = await db.query(`
      SELECT DepartmentID, DepartmentName
      FROM TB_M_Department
      ORDER BY DepartmentName ASC
    `);


    const [institutions] = await db.query(`
      SELECT InstitutionID, InstitutionName
      FROM TB_M_Institution
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
      FROM TB_T_Employee e

      LEFT JOIN roles r 
        ON e.RoleID = r.RoleID

      LEFT JOIN TB_M_Department d 
        ON e.DepartmentID = d.DepartmentID

      LEFT JOIN TB_M_Institution i
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
      "SELECT RoleID, IsActive FROM TB_T_Employee WHERE EMPID=?",
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
        FROM TB_T_Employee
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
      UPDATE TB_T_Employee
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
        "SELECT * FROM TB_T_Employee WHERE EMPID=?",
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
        UPDATE TB_T_Employee
        SET
          fname=?,
          lname=?,
          email=?,
          phone=?,
          fax=?,
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
        DepartmentID,
        InstitutionID,
        RoleID,
        IsActive,
        profileImage,
        id
      ]);

      if (parseInt(id) === req.session.user.EMPID) {

        const [rows] = await db.query(
          "SELECT * FROM TB_T_Employee WHERE EMPID=?",
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
    FROM TB_T_Employee e
    LEFT JOIN Roles r 
      ON e.RoleID = r.RoleID
    LEFT JOIN TB_M_Department d 
      ON e.DepartmentID = d.DepartmentID
    LEFT JOIN TB_M_Institution i 
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
      SELECT * FROM TB_T_Employee WHERE EMPID = ?
    `, [empId]);

    const [departments] = await db.query(`
      SELECT * FROM TB_M_Department
    `);

    const [institutions] = await db.query(`
      SELECT * FROM TB_M_Institution
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
      const { email, phone, fax, DepartmentID, InstitutionID } = req.body;

      let imageSql = "";
      let params = [email, phone, fax, DepartmentID, InstitutionID];

      if (req.file) {
        imageSql = ", ProfileImage = ?";
        params.push(req.file.filename);
      }

      params.push(empId);

      await db.query(`
      UPDATE TB_T_Employee
      SET
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

router.get("/change_password", (req, res) => {
  res.render("admin/layout", {
    page: "change_password",
    active: "change_password",
    error: null,
    success: null
  });
});

router.post("/change_password", async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    // 1. ตรวจว่ารหัสใหม่ตรงกันไหม
    if (newPassword !== confirmPassword) {
      return res.render("admin/layout", {
        page: "change_password",
        active: "change_password",
        error: "รหัสผ่านใหม่ไม่ตรงกัน",
        success: null
      });
    }

    // 2. ดึง user ปัจจุบัน
    const [[user]] = await db.query(
      "SELECT password FROM TB_T_Employee WHERE EMPID = ?",
      [req.session.user.EMPID]
    );

    // 3. ตรวจรหัสผ่านเดิม
    const bcrypt = require("bcrypt");
    const match = await bcrypt.compare(oldPassword, user.password);

    if (!match) {
      return res.render("admin/layout", {
        page: "change_password",
        active: "change_password",
        error: "รหัสผ่านปัจจุบันไม่ถูกต้อง",
        success: null
      });
    }

    // 4. hash รหัสใหม่
    const hashed = await bcrypt.hash(newPassword, 10);

    // 5. update
    await db.query(
      "UPDATE TB_T_Employee SET password = ? WHERE EMPID = ?",
      [hashed, req.session.user.EMPID]
    );

    // 6. success
    res.render("admin/layout", {
      page: "change_password",
      active: "change_password",
      error: null,
      success: "เปลี่ยนรหัสผ่านสำเร็จ 🎉"
    });

  } catch (err) {
    console.error(err);
    res.send("Server error");
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
    FROM TB_T_Device d
    JOIN TB_M_Model m ON d.ModelID = m.ModelID
    LEFT JOIN TB_M_Category c ON d.CategoryID = c.CategoryID
    LEFT JOIN TB_M_Brand b ON d.BrandID = b.BrandID
    LEFT JOIN TB_M_Type t ON d.TypeID = t.TypeID
    LEFT JOIN TB_T_DeviceAdd da ON d.DeviceID = da.DeviceID
    GROUP BY d.DeviceID
  `);

  res.render("admin/layout", {
    page: "device",
    active: "device",
    models,
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
    FROM TB_T_Device d
    JOIN TB_T_DeviceAdd da ON d.DeviceID = da.DeviceID
    WHERE d.ModelID = ?
    LIMIT 1
  `, [modelId]);

  // ❌ ถ้ามีเครื่อง → ห้ามลบ
  if (used) {
    return res.redirect("/admin/device?error=used");
  }

  // 🔥 ลบได้
  await db.query(
    "DELETE FROM TB_T_Device WHERE ModelID = ?",
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
    FROM TB_M_Model
  `);

  const [categories] = await db.query("SELECT * FROM TB_M_Category");
  const [brands] = await db.query("SELECT * FROM TB_M_Brand");
  const [types] = await db.query("SELECT * FROM TB_M_Type");

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
      INSERT INTO TB_T_Device
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
    FROM TB_M_Model
    WHERE BrandID = ?
  `,[brandId]);

  res.json(models);
});
// หน้าแก้ไข (GET)
router.get("/device/edit/:id", async (req, res) => {
  const id = req.params.id;

  const [[device]] = await db.query(`
    SELECT d.*, m.ModelName
    FROM TB_T_Device d
    LEFT JOIN TB_M_Model m ON d.ModelID = m.ModelID
    WHERE d.DeviceID = ?
  `, [id]);

  const [models] = await db.query(`
    SELECT ModelID, ModelName
    FROM TB_M_Model
  `);

  const [categories] = await db.query("SELECT * FROM TB_M_Category");
  const [brands] = await db.query("SELECT * FROM TB_M_Brand");
  const [types] = await db.query("SELECT * FROM TB_M_Type");

  res.render("admin/layout", {
    page: "device_edit",
    active: "device",
    device,
    models,      // ✅ ตอนนี้มีจริงแล้ว
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
        "SELECT DeviceImage FROM TB_T_Device WHERE DeviceID = ?",
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
        UPDATE TB_T_Device
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
    FROM TB_T_DeviceAdd da
    JOIN TB_T_Device d ON da.DeviceID = d.DeviceID
    WHERE da.DVID = ?
  `, [id]);

  if (!row) {
    return res.redirect("/admin/device");
  }

  // ❗ เช็กว่ากำลังถูกยืมอยู่หรือไม่
  const [[borrowed]] = await db.query(`
    SELECT 1
    FROM TB_T_BorrowTransaction
    WHERE DVID = ?
      AND ReturnDate IS NULL
  `, [id]);

  // 🚫 ถ้ากำลังถูกยืม → ห้ามลบ
  if (borrowed) {
    return res.redirect(`/admin/device/${row.ModelID}?error=borrowed`);
  }

  // 🔥 ลบได้
  await db.query(
    "DELETE FROM TB_T_DeviceAdd WHERE DVID = ?",
    [id]
  );

  res.redirect(`/admin/device/${row.ModelID}?success=delete`);
});

// ============================
// เพิ่มเครื่องจริง (ASSET)
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
      da.AssetCode,
      da.BarcodeImage,
      s.StatusName,
      e.username AS CreatedByName

    FROM TB_T_DeviceAdd da

    JOIN TB_T_Device d
      ON da.DeviceID = d.DeviceID

    JOIN TB_M_DeviceStatus s 
      ON da.DVStatusID = s.DVStatusID

    LEFT JOIN TB_T_Employee e
      ON da.CreatedBy = e.EMPID

    WHERE d.ModelID = ?

    ORDER BY da.CreatedDate DESC
  `, [modelId]);


    res.render("admin/layout", {
    page: "device-list",
    devices,
    modelId,
    error: req.query.error || null,
    success: req.query.success || null
  });
});


router.get("/device/:modelId/item/add", async (req, res) => {
  const modelId = req.params.modelId;

  const [[model]] = await db.query(
    "SELECT * FROM TB_M_Model WHERE ModelID = ?",
    [modelId]
  );

  if (!model) return res.redirect("/admin/device");

  const [status] = await db.query(
    "SELECT * FROM TB_M_DeviceStatus"
  );

  res.render("admin/layout", {
    page: "device-listadd",
    active: "device",
    locals: { modelId, model, status }
  });
});



router.post(
  "/device/:modelId/item/add",
  uploadAsset.single("AssetImage"),
  async (req, res) => {

    const modelId = req.params.modelId;
    const { SerialNumber, AssetCode, DVStatusID } = req.body;

    // 🔹 หา DeviceID
    const [[device]] = await db.query(
      "SELECT DeviceID FROM TB_T_Device WHERE ModelID = ?",
      [modelId]
    );

    if (!device) return res.redirect("/admin/device");

    // 🔹 เช็ค Serial ซ้ำ
    const [dup] = await db.query(
      "SELECT 1 FROM TB_T_DeviceAdd WHERE SerialNumber = ?",
      [SerialNumber]
    );

    if (dup.length > 0) {
      const [[model]] = await db.query(
        "SELECT * FROM TB_M_Model WHERE ModelID = ?",
        [modelId]
      );
      const [status] = await db.query("SELECT * FROM TB_M_DeviceStatus");

      return res.render("admin/layout", {
        page: "device-listadd",
        active: "device",
        locals: {
          modelId,
          model,
          status,
          error: "Serial Number นี้มีอยู่แล้ว"
        }
      });
    }

    const imagePath = req.file ? req.file.filename : null;

    await db.query(
    `INSERT INTO TB_T_DeviceAdd
    (DeviceID, SerialNumber, AssetCode, DVStatusID, BarcodeImage, CreatedBy, CreatedDate)
    VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      device.DeviceID,
      SerialNumber,
      AssetCode,
      DVStatusID,
      imagePath,
      req.session.user.EMPID
    ]
  );

    res.redirect(`/admin/device/${modelId}?success=add`);

  }
);

// ============================
// แก้ไขเครื่องอุปกรณ์ (EDIT)
// ============================
router.get("/device/item/:id/edit", async (req, res) => {
  const id = req.params.id;

 const [[device]] = await db.query(`
  SELECT
    da.*,
    d.ModelID,
    s.StatusName
  FROM TB_T_DeviceAdd da
  JOIN TB_T_Device d
    ON da.DeviceID = d.DeviceID
  JOIN TB_M_DeviceStatus s
    ON da.DVStatusID = s.DVStatusID
  WHERE da.DVID = ?
`, [id]);

  if (!device) {
    return res.redirect("/admin/device");
  }

  const [statusList] = await db.query(`
    SELECT * FROM TB_M_DeviceStatus
  `);

  res.render("admin/layout", {
    page: "device_listedit",
    active: "device",
    locals: {
      device,
      statusList
    }
  });
});

router.post(
  "/device/item/:id/edit",
  uploadAsset.single("AssetImage"),
  async (req, res) => {

    const id = req.params.id;
    const { SerialNumber, AssetCode, DVStatusID } = req.body;

    let sql = `
      UPDATE TB_T_DeviceAdd
      SET
        SerialNumber = ?,
        AssetCode = ?,
        DVStatusID = ?,
        UpdatedDate = NOW()
    `;

    const params = [SerialNumber, AssetCode, DVStatusID];

    // ✅ ถ้ามีอัปโหลดรูปใหม่
    if (req.file) {
      sql += `, BarcodeImage = ?`;
      params.push(req.file.filename);
    }

    sql += ` WHERE DVID = ?`;
    params.push(id);

    await db.query(sql, params);

    // หา ModelID เพื่อ redirect กลับ
    const [[row]] = await db.query(
      "SELECT DeviceID FROM TB_T_DeviceAdd WHERE DVID = ?",
      [id]
    );

    const [[device]] = await db.query(
      "SELECT ModelID FROM TB_T_Device WHERE DeviceID = ?",
      [row.DeviceID]
    );

    res.redirect(`/admin/device/${device.ModelID}?success=edit`);
  }
);

router.get("/borrow", async (req, res) => {
  const [borrows] = await db.query(`
    SELECT
      bt.BorrowID,
      bt.BorrowCode,
      bt.BorrowStatusID,
      bt.EMPID, 
      DATE_FORMAT(bt.BorrowDate, '%d/%m/%Y %H:%i:%s') AS BorrowDate,
      bt.DueDate AS DueDateRaw,
      DATE_FORMAT(bt.DueDate, '%d/%m/%Y') AS DueDate,

      e.fname,
      e.lname,
      
      d.DeviceImage,
      d.DeviceName,
      da.AssetCode,
      da.DVID,
      da.DVStatusID,

      CASE
        WHEN bt.ReturnDate IS NULL 
            AND bt.BorrowStatusID IN (2,6)
            AND bt.DueDate < CURDATE()
        THEN 'เกินกำหนด'
        ELSE s.StatusName
      END AS StatusName,

      CONCAT(a.fname, ' ', a.lname) AS ActionBy,
      DATE_FORMAT(bt.ApproveDate, '%Y-%m-%d %H:%i') AS ActionDate,
     
      r.RepairID,

      (
        SELECT COUNT(*)
        FROM TB_T_BorrowTransaction x
        WHERE x.EMPID = bt.EMPID
          AND x.BorrowStatusID IN (1,2,6)
      ) AS activeBorrow,

      CASE
        WHEN bt.ReturnDate IS NULL
            AND bt.BorrowStatusID IN (2,6)
            AND bt.DueDate < CURDATE()
        THEN DATEDIFF(CURDATE(), bt.DueDate)
        ELSE 0
      END AS overdue_day


    FROM TB_T_BorrowTransaction bt
    JOIN TB_T_Employee e ON bt.EMPID = e.EMPID
    JOIN TB_T_DeviceAdd da ON bt.DVID = da.DVID
    JOIN TB_T_Device d ON da.DeviceID = d.DeviceID
    JOIN TB_M_BorrowStatus s ON bt.BorrowStatusID = s.BorrowStatusID

    LEFT JOIN TB_T_Employee a ON bt.ApproveBy = a.EMPID
    --  JOIN repair ที่ยังไม่จบ
    LEFT JOIN TB_T_Repair r
      ON da.DVID = r.DVID
      AND r.RepairStatusID IN (1,2)

    ORDER BY bt.BorrowDate DESC
  `);
  const today = new Date();
    today.setHours(0,0,0,0);

    borrows.forEach(b => {

      if (b.BorrowStatusID == 2) {
        b.statusText = "อนุมัติแล้ว";
        b.statusClass = "badge purple";
      }

      else if (b.BorrowStatusID == 6 && b.DueDate) {

        const due = new Date(b.DueDateRaw);
        due.setHours(0,0,0,0);

        const diffDays = Math.floor((due - today) / (1000*60*60*24));

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

      da.AssetCode,
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
            AND bt.ReturnDate > bt.DueDate
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

    FROM TB_T_BorrowTransaction bt
    JOIN TB_T_Employee e ON bt.EMPID = e.EMPID
    JOIN TB_T_DeviceAdd da ON bt.DVID = da.DVID
    JOIN TB_T_Device d ON da.DeviceID = d.DeviceID
    LEFT JOIN TB_M_Brand b ON d.BrandID = b.BrandID
    LEFT JOIN TB_M_Model m ON d.ModelID = m.ModelID
    JOIN TB_M_BorrowStatus s ON bt.BorrowStatusID = s.BorrowStatusID

    LEFT JOIN TB_T_Employee ea ON bt.ApproveBy = ea.EMPID
    LEFT JOIN TB_T_Employee er ON bt.ReturnBy = er.EMPID

    WHERE bt.BorrowCode = ?
  `, [code]);

  res.json(rows);
});

// อนุมัติการยืม
router.post("/borrow/approve/:id", async (req, res) => {
  const borrowId = req.params.id;
  const adminId = req.session.user.EMPID;

  try {

    // เปลี่ยนเป็น "อนุมัติแล้ว" (2)
    await db.query(`
      UPDATE TB_T_BorrowTransaction
      SET 
        BorrowStatusID = 2,
        ApproveBy = ?,
        ApproveDate = NOW()
      WHERE BorrowID = ?
    `, [adminId, borrowId]);

    res.redirect("/admin/borrow?success=approve");

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
      FROM TB_T_BorrowTransaction
      WHERE BorrowID = ?
    `, [borrowId]);

    if (!borrow || borrow.BorrowStatusID !== 6) {
      return res.redirect("/admin/borrow?error=invalid_return");
    }

    await db.query(`
      UPDATE TB_T_BorrowTransaction
      SET
        BorrowStatusID = 4,
        ReturnDate = NOW(),
        ReturnBy = ?
      WHERE BorrowID = ?
    `, [adminId, borrowId]);

    await db.query(`
      UPDATE TB_T_DeviceAdd
      SET
        DVStatusID = 1,
        UpdatedDate = NOW()
      WHERE DVID = ?
    `, [borrow.DVID]);

    res.redirect("/admin/borrow?success=return");

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
      FROM TB_T_BorrowTransaction
      WHERE BorrowID = ?
      FOR UPDATE
    `, [borrowId]);

    if (!borrow || borrow.BorrowStatusID !== 1) {
      return res.redirect("/admin/borrow?error=invalid_status");
    }

    // 1️⃣ ปฏิเสธการยืม
    await db.query(`
      UPDATE TB_T_BorrowTransaction
      SET
        BorrowStatusID = 3,
        Remark = ?,
        ApproveBy = ?,
        ApproveDate = NOW()
      WHERE BorrowID = ?
    `, [remark, adminId, borrowId]);

    // 2️⃣ 🔥 ตั้งค่าอุปกรณ์กลับเป็น "พร้อมใช้งาน"
    await db.query(`
      UPDATE TB_T_DeviceAdd
      SET
        DVStatusID = 1,
        UpdatedDate = NOW()
      WHERE DVID = ?
    `, [borrow.DVID]);

    res.redirect("/admin/borrow?success=reject");

  } catch (err) {
    console.error("REJECT ERROR:", err);
    res.redirect("/admin/borrow?error=reject");
  }
});

// ============================
// รายการแจ้งซ่อม (REPAIR LIST)
// ============================
router.get("/repair", async (req, res) => {
  let { status, success } = req.query;


if (status === undefined) {
  status = "1";
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

      da.AssetCode,
      d.DeviceName,
      d.DeviceImage,

      s.StatusName AS RepairStatusName,
      CONCAT(e.fname,' ',e.lname) AS CreateBy,
      r.Technician

    FROM TB_T_Repair r
    JOIN TB_T_DeviceAdd da ON r.DVID = da.DVID
    JOIN TB_T_Device d ON da.DeviceID = d.DeviceID
    JOIN TB_M_RepairStatus s ON r.RepairStatusID = s.RepairStatusID
    LEFT JOIN TB_T_Employee e ON r.EMPID = e.EMPID
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

  try {
    // 1️⃣ เช็กงานซ่อมค้าง
    const [[exists]] = await db.query(`
      SELECT RepairID
      FROM TB_T_Repair
      WHERE DVID = ?
        AND RepairStatusID IN (1, 2)
      LIMIT 1
    `, [dvid]);

    if (exists) {
      return res.redirect("/admin/borrow?error=repair_exists");
    }

    // 2️⃣ INSERT (ยังไม่ใส่ RepairCode)
    const [result] = await db.query(`
      INSERT INTO TB_T_Repair
        (DVID, EMPID, ProblemDetail, RepairStatusID, CreateDate)
      VALUES
        (?, ?, 'ส่งซ่อมโดยผู้ดูแลระบบ', 1, NOW())
    `, [dvid, adminId]);

    const repairID = result.insertId;

    // 3️⃣ สร้าง RepairCode
    const now = new Date();
    const repairCode =
      `RP-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}` +
      `-${String(repairID).padStart(4,'0')}`;

    // 4️⃣ UPDATE RepairCode
    await db.query(`
      UPDATE TB_T_Repair
      SET RepairCode = ?
      WHERE RepairID = ?
    `, [repairCode, repairID]);

    // 5️⃣ เปลี่ยนสถานะอุปกรณ์ → ซ่อม
    await db.query(`
      UPDATE TB_T_DeviceAdd
      SET
        DVStatusID = 3,
        UpdatedDate = NOW()
      WHERE DVID = ?
    `, [dvid]);

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
        da.AssetCode,
        da.SerialNumber,
        da.DVStatusID,

        d.DeviceName,
        d.DeviceImage,

        s.StatusName
      FROM TB_T_DeviceAdd da
      JOIN TB_T_Device d ON da.DeviceID = d.DeviceID
      JOIN TB_M_DeviceStatus s ON da.DVStatusID = s.DVStatusID
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
      da.AssetCode,
      da.SerialNumber,

      s.StatusName AS RepairStatusName,
      CONCAT(e.fname,' ',e.lname) AS CreateBy,
      r.Technician

    FROM TB_T_Repair r
    JOIN TB_T_DeviceAdd da ON r.DVID = da.DVID
    JOIN TB_T_Device d ON da.DeviceID = d.DeviceID
    JOIN TB_M_RepairStatus s ON r.RepairStatusID = s.RepairStatusID
    LEFT JOIN TB_T_Employee e ON r.EMPID = e.EMPID
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
      FROM TB_T_Employee
      WHERE EMPID = ?
    `, [adminId]);

    const adminName = `${admin.fname} ${admin.lname}`;

    await db.query(`
      UPDATE TB_T_Repair
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
      UPDATE TB_T_Repair
      SET
        RepairStatusID = 3,
        FinishDate = NOW()
      WHERE RepairID = ?
    `, [repairId]);

    // 2️⃣ คืนสถานะอุปกรณ์ → พร้อมใช้งาน
    await db.query(`
      UPDATE TB_T_DeviceAdd da
      JOIN TB_T_Repair r ON da.DVID = r.DVID
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
      FROM TB_T_Repair
      WHERE RepairID = ?
    `, [repairId]);

    if (!repair) {
      return res.redirect('/admin/repair?success=cancel');
    }

    // 2️⃣ อัปเดตสถานะการซ่อม → ยกเลิก
    await db.query(`
      UPDATE TB_T_Repair
      SET RepairStatusID = 4
      WHERE RepairID = ?
    `, [repairId]);

    // 3️⃣ คืนสถานะอุปกรณ์ → พร้อมใช้งาน
    await db.query(`
      UPDATE TB_T_DeviceAdd
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


router.get("/user/data/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    const [[user]] = await db.query(`
      SELECT
        e.EMPID,
        e.fname,
        e.lname,
        e.email,
        e.phone,
        e.fax,
        d.DepartmentName,
        i.InstitutionName,

        (
          SELECT COUNT(*)
          FROM TB_T_BorrowTransaction b
          WHERE b.EMPID = e.EMPID
          AND b.BorrowStatusID IN (1,2,6)
        ) AS activeBorrow

      FROM TB_T_Employee e
      LEFT JOIN TB_M_Department d ON e.DepartmentID = d.DepartmentID
      LEFT JOIN TB_M_Institution i ON e.InstitutionID = i.InstitutionID
      WHERE e.EMPID = ?
    `, [userId]);

    res.json(user);

  } catch (err) {
    console.error("USER DATA ERROR:", err);
    res.status(500).json({ error: "user_data_error" });
  }
});

/* ===============================
   REPORT
================================ */
router.get("/report", async (req, res) => {

  const [reports] = await db.query(`
    SELECT
      bt.BorrowCode,
      e.fname,
      e.lname,
      d.DeviceName,
      bt.BorrowDate,
      bt.ReturnDate
    FROM TB_T_BorrowTransaction bt
    JOIN TB_T_Employee e ON bt.EMPID = e.EMPID
    JOIN TB_T_DeviceAdd da ON bt.DVID = da.DVID
    JOIN TB_T_Device d ON da.DeviceID = d.DeviceID
  `);

  res.render("admin/layout", {
    page: "report",
    active: "report",
    reports
  });
});



module.exports = router;
