exports.register = async (req, res) => {

    console.log(req.body); // ✅ จะไม่ undefined แล้ว
    console.log(req.file); // รูป
    
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

  const image = req.file?.filename || null;

  // 1. password match
  if (password !== confirm) {
    return res.render("register", {
      error: "Password not match"
    });
  }

  // 2. check duplicate
  const [exists] = await db.query(
    "SELECT 1 FROM TB_T_Employee WHERE email = ? OR EMP_NUM = ?",
    [email, EMP_NUM]
  );

  if (exists.length > 0) {
    return res.render("register", {
      error: "Email หรือรหัสพนักงานซ้ำ"
    });
  }

  // 3. hash password
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash(password, 10);

  // 4. insert
  await db.query(`
    INSERT INTO TB_T_Employee
    (
      fname,lname,username,
      EMP_NUM,email,password,
      phone,fax,
      InstitutionID,DepartmentID,
      RoleID,EMPStatusID,
      CreateDate,CreateBy
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,1,2,NOW(),'SYSTEM')
  `, [
    fname, lname, username,
    EMP_NUM, email, hash,
    phone, fax,
    InstitutionID, DepartmentID
  ]);

  res.redirect("/login");
};
