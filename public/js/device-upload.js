console.log("device-upload.js loaded");

document.addEventListener("DOMContentLoaded", () => {

  // รองรับทั้ง device_image และ asset_image
  const fileInput =
    document.getElementById("device_image") ||
    document.getElementById("asset_image");

  const preview = document.getElementById("preview");

  if (!fileInput || !preview) {
    console.warn("⚠️ ไม่พบ input หรือ preview (ข้ามหน้า)");
    return;
  }

  fileInput.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;

    // ตรวจชนิดไฟล์
    if (!file.type.startsWith("image/")) {
      alert("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      this.value = "";
      return;
    }

    // จำกัด 2MB
    if (file.size > 2 * 1024 * 1024) {
      alert("ไฟล์ต้องไม่เกิน 2MB");
      this.value = "";
      return;
    }

    // preview
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = "block";
    };
    reader.readAsDataURL(file);
  });

});
