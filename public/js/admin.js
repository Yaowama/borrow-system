let borrowChart;
let deviceChart;

function loadPage(page) {
  fetch(`/admin/page/${page}`)
    .then(res => res.text())
    .then(html => {
      document.getElementById("content").innerHTML = html;
      initAdminSearch();
      setTimeout(() => { initDashboardChart(); }, 50);
    });
}

document.addEventListener("DOMContentLoaded", () => {
  const profileBtn = document.getElementById("profileBtn");
  const dropdown = document.getElementById("profileDropdown");
  if (!profileBtn || !dropdown) return;
  profileBtn.addEventListener("click", e => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
  });
  document.addEventListener("click", () => { dropdown.classList.remove("show"); });
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  if (!btn || !sidebar) return;
  btn.addEventListener("click", () => { sidebar.classList.toggle("expand"); });
});

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
        row.style.display = row.innerText.toLowerCase().includes(keyword) ? "" : "none";
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initAdminSearch();
  initDashboardChart();
  initNotification();
  initDeviceBars();
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
  document.querySelector('.tab[data-status="1"]')?.click();
});

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
      const res = await fetch(apiUrl, { cache: "no-store" });
      const data = await res.json();
      const res  = await fetch(apiUrl);
      const data = await res.json();
      lastItems  = data.items || [];
      if (data.count > 0) {
        badge.textContent = data.count > 99 ? "99+" : data.count;
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
      countLbl.textContent = data.count > 0 ? `${data.count} รายการใหม่` : "";
      if (!lastItems.length) {
        list.innerHTML = `<div class="noti-empty"><i class="fa-solid fa-bell-slash"></i><p>ไม่มีการแจ้งเตือน</p></div>`;
        return;
      }
      list.innerHTML = lastItems.map(item => `
        <a class="noti-item ${Number(item.isRead) === 1 ? '' : 'noti-unread'}" href="${item.url}" data-key="${item.notiKey}">
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
              // ✅ แก้ตรงนี้ — เพิ่ม async และ await ให้ครบ
        list.querySelectorAll(".noti-item").forEach(item => {
          item.addEventListener("click", async e => {
            e.preventDefault();

            const key = item.dataset.key;
            const url = item.href;

            // ✅ รอให้ mark-read บันทึกใน DB เสร็จก่อน
            try {
              await fetch(markUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keys: [key] })
              });
            } catch (err) {
              console.error("Mark read failed:", err);
            }

            // ✅ อัป UI
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

  btn.addEventListener("click", e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains("open");
    if (!isOpen) { dropdown.classList.add("open"); loadNotifications(); }
    else { dropdown.classList.remove("open"); }
  });

  document.addEventListener("click", e => {
    if (!btn.closest(".noti-wrap").contains(e.target)) { dropdown.classList.remove("open"); }
  });

  loadNotifications();
 // ✅ แทนที่ setInterval เดิม
setInterval(() => {
  // ไม่ refresh ถ้า dropdown เปิดอยู่
  if (!dropdown.classList.contains("open")) {
    loadNotifications();
  }
}, 60000);
}

/* ===============================
   DEVICE BARS
================================ */
function initDeviceBars() {
  const wrap = document.querySelector(".device-bars");
  if (!wrap) return;

  const available = Number(wrap.dataset.available || 0);
  const borrowed  = Number(wrap.dataset.borrowed  || 0);
  const repair    = Number(wrap.dataset.repair    || 0);
  const total     = Number(wrap.dataset.total || 0);
  if (total === 0) return;

  wrap.querySelectorAll(".bar-fill").forEach(el => {
    const key = el.dataset.key;
    const val = { available, borrowed, repair }[key] || 0;
    el.style.width = Math.round((val / total) * 100) + "%";
  });
}

/* ===============================
   DASHBOARD CHART
================================ */
function initDashboardChart() {
  const borrowCanvas = document.getElementById("borrowChart");
  if (!borrowCanvas) return;

  if (borrowCanvas.offsetWidth === 0) {
    setTimeout(initDashboardChart, 100);
    return;
  }

  const approved = Number(borrowCanvas.dataset.approved || 0);
  const pending  = Number(borrowCanvas.dataset.pending  || 0);
  const rejected = Number(borrowCanvas.dataset.rejected || 0);
  const returned = Number(borrowCanvas.dataset.returned || 0);
  const overdue  = Number(borrowCanvas.dataset.overdue  || 0);

  // destroy ก่อนเสมอ ป้องกัน ghost chart
  if (window.borrowChart instanceof Chart) {
    window.borrowChart.destroy();
    window.borrowChart = null;
  }

  window.borrowChart = new Chart(borrowCanvas, {
    type: 'doughnut',
    data: {
      labels: ['อนุมัติ', 'รอตรวจสอบ', 'ไม่อนุมัติ', 'คืนแล้ว', 'เกินกำหนดคืน'],
      datasets: [{
        data: [approved, pending, rejected, returned, overdue],
        backgroundColor: ['#22c55e', '#fbbf24', '#ef4444', '#3b82f6', '#a855f7'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: { legend: { display: false } }
    }
  });
}

/* ===============================
   UPDATE LEGEND ใน DOM
================================ */
function updateLegend(approved, pending, rejected, returned, overdue) {
  const legendBox = document.querySelector(".legend-box");
  if (!legendBox) return;

  const items = legendBox.querySelectorAll(".legend-item b");
  // ลำดับตรงกับ HTML: อนุมัติ, รอตรวจสอบ, ไม่อนุมัติ, คืนแล้ว, เกินกำหนด
  const values = [approved, pending, rejected, returned, overdue];
  items.forEach((el, i) => {
    if (values[i] !== undefined) el.textContent = values[i];
  });
}

/* ===============================
   LOAD DASHBOARD (polling)
================================ */
async function loadDashboard() {
  try {
    const res  = await fetch("/admin/dashboard-data");
    const data = await res.json();

    const { approved, pending, rejected, returned, overdue } = data;

    // ---- อัป chart ----
    const borrowCanvas = document.getElementById("borrowChart");

    // ถ้า canvas หายไป (เช่น loadPage เปลี่ยน content) ให้ init ใหม่
    if (!borrowCanvas) return;

    if (!(window.borrowChart instanceof Chart)) {
      // chart ถูก destroy ไป → สร้างใหม่
      initDashboardChart();
      return; // รอรอบหน้า polling จะ update ค่าใหม่
    }

    // update data โดยไม่ destroy
    window.borrowChart.data.datasets[0].data = [
      approved, pending, rejected, returned, overdue
    ];
    window.borrowChart.update();

    // ---- อัป legend ----
    updateLegend(approved, pending, rejected, returned, overdue);

    // ---- อัป stat cards ----
    const cardMap = {
      ".card-green  .num": approved,
      ".card-yellow .num": pending,
      ".card-red    .num": rejected,
      ".card-purple .num": returned,
      ".card-orange .num": overdue,
    };
    Object.entries(cardMap).forEach(([sel, val]) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = val ?? 0;
    });

    // ---- อัป device bars ----
    const wrap = document.querySelector(".device-bars");
    if (wrap && data.deviceStatus) {
      const { available, borrowed, repair } = data.deviceStatus;
      const total = Number(wrap.dataset.total) || (available + borrowed + repair);

      if (total > 0) {
        wrap.querySelectorAll(".bar-fill").forEach(el => {
          const val = { available, borrowed, repair }[el.dataset.key] || 0;
          el.style.width = Math.round((val / total) * 100) + "%";
        });

        const bRows = wrap.querySelectorAll(".bar-row b");
        if (bRows[0]) bRows[0].textContent = available ?? 0;
        if (bRows[1]) bRows[1].textContent = borrowed  ?? 0;
        if (bRows[2]) bRows[2].textContent = repair    ?? 0;
      }
    }

  } catch (err) {
    console.error("loadDashboard error:", err);
  }
}

// เริ่ม polling หลัง chart init เสร็จ
setTimeout(loadDashboard, 1000);
setInterval(loadDashboard, 5000);

/* ===============================
   2FA BANNER
================================ */
document.addEventListener("DOMContentLoaded", () => {
  const banner     = document.getElementById("b2fa");
  const btnDismiss = document.getElementById("btnDismiss2FA");
  const btnProfile = document.getElementById("btnGoProfile");
  if (!banner) return;

  const isAdmin = document.body.dataset.role === "admin";

  if (btnProfile) {
    btnProfile.addEventListener("click", () => {
      window.location.href = isAdmin ? "/admin/profile" : "/user/profile";
    });
  }

  if (btnDismiss) {
    btnDismiss.addEventListener("click", async () => {
      try {
        const url = isAdmin ? "/admin/dismiss-2fa-banner" : "/user/dismiss-2fa-banner";
        await fetch(url, { method: "POST" });
        banner.classList.add("hide");
        setTimeout(() => banner.remove(), 300);
      } catch (err) {
        console.error("2FA dismiss error:", err);
      }
    });
  }
});

function closeSecurityModal() {
  const modal = document.getElementById("securityModal");
  if (modal) modal.style.display = "none";
}