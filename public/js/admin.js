/* ===============================
   LOAD PAGE (AJAX)
================================ */
function loadPage(page) {
  fetch(`/admin/page/${page}`)
    .then(res => res.text())
    .then(html => {
      document.getElementById("content").innerHTML = html;

      // 🔥 ต้องเรียกทุกครั้งหลังโหลดหน้าใหม่
      initAdminSearch();
    });
}

/* ===============================
   PROFILE DROPDOWN
================================ */
document.addEventListener("DOMContentLoaded", () => {
  const profileBtn = document.getElementById("profileBtn");
  const dropdown = document.getElementById("profileDropdown");

  if (!profileBtn || !dropdown) return;

  profileBtn.addEventListener("click", e => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
  });

  document.addEventListener("click", () => {
    dropdown.classList.remove("show");
  });
});

/* ===============================
   SIDEBAR TOGGLE
================================ */
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");

  if (!btn || !sidebar) return;

  btn.addEventListener("click", () => {
    sidebar.classList.toggle("expand");
  });
});

/* ===============================
   PROFILE IMAGE PREVIEW
================================ */
document.addEventListener("change", e => {
  if (e.target.id !== "profileUpload") return;

  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("กรุณาเลือกรูปภาพเท่านั้น");
    e.target.value = "";
    return;
  }

  const previewProfile = document.getElementById("previewImg");
  const sidebarAvatar = document.getElementById("sidebarAvatar");

  const reader = new FileReader();
  reader.onload = ev => {
    if (previewProfile) previewProfile.src = ev.target.result;
    if (sidebarAvatar) sidebarAvatar.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

/* ===============================
   ADMIN SEARCH (ใช้ทุกหน้า)
================================ */
function initAdminSearch() {
  const searchInputs = document.querySelectorAll(".admin-search");
  if (!searchInputs.length) return;

  searchInputs.forEach(input => {
    const targetSelector = input.dataset.target;
    if (!targetSelector) return;

    const rows = document.querySelectorAll(targetSelector);
    if (!rows.length) return;

    input.addEventListener("input", () => {
      const keyword = input.value.toLowerCase();

    rows.forEach(row => {
      
        if (row.dataset.visible === "false") return;

        row.style.display =
          row.innerText.toLowerCase().includes(keyword)
            ? ""
            : "none";
      });
    });
  });
}

/* ===============================
   INIT FIRST LOAD
================================ */
document.addEventListener("DOMContentLoaded", () => {
  initAdminSearch();
});

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".borrow-tabs .tab");
  const rows = document.querySelectorAll(".borrow_list-row");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    const status = tab.dataset.status;

    rows.forEach(row => {
      if (status === "all" || row.dataset.status === status) {
        row.dataset.visible = "true";
        row.style.display = "";
      } else {
        row.dataset.visible = "false";
        row.style.display = "none";
      }
    });
    
    document.querySelectorAll(".admin-search").forEach(i => i.value = "");
  });
});

  // default = รออนุมัติ
  document.querySelector('.tab[data-status="1"]')?.click();
});
