console.log("admin-device.js loaded");

let deleteId = null;
let deleteType = null;

document.addEventListener("DOMContentLoaded", () => {

  /* ===============================
     SUCCESS + ERROR FROM URL
  ================================ */
  handleQueryStatus();


  /* ===============================
     DELETE MODAL
  ================================ */
  const deleteModal = document.getElementById("deleteModal");
  const confirmBtn = document.getElementById("confirmDeleteBtn");
  const cancelBtn = document.querySelector(".btn-cancel");

  document.querySelectorAll(".btn-icon.del").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      deleteId = btn.dataset.id;
      deleteType = btn.dataset.type;
      deleteModal?.classList.add("show");
    });
  });

  confirmBtn?.addEventListener("click", () => {
    if (!deleteId || !deleteType) return;

    if (deleteType === "model") {
      window.location.href = `/admin/device/model/delete/${deleteId}`;
    }

    if (deleteType === "item") {
      window.location.href = `/admin/device/item/${deleteId}/delete`;
    }
  });

  cancelBtn?.addEventListener("click", () => {
    deleteModal?.classList.remove("show");
  });

  deleteModal?.addEventListener("click", e => {
    if (e.target === deleteModal) {
      deleteModal.classList.remove("show");
    }
  });


  /* ===============================
     IMAGE CLICK
  ================================ */
  document.querySelectorAll(".device-img.clickable").forEach(img => {
    img.addEventListener("click", () => {
      const src = img.dataset.src;
      if (src) openImageModal(src);
    });
  });


  /* ===============================
     IMAGE MODAL CLOSE
  ================================ */
  const imageModal = document.getElementById("imageModal");
  const closeImageBtn = document.getElementById("closeImageModal");
  const modalImg = document.getElementById("modalImage");

  closeImageBtn?.addEventListener("click", () => imageModal.style.display = "none");
  imageModal?.addEventListener("click", () => imageModal.style.display = "none");
  modalImg?.addEventListener("click", e => e.stopPropagation());


  /* ===============================
     BRAND → MODEL SELECT
  ================================ */
  const brandSelect = document.getElementById("brandSelect");
  const modelSelect = document.getElementById("modelSelect");

  if (brandSelect && modelSelect) {
    brandSelect.addEventListener("change", async () => {
      const brandId = brandSelect.value;

      modelSelect.innerHTML = `<option value="">เลือกรุ่น</option>`;
      modelSelect.disabled = true;

      if (!brandId) return;

      try {
        const res = await fetch(`/admin/device/models/${brandId}`);
        const models = await res.json();

        models.forEach(m => {
          const opt = document.createElement("option");
          opt.value = m.ModelID;
          opt.textContent = m.ModelName;
          modelSelect.appendChild(opt);
        });

        modelSelect.disabled = models.length === 0;

      } catch (err) {
        console.error("โหลดรุ่นไม่สำเร็จ", err);
      }
    });
  }


  /* ===============================
     BACK BUTTON
  ================================ */
  const backBtn = document.getElementById("btnBack");

  backBtn?.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else window.location.href = "/admin/device";
  });


  /* ===============================
     SUCCESS ACTION (APPROVE / REPAIR)
  ================================ */
  document.querySelectorAll(".js-success-action").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();

      const type = btn.dataset.type || "approve";
      const url = btn.getAttribute("href");

      showSuccessModal(type);

      setTimeout(() => {
        window.location.href = url;
      }, 1200);
    });
  });

});


/* ===============================
   HANDLE SUCCESS / ERROR FROM URL
================================ */
function handleQueryStatus() {

  const params = new URLSearchParams(window.location.search);

  const success = params.get("success");
  const error = params.get("error");

  if (success) {
    setTimeout(() => {
      showSuccessModal(success);
      window.history.replaceState({}, document.title, window.location.pathname);
    }, 50);
  }

  if (error === "used") {
    const toast = document.getElementById("errorToast");
    if (toast) {
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 3000);
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}


/* ===============================
   IMAGE MODAL (GLOBAL)
================================ */
window.openImageModal = function (src) {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("modalImage");

  if (!modal || !img) return;

  img.src = src;
  modal.style.display = "flex";
};

window.closeImageModal = function () {
  const modal = document.getElementById("imageModal");
  if (modal) modal.style.display = "none";
};


/* ===============================
   SUCCESS MODAL
================================ */
window.showSuccessModal = function (type) {

  const modal = document.getElementById("successModal");
  if (!modal) return;

  const title = document.getElementById("successTitle");
  const desc = document.getElementById("successDesc");

  const successIcon = modal.querySelector(".check-wrapper.success");
  const errorIcon = modal.querySelector(".check-wrapper.danger");

  /* ===============================
     TEXT MAP
  ================================ */

  const map = {
    add: ["บันทึกสำเร็จ", "เพิ่มอุปกรณ์เรียบร้อยแล้ว"],
    edit: ["บันทึกสำเร็จ", "ข้อมูลถูกแก้ไขเรียบร้อยแล้ว"],
    delete: ["ลบสำเร็จ", "ลบข้อมูลเรียบร้อยแล้ว"],
    approve: ["อนุมัติสำเร็จ", "อนุมัติรายการเรียบร้อยแล้ว"],
    reject: ["ปฏิเสธสำเร็จ", "ปฏิเสธรายการยืมเรียบร้อยแล้ว"],
    return: ["คืนอุปกรณ์สำเร็จ", "อุปกรณ์ถูกคืนเข้าสู่ระบบเรียบร้อยแล้ว"],
    cancel: ["ยกเลิกสำเร็จ", "คำสั่งซ่อมถูกยกเลิกเรียบร้อยแล้ว"],
    start: ["รับงานสำเร็จ", "ระบบบันทึกการรับงานเรียบร้อยแล้ว"],
    finish: ["ซ่อมเสร็จแล้ว", "อัปเดตสถานะเป็นซ่อมเสร็จเรียบร้อย"],
    create: ["ส่งซ่อมสำเร็จ", "ระบบบันทึกการส่งซ่อมเรียบร้อยแล้ว"],
    error: ["เกิดข้อผิดพลาด", "กรุณาลองใหม่อีกครั้ง"]
  };

  /* ===============================
     SET TEXT
  ================================ */

  if (map[type]) {
    title.textContent = map[type][0];
    desc.textContent = map[type][1];
  }

  /* ===============================
     SWITCH ICON
  ================================ */

  if (successIcon) successIcon.style.display = "none";
  if (errorIcon) errorIcon.style.display = "none";

  if (type === "error") {

    if (errorIcon) errorIcon.style.display = "flex";

  } else {

    if (successIcon) successIcon.style.display = "flex";

  }

  /* ===============================
     SHOW MODAL
  ================================ */

  modal.classList.remove("show");
  void modal.offsetWidth;
  modal.classList.add("show");

  setTimeout(() => {
    modal.classList.remove("show");
  }, 2000);
};


