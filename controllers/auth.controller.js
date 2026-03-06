const transporter = require("../config/mailer");
const db = require("../config/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

// ================= REGISTER =================
exports.register = async (req, res) => {
  try {

    /* ===============================
       1. รับค่าจากฟอร์ม
    ================================ */
    const {
      username,
      password,
      confirm,
      fname,
      lname,
      EMP_NUM,
      email,
      phone,
      fax,
      InstitutionID,
      DepartmentID
    } = req.body;

    /* ===============================
       2. ตรวจข้อมูลจำเป็น
    ================================ */
    if (
      !username ||
      !password ||
      !confirm ||
      !fname ||
      !lname ||
      !EMP_NUM ||
      !email ||
      !phone ||
      !InstitutionID ||
      !DepartmentID
    ) {
      return res.send("กรอกข้อมูลไม่ครบ");
    }

    if (password !== confirm) {
      return res.send("รหัสผ่านไม่ตรงกัน");
    }
    
    const passwordRule =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordRule.test(password)) {
      return res.render("register", {
        error: "รหัสผ่านต้องมี 8 ตัวขึ้นไป และต้องมี A-Z a-z 0-9 และอักขระพิเศษ",
        form: req.body
      });
}

    /* ===============================
       3. ตรวจ username / email ซ้ำ
    ================================ */
    const [exist] = await db.execute(
      "SELECT EMPID FROM TB_T_Employee WHERE username=? OR email=?",
      [username, email]
    );

    if (exist.length > 0) {
    return res.render("register", {
      error: "❌ มีผู้ใช้นี้ในระบบแล้ว",
      form: req.body
    });
}

    /* ===============================
       4. hash password
    ================================ */
    const hash = await bcrypt.hash(password, 10);

    /* ===============================
       5. จัดการรูปโปรไฟล์
    ================================ */
    const profileImage = req.file
      ? "/uploads/" + req.file.filename
      : "/images/default-avatar.svg";

    /* ===============================
       6. บันทึกลงฐานข้อมูล
    ================================ */
    await db.execute(
      `
      INSERT INTO TB_T_Employee
      (
        username,
        password,
        fname,
        lname,
        EMP_NUM,
        email,
        phone,
        fax,
        InstitutionID,
        DepartmentID,
        ProfileImage,
        RoleID,
        EMPStatusID,
        CreateDate
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
      `,
      [
        username,
        hash,
        fname,
        lname,
        EMP_NUM,
        email,
        phone,
        fax,
        InstitutionID,
        DepartmentID,
        profileImage,
        1, // user
        1  // active
      ]
    );

    /* ===============================
       7. เสร็จ → ไป login
    ================================ */
    res.redirect("/login");

  } catch (err) {
    console.error(err);
    res.send("Register error");
  }
};


// ================= LOGIN =================
exports.login = async (req, res) => {
  try {

    const { username, password } = req.body;

    // หา user
    const [rows] = await db.execute(
      "SELECT * FROM TB_T_Employee WHERE username=?",
      [username]
    );

    // ❌ ไม่พบ username
    if (rows.length === 0) {
      return res.render("login", {
        error: "❌ ไม่พบชื่อผู้ใช้นี้ในระบบ",
        form: req.body
      });
    }

    const user = rows[0];

    if (user.EMPStatusID == 0) {
      return res.render("login", {
        error: "⛔ บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อ Admin",
        form: req.body
      });
    }

    // ตรวจ password
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.render("login", {
        error: "❌ รหัสผ่านไม่ถูกต้อง",
        form: req.body
      });
    }

    // login สำเร็จ
    req.session.user = {
      EMPID: user.EMPID,
      RoleID: user.RoleID,
      username: user.username,
      ProfileImage: user.ProfileImage
    };

    if (user.RoleID == 2) {
      return res.redirect("/admin");
    } else {
      return res.redirect("/user");
    }

  } catch (err) {

    console.error(err);

    res.render("login", {
      error: "⚠️ ระบบขัดข้อง กรุณาลองใหม่"
    });

  }
};


