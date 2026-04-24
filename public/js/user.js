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

// 👉 ไปหน้า profile
const btnGoProfile = document.getElementById("btnGoProfile");

if (btnGoProfile) {
  btnGoProfile.addEventListener("click", () => {
    window.location.href = "/user/profile";
  });
}

// 👉 dismiss banner
const btnDismiss2FA = document.getElementById("btnDismiss2FA");

if (btnDismiss2FA) {
  btnDismiss2FA.addEventListener("click", async () => {
    try {
      await fetch('/user/dismiss-2fa-banner', { method: 'POST' });

      const banner = document.getElementById("b2fa");
      if (banner) {
        banner.classList.add("hide");
        setTimeout(() => banner.remove(), 300);
      }

    } catch (err) {
      console.error(err);
    }
  });
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

  /* ===============================
     BORROW MODAL
  =============================== */
  const borrowModal = document.getElementById("borrowModal");
  if (borrowModal) {
    const closeModalBtn = borrowModal.querySelector(".close");
    const borrowForm = document.getElementById("borrowForm");
    const modalDeviceName = document.getElementById("modalDeviceName");
    const modalRemainQty = document.getElementById("modalRemainQty");
    const modalDeviceID = document.getElementById("modalDeviceID");
    const modalQty = document.getElementById("modalQty");
    const modalBorrowDate = document.getElementById("modalBorrowDate");
    const modalDueDate = document.getElementById("modalDueDate");

    function openBorrowModal(device) {
      const deviceID = device.id || device.dataset?.id || "-";
      const deviceName = device.name || device.dataset?.name || "-";
      const remainQty = parseInt(device.stock || device.dataset?.stock || "0", 10);

      modalDeviceName.textContent = deviceName;
      modalRemainQty.textContent = remainQty;
      modalDeviceID.value = deviceID;
      modalQty.value = 1;
      modalQty.max = remainQty;

      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      modalBorrowDate.value = today.toISOString().split("T")[0];
      modalBorrowDate.min = today.toISOString().split("T")[0];

      modalDueDate.value = tomorrow.toISOString().split("T")[0];
      modalDueDate.min = today.toISOString().split("T")[0];

      borrowModal.style.display = "block";
    }

    document.querySelectorAll(".borrowBtn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        const card = btn.closest(".device-card");
        if (!card) return;
        openBorrowModal({
          id: card.dataset.type,
          name: card.querySelector("h3")?.innerText,
          stock: card.querySelector(".stock")?.innerText.replace(/\D/g,"")
        });
      });
    });

    closeModalBtn?.addEventListener("click", () => borrowModal.style.display = "none");
    window.addEventListener("click", e => {
      if (e.target === borrowModal) borrowModal.style.display = "none";
    });

    modalBorrowDate?.addEventListener("change", () => {
      if (modalDueDate.value < modalBorrowDate.value) {
        modalDueDate.value = modalBorrowDate.value;
      }
      modalDueDate.min = modalBorrowDate.value;
    });

borrowForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(borrowForm);
  const deviceID = formData.get("DeviceID");

  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    params.append(key, value);
  }

  try {
    const res = await fetch(`/user/borrow/${deviceID}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    const data = await res.json();

    if (data.success) {
      borrowModal.style.display = "none";

      // 👉 ไปหน้าใหม่พร้อม success
      window.location.href = "/user/borrow_status?success=borrow";
    } else {
      alert(data.message || "เกิดข้อผิดพลาด");
    }

  } catch (err) {
    console.error(err);
    alert("เกิดข้อผิดพลาด ไม่สามารถส่งคำขอได้");
  }
});
  }

});


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


/* ===============================
   NOTIFICATION BELL (FIXED)
================================ */
function initNotification() {
  const btn      = document.getElementById("notiBtn");
  const dropdown = document.getElementById("notiDropdown");
  const badge    = document.getElementById("notiBadge");
  const list     = document.getElementById("notiList");
  const countLbl = document.getElementById("notiCountLabel");

  if (!btn) return;

  const isAdmin = document.body.dataset.role === "admin";
  const apiUrl  = isAdmin ? "/admin/notifications" : "/user/notifications";
  const markUrl = isAdmin ? "/admin/notifications/mark-read" : "/user/notifications/mark-read";

  let lastItems = [];

  async function loadNotifications() {
    try {
      const res  = await fetch(apiUrl);
      const data = await res.json();
      lastItems  = data.items || [];

      // 🔴 badge
      if (data.count > 0) {
        badge.textContent  = data.count > 99 ? "99+" : data.count;
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }

      countLbl.textContent = data.count > 0 ? `${data.count} รายการใหม่` : "";

      // ❌ ไม่มี noti
      if (!lastItems.length) {
        list.innerHTML = `
          <div class="noti-empty">
            <i class="fa-solid fa-bell-slash"></i>
            <p>ไม่มีการแจ้งเตือน</p>
          </div>`;
        return;
      }

      // 🔥 render
      list.innerHTML = lastItems.map(item => `
        <a class="noti-item ${Number(item.isRead) === 1 ? '' : 'noti-unread'}" 
           href="${item.url}" 
           data-key="${item.notiKey}">
          
          <div class="noti-icon" style="background:${item.color}22; color:${item.color};">
            <i class="fa-solid fa-${item.icon}"></i>
          </div>

          <div class="noti-body">
            <div class="noti-title">${item.title}</div>
            <div class="noti-desc">${item.desc}</div>
            <div class="noti-time">${item.time}</div>
          </div>

          ${Number(item.isRead) === 0 ? '<span class="noti-dot"></span>' : ''}
        </a>
      `).join("");

      // ✅ click ทีละ item = read ทีละอัน
    list.querySelectorAll(".noti-item").forEach(item => {
      item.addEventListener("click", async e => {  // ← เพิ่ม async
        e.preventDefault();

        const key = item.dataset.key;
        const url = item.href;

        // ← รอให้ save เสร็จก่อน
        await fetch(markUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: [key] })
        });

        // อัป UI
        item.classList.remove("noti-unread");
        item.querySelector(".noti-dot")?.remove();

        let current = parseInt(badge.textContent) || 0;
        current--;
        if (current <= 0) {
          badge.style.display = "none";
          countLbl.textContent = "";
        } else {
          badge.textContent = current;
          countLbl.textContent = `${current} รายการใหม่`;
        }

        window.location.href = url;
      });
    });

    } catch (err) {
      console.error("NOTI LOAD ERROR:", err);
    }
  }

  // 🔔 toggle dropdown
  btn.addEventListener("click", e => {
    e.stopPropagation();

    const isOpen = dropdown.classList.contains("open");

    if (!isOpen) {
      dropdown.classList.add("open");
      loadNotifications(); // ❗ ไม่ mark read แล้ว
    } else {
      dropdown.classList.remove("open");
    }
  });

  // ❌ ปิดเฉยๆ (ไม่ mark read แล้ว)
  document.addEventListener("click", e => {
    if (!btn.closest(".noti-wrap").contains(e.target)) {
      dropdown.classList.remove("open");
    }
  });

  // โหลดครั้งแรก
  loadNotifications();

  // refresh ทุก 60 วิ
  setInterval(loadNotifications, 60000);
}

/* ===============================
   DATE DISPLAY FIX (DD/MM/YYYY)
================================ */
function formatDateToDMY(dateStr) {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

const borrowDateEl = document.getElementById("borrowDate");
const dueDateEl = document.getElementById("dueDate");
const borrowDisplay = document.getElementById("borrowDateDisplay");
const dueDisplay = document.getElementById("dueDateDisplay");

if (borrowDateEl && dueDateEl && borrowDisplay && dueDisplay) {
  borrowDateEl.addEventListener("input", e => borrowDisplay.innerText = formatDateToDMY(e.target.value));
  dueDateEl.addEventListener("input", e => dueDisplay.innerText = formatDateToDMY(e.target.value));

  // แสดงค่าเริ่มต้นตอนโหลด
  borrowDisplay.innerText = formatDateToDMY(borrowDateEl.value);
  dueDisplay.innerText = formatDateToDMY(dueDateEl.value);
}

