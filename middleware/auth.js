const db = require("../config/db");

exports.isLogin = async (req, res, next) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  try {

    const [rows] = await db.execute(
      "SELECT EMPStatusID FROM TB_T_Employee WHERE EMPID=?",
      [req.session.user.EMPID]
    );

    if (rows.length === 0) {
      req.session.destroy();
      return res.redirect("/login");
    }

    const user = rows[0];

    if (user.EMPStatusID == 0) {

      req.session.destroy();

      return res.render("login", {
        error: "⛔ บัญชีของคุณถูกระงับการใช้งาน"
      });

    }

    next();

  } catch (err) {

    console.error(err);
    return res.redirect("/login");

  }

};


exports.isAdmin = async (req, res, next) => {

  if (!req.session.user)
    return res.redirect("/login");

  try {

    const [rows] = await db.execute(
      "SELECT EMPStatusID, RoleID FROM TB_T_Employee WHERE EMPID=?",
      [req.session.user.EMPID]
    );

    if (rows.length === 0) {
      req.session.destroy();
      return res.redirect("/login");
    }

    const user = rows[0];

    if (user.EMPStatusID == 0) {

      req.session.destroy();

      return res.render("login", {
        error: "⛔ บัญชีของคุณถูกระงับการใช้งาน"
      });

    }

    if (user.RoleID !== 2)
      return res.status(403).send("Admin only");

    next();

  } catch (err) {

    console.error(err);
    return res.redirect("/login");

  }

};