console.log("profile_edit.js loaded");

/* ===============================
   PROFILE IMAGE PREVIEW
================================ */
document.addEventListener("change", function (e) {
  if (e.target.id !== "profileUpload") return;

  const file = e.target.files[0];
  const previewImg = document.getElementById("previewImg");

  if (!file || !previewImg) return;

  if (!file.type.startsWith("image/")) {
    alert("กรุณาเลือกรูปภาพเท่านั้น");
    e.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = ev => previewImg.src = ev.target.result;
  reader.readAsDataURL(file);
});

/* ===============================
   DEVICE IMAGE UPLOAD (SAFE)
================================ */
const fileInput = document.getElementById("device_image");
const uploadBtn = document.querySelector(".upload-btn");
const preview = document.getElementById("preview");

if (fileInput && uploadBtn && preview) {
  fileInput.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;

    // ตรวจชนิดไฟล์
    if (!file.type.startsWith("image/")) {
      alert("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      this.value = "";
      return;
    }

    // ตรวจขนาด (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert("ไฟล์ต้องไม่เกิน 2MB");
      this.value = "";
      return;
    }

    uploadBtn.classList.add("active");
    uploadBtn.querySelector("span").innerText = file.name;

    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = "block";
    };
    reader.readAsDataURL(file);
  });
} else {
  console.warn("⚠️ device image upload elements not found (skip)");
}
