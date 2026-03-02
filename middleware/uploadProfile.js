const multer = require("multer");
const path = require("path");
const fs = require("fs");

// path folder upload
const uploadPath = path.join(__dirname, "../public/uploads/profile");

// สร้าง folder ถ้ายังไม่มี
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {

    const ext = path.extname(file.originalname);

    const filename =
      "emp_" +
      Date.now() +
      ext;

    cb(null, filename);

  }

});

module.exports = multer({
  storage
});