// ================= FORGOT (OTP) =================
exports.forgot = async (req, res) => {
  try {
    const { email } = req.body;

    const [rows] = await db.execute(
      "SELECT EMPID FROM TB_T_Employee WHERE email=?",
      [email]
    );

    // ❌ ไม่พบ email
    if (rows.length === 0) {
      return res.render("forgot", {
        error: "❌ ไม่พบอีเมลนี้ในระบบ",
        form: req.body
      });
    }

    // ✅ สร้าง OTP 6 หลัก
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashOtp = await bcrypt.hash(otp, 10);

    await db.execute(
      `
      UPDATE TB_T_Employee
      SET reset_otp = ?,
          reset_expire = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
          otp_attempt = 0
      WHERE email = ?
      `,
      [hashOtp, email]
    );

    // ✅ ส่งอีเมล
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "OTP Reset Password",
      html: `
        <h2>รหัส OTP สำหรับรีเซ็ตรหัสผ่าน</h2>
        <h1>${otp}</h1>
        <p>หมดอายุภายใน 10 นาที</p>
      `
    });

    // ✅ ไปหน้า OTP
    res.render("otp", { email });

  } catch (err) {
    console.error(err);

    res.render("forgot", {
      error: "⚠️ ไม่สามารถส่ง OTP ได้ กรุณาลองใหม่",
    });
  }
};


// ================= VERIFY OTP =================
exports.verifyOtp = async (req, res) => {
  try {
    const email = req.body.email;
    const otp = String(req.body.otp || "").trim();

    const [rows] = await db.execute(
      `
      SELECT *
      FROM TB_T_Employee
      WHERE email=?
        AND reset_expire > NOW()
      `,
      [email]
    );

    // ❌ OTP หมดอายุ หรือไม่พบข้อมูล
    if (rows.length === 0) {
      return res.render("otp", {
        email,
        error: "❌ OTP หมดอายุ กรุณากดขอใหม่อีกครั้ง"
      });
    }

    const user = rows[0];

    // ❌ ใส่ผิดเกิน 5 ครั้ง
    if (user.otp_attempt >= 5) {
      return res.render("otp", {
        email,
        error: "❌ กรอก OTP ผิดเกิน 5 ครั้ง กรุณาขอ OTP ใหม่"
      });
    }

    const match = await bcrypt.compare(otp, user.reset_otp);

    // ❌ OTP ไม่ถูกต้อง
    if (!match) {
      await db.execute(
        `
        UPDATE TB_T_Employee
        SET otp_attempt = otp_attempt + 1
        WHERE email=?
        `,
        [email]
      );

      return res.render("otp", {
        email,
        error: "❌ OTP ไม่ถูกต้อง"
      });
    }

    // ✅ ผ่าน OTP
    await db.execute(
      `
      UPDATE TB_T_Employee
      SET reset_otp=NULL,
          reset_expire=NULL,
          otp_attempt=0
      WHERE email=?
      `,
      [email]
    );

    // เก็บ email สำหรับ reset password
    req.session.resetEmail = email;

    return res.redirect("/reset-password");

  } catch (err) {
    console.error(err);

    return res.render("otp", {
      email: req.body.email,
      error: "⚠️ ระบบขัดข้อง กรุณาลองใหม่"
    });
  }
};


// ================= RESET =================
exports.resetPassword = async (req, res) => {
  try {
    const { password, confirm } = req.body;
    const email = req.session.resetEmail;

    // ❌ ไม่มี session
    if (!email) {
      return res.redirect("/forgot");
    }

    // ❌ รหัสผ่านสั้น
    const passwordRule =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordRule.test(password)) {
      return res.render("reset-password", {
        error: "รหัสผ่านต้องมี 8 ตัวขึ้นไป และต้องมี A-Z a-z 0-9 และอักขระพิเศษ"
      });
    }

    // ❌ รหัสผ่านไม่ตรงกัน
    if (password !== confirm) {
      return res.render("reset-password", {
        error: "❌ รหัสผ่านไม่ตรงกัน"
      });
    }

    const hash = await bcrypt.hash(password, 10);

    await db.execute(
      `UPDATE TB_T_Employee
       SET password=?
       WHERE email=?`,
      [hash, email]
    );

    // ✅ ล้าง session OTP
    delete req.session.resetEmail;

    // ✅ เด้งข้อความสำเร็จหน้า login
    return res.render("login", {
      success: "✅ เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ"
    });

  } catch (err) {
    console.error(err);

    res.render("reset-password", {
      error: "⚠️ ระบบขัดข้อง กรุณาลองใหม่"
    });
  }
};


/* ===============================
   MASTER DATA
================================ */

exports.getInstitutions = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT InstitutionID, InstitutionName FROM TB_M_Institution"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
};

exports.getDepartments = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DepartmentID, DepartmentName FROM TB_M_Department"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
};
