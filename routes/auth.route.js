const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const uploadProfile = require("../middleware/uploadProfile");
const db = require("../config/db"); 


/* ===========================
        PAGE
=========================== */
router.get("/login", (req, res) => res.render("login"));
router.get("/register", (req, res) => res.render("register"));
router.get("/forgot", (req, res) => {res.render("forgot", {});});
router.get("/otp", (req, res) => res.render("otp"));
router.get("/reset", (req, res) => res.render("reset"));

/* ===========================
        API
=========================== */
router.get("/api/institutions", authController.getInstitutions);
router.get("/api/departments", authController.getDepartments);

/* ===========================
        ACTION
=========================== */
router.post("/login", authController.login);

router.post(
  "/register",
  uploadProfile.single("image"),     
  authController.register
);

router.post("/forgot", authController.forgot);
router.post("/verify-otp", authController.verifyOtp);

/* ===========================
        RESET PASSWORD
=========================== */
router.get("/reset-password", (req, res) => {
  if (!req.session.resetEmail) {
    return res.redirect("/forgot");
  }

  res.render("reset-password", {
    email: req.session.resetEmail
  });
});

router.post("/reset-password", authController.resetPassword);

/* ===========================
        EXPORT
=========================== */
module.exports = router;

