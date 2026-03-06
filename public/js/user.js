document.addEventListener("DOMContentLoaded", () => {

  /* ===============================
     FILTER DEVICE
  =============================== */
  const categoryCards = document.querySelectorAll(".category .card");
  const deviceCards = document.querySelectorAll(".device-card");
  const searchInput = document.querySelector(".search input");

  let activeType = null;
  let searchText = "";

  function applyFilter() {
    deviceCards.forEach(device => {
      const deviceType = device.dataset.type;
      const deviceText = device.innerText.toLowerCase();

      const matchType = !activeType || deviceType === activeType;
      const matchSearch = deviceText.includes(searchText);

      device.style.display = matchType && matchSearch ? "flex" : "none";
    });
  }

  categoryCards.forEach(card => {
    card.addEventListener("click", () => {
      const selectedType = card.dataset.type;

      if (activeType === selectedType) {
        activeType = null;
        categoryCards.forEach(c => c.classList.remove("active"));
      } else {
        activeType = selectedType;
        categoryCards.forEach(c => c.classList.remove("active"));
        card.classList.add("active");
      }

      applyFilter();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", e => {
      searchText = e.target.value.trim().toLowerCase();
      applyFilter();
    });
  }

/* ===============================
   SUCCESS MODAL (อ่านจาก body)
================================ */
const success = document.body.dataset.success;

if (success === "borrow") {
  showSuccessModal("borrow");
}

if (success === "edit") {
  showSuccessModal("edit");
}

if (success === "success") {
  showSuccessModal("success");
}

if (success === "cancel") {
  showSuccessModal("cancel");
}

if (success === "password") {
  showSuccessModal("password");
}
  /* ===============================
     PROFILE DROPDOWN
  =============================== */
  const profileBtn = document.getElementById("sidebarAvatar");
  const dropdown = document.getElementById("profileDropdown");

  if (profileBtn && dropdown) {
    profileBtn.addEventListener("click", e => {
      e.stopPropagation();
      dropdown.classList.toggle("show");
    });

    document.addEventListener("click", () => {
      dropdown.classList.remove("show");
    });
  }

  /* ===============================
     SIDEBAR TOGGLE
  =============================== */
  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");

  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("expand");
    });
  }
});

/* ===============================
   MODAL FUNCTION
================================ */
function showSuccessModal(type = "edit") {
  const modal = document.getElementById("successModal");
  if (!modal) return;

  const title = modal.querySelector("h2");
  const desc = modal.querySelector("p");

  if (type === "borrow") {
    title.textContent = "ส่งคำขอยืมสำเร็จ";
    desc.textContent = "ระบบได้รับคำขอเรียบร้อยแล้ว";
  }

  if (type === "edit") {
    title.textContent = "บันทึกสำเร็จ";
    desc.textContent = "ข้อมูลถูกแก้ไขเรียบร้อยแล้ว";
  }

  if (type === "success") {
    title.textContent = "รับทราบเรียบร้อย";
    desc.textContent = "รายการถูกย้ายไปกำลังยืมแล้ว";
  }

  if (type === "cancel") {
    title.textContent = "ยกเลิกสำเร็จ";
    desc.textContent = "คำขอถูกยกเลิกเรียบร้อยแล้ว";
  }

  if (type === "password") {
  title.textContent = "เปลี่ยนรหัสผ่านสำเร็จ";
  desc.textContent = "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว";
  }

  modal.classList.add("show");
  setTimeout(() => modal.classList.remove("show"), 2000);
}

/* ===============================
   PROFILE IMAGE PREVIEW
================================ */
document.addEventListener("change", e => {
  if (e.target.id !== "profileUpload") return;

  const file = e.target.files[0];
  if (!file || !file.type.startsWith("image/")) return;

  const previewProfile = document.getElementById("previewImg");
  const sidebarAvatar = document.getElementById("sidebarAvatar");

  const reader = new FileReader();
  reader.onload = ev => {
    if (previewProfile) previewProfile.src = ev.target.result;
    if (sidebarAvatar) sidebarAvatar.src = ev.target.result;
  };

  reader.readAsDataURL(file);
});

