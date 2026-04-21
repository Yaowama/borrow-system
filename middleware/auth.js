const db = require("../config/db");

exports.isLogin = async (req, res, next) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  try {

    const [rows] = await db.execute(
      "SELECT EMPStatusID FROM tb_t_employee WHERE EMPID=?",
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
      "SELECT EMPStatusID, RoleID FROM tb_t_employee WHERE EMPID=?",
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

async function check2FAWarning(req, res, next) {
  try {
    const EMPID = req.session.user.EMPID;

    const [[emp]] = await db.query(`
      SELECT two_fa_enabled, two_fa_dismissed
      FROM tb_t_employee
      WHERE EMPID = ?
    `, [EMPID]);

    let show2faWarning = false;

    if (emp.two_fa_enabled == 0) {
      if (!emp.two_fa_dismissed) {
        show2faWarning = true;
      } else {
        const now = new Date();
        const dismissed = new Date(emp.two_fa_dismissed);
        const diffDays = (now - dismissed) / (1000 * 60 * 60 * 24);

        if (diffDays > 10) {
          show2faWarning = true;
        }
      }
    }

    res.locals.show2faWarning = show2faWarning;

    next();

  } catch (err) {
    console.error(err);
    next();
  }
}

exports.check2FAWarning = check2FAWarning;