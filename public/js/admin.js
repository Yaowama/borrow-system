let borrowChart;
let deviceChart;
/* ===============================
   LOAD PAGE (AJAX)
================================ */
function loadPage(page) {
  fetch(`/admin/page/${page}`)
    .then(res => res.text())
    .then(html => {
      document.getElementById("content").innerHTML = html;

      initAdminSearch();
      initDashboardChart();
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
  initDashboardChart(); // เพิ่มบรรทัดนี้
  
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

/* ===============================
   ADMIN DASHBOARD CHART
================================ */

function initDashboardChart(){

  const borrowCanvas = document.getElementById("borrowChart");
  const deviceCanvas = document.getElementById("deviceChart");

  if(!borrowCanvas || !deviceCanvas) return;

  const approved = borrowCanvas.dataset.approved;
  const pending = borrowCanvas.dataset.pending;
  const rejected = borrowCanvas.dataset.rejected;
  const returned = borrowCanvas.dataset.returned;
  const overdue = borrowCanvas.dataset.overdue;

  const available = deviceCanvas.dataset.available;
  const borrowed = deviceCanvas.dataset.borrowed;
  const repair = deviceCanvas.dataset.repair;


borrowChart = new Chart(borrowCanvas,{
  type:'doughnut',
  data:{
    labels:['อนุมัติ','รอตรวจสอบ','ไม่อนุมัติ','คืนแล้ว','เกินกำหนดคืน'],
    datasets:[{
      data:[approved,pending,rejected,returned,overdue],
      backgroundColor:[
        '#98ecae',
        '#F4B400',
        '#EA4335',
        '#76a8ff',
        '#9B59B6' 
      ],
      borderWidth:0
    }]
  },
  options:{
    responsive:true,
    maintainAspectRatio:false,
    cutout:'65%',
    plugins:{
      legend:{
        position:'bottom',
        labels:{
          padding:20,
          usePointStyle:true
        }
      }
    }
  }
});


deviceChart = new Chart(deviceCanvas,{
  type:'bar',
  data:{
    labels:['คงเหลือ','ถูกยืม','ซ่อม'],
    datasets:[{
      label:'จำนวนอุปกรณ์',
      data:[available,borrowed,repair],
      backgroundColor:[
        '#7c8ef7',
        '#F59E0B',
        '#EF4444'
      ],
      borderRadius:8
    }]
  },
  options:{
    responsive:true,
    maintainAspectRatio:false,
    plugins:{
      legend:{
        display:false
      }
    }
  }
});
}

async function loadDashboard() {

  const res = await fetch("/admin/dashboard-data");
  const data = await res.json();

  console.log(data);

  // update chart
if (!borrowChart || !deviceChart) return;

borrowChart.data.datasets[0].data = [
  data.approved,
  data.pending,
  data.rejected,
  data.returned,
  data.overdue
];

  borrowChart.update();

  deviceChart.data.datasets[0].data = [
    data.deviceStatus.available,
    data.deviceStatus.borrowed,
    data.deviceStatus.repair
  ];

  deviceChart.update();

}

// โหลดครั้งแรก
setTimeout(loadDashboard,1000);

// รีเฟรชทุก 5 วิ
setInterval(loadDashboard,5000);