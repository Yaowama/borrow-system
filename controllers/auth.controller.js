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
      ? req.file.filename
      : "default-avatar.svg";
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

    const [rows] = await db.execute(
      "SELECT * FROM TB_T_Employee WHERE username=?",
      [username]
    );

    if (rows.length === 0) {
      return res.render("login", {
        error: "❌ ไม่พบชื่อผู้ใช้นี้ในระบบ",
        form: req.body
      });
    }

    const user = rows[0];

    if (user.EMPStatusID == 0) {
      return res.render("login", {
        error: "⛔ บัญชีนี้ถูกปิดใช้งาน",
        form: req.body
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.render("login", {
        error: "❌ รหัสผ่านไม่ถูกต้อง",
        form: req.body
      });
    }

    // ===============================
    // ❗ ถ้าไม่เปิด 2FA → เข้าเลย
    // ===============================
    if (user.two_fa_enabled == 0) {
      req.session.user = {
        EMPID: user.EMPID,
        RoleID: user.RoleID,
        username: user.username,
        email: user.email,
        ProfileImage: user.ProfileImage
      };

      if (user.RoleID == 2) return res.redirect("/admin");
      return res.redirect("/user");
    }

    // ===============================
    // 🔐 ถ้าเปิด 2FA → สร้าง OTP
    // ===============================
    req.session.tempUser = {
      EMPID: user.EMPID,
      RoleID: user.RoleID,
      username: user.username,
      email: user.email,
      ProfileImage: user.ProfileImage
    };

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashOtp = await bcrypt.hash(otp, 10);

    await db.execute(`
      UPDATE TB_T_Employee
      SET login_otp = ?,
          login_expire = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
          login_attempt = 0
      WHERE EMPID = ?
    `, [hashOtp, user.EMPID]);

    await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: user.email,
    subject: "Login OTP - ยืนยันการเข้าสู่ระบบ",
    html: `
    <div style="font-family:Arial,sans-serif;background:#f4f6f8;padding:30px;">
      <div style="max-width:420px;margin:auto;background:#ffffff;padding:30px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.1);">

        <h2 style="text-align:center;color:#f97316;margin-bottom:10px;">
          🔐 ยืนยันการเข้าสู่ระบบ
        </h2>

        <p style="text-align:center;color:#555;font-size:14px;">
          มีการเข้าสู่ระบบด้วยบัญชีของคุณ<br>
          กรุณายืนยันตัวตนด้วยรหัส OTP ด้านล่าง
        </p>

        <div style="text-align:center;margin:25px 0;">
          <div style="
            display:inline-block;
            padding:14px 26px;
            font-size:30px;
            letter-spacing:6px;
            background:#fff7ed;
            color:#c2570a;
            border-radius:10px;
            font-weight:bold;
            border:2px solid #fed7aa;
          ">
            ${otp}
          </div>
        </div>

        <p style="text-align:center;color:#ef4444;font-size:13px;">
          ⏱ รหัสนี้จะหมดอายุภายใน <b>5 นาที</b>
        </p>

        <hr style="margin:20px 0;border:none;border-top:1px solid #eee;" />

        <p style="text-align:center;color:#999;font-size:12px;">
          หากคุณไม่ได้ทำการเข้าสู่ระบบ กรุณาเปลี่ยนรหัสผ่านทันที
        </p>

      </div>
    </div>
    `
  });

    return res.render("otp-login", {
      email: user.email,
      mode: "login"
    });

  } catch (err) {
    console.error(err);
    res.render("login", {
      error: "⚠️ ระบบขัดข้อง กรุณาลองใหม่"
    });
  }
};
exports.verifyLoginOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const [rows] = await db.execute(`
      SELECT * FROM TB_T_Employee
      WHERE email=? AND login_expire > NOW() AND login_otp IS NOT NULL
    `, [email]);

    if (rows.length === 0) {
      return res.render("otp-login", {
        email,
        error: "OTP หมดอายุ"
      });
    }

    const user = rows[0];

    const match = await bcrypt.compare(otp, user.login_otp);

    if (!match) {
      await db.execute(`
        UPDATE TB_T_Employee
        SET login_attempt = login_attempt + 1
        WHERE email=?
      `, [email]);

      return res.render("otp-login", {
        email,
        error: "OTP ไม่ถูกต้อง"
      });
    }

    await db.execute(`
      UPDATE TB_T_Employee
      SET login_otp=NULL,
          login_expire=NULL,
          login_attempt=0
      WHERE email=?
    `, [email]);

    req.session.user = req.session.tempUser;
    delete req.session.tempUser;

    if (req.session.user.RoleID == 2) return res.redirect("/admin");
    return res.redirect("/user");

  } catch (err) {
    console.error(err);
    res.render("otp-login", {
      email: req.body.email,
      error: "ระบบผิดพลาด"
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
      <div style="font-family:Arial,sans-serif;background:#f4f6f8;padding:30px;">
        <div style="max-width:420px;margin:auto;background:#ffffff;padding:30px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.1);">

          <h2 style="text-align:center;color:#4f46e5;margin-bottom:10px;">
            🔐 OTP ยืนยันตัวตน
          </h2>

          <p style="text-align:center;color:#555;font-size:14px;">
            ใช้รหัสด้านล่างเพื่อรีเซ็ตรหัสผ่าน
          </p>

          <div style="text-align:center;margin:25px 0;">
            <div style="
              display:inline-block;
              padding:14px 26px;
              font-size:30px;
              letter-spacing:6px;
              background:#eef2ff;
              color:#111827;
              border-radius:10px;
              font-weight:bold;
            ">
              ${otp}
            </div>
          </div>

          <p style="text-align:center;color:#ef4444;font-size:13px;">
            ⏱ รหัสนี้จะหมดอายุภายใน <b>10 นาที</b>
          </p>

          <hr style="margin:20px 0;border:none;border-top:1px solid #eee;" />

          <p style="text-align:center;color:#999;font-size:12px;">
            หากคุณไม่ได้ร้องขอรหัสนี้ กรุณาเพิกเฉยต่ออีเมลนี้
          </p>

        </div>
      </div>
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
          login_attempt=0
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
    const { password } = req.body;
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

    const hash = await bcrypt.hash(password, 10);

    await db.execute(
      `UPDATE TB_T_Employee
       SET password=?
       WHERE email=?`,
      [hash, email]
    );

    delete req.session.resetEmail;

    return res.render("login", {
      success: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ"
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
