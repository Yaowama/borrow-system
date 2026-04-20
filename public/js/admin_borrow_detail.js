document.addEventListener("DOMContentLoaded", () => {

  // ===============================
  // DETAIL OVERLAY (👁)
  // ===============================
  const overlay = document.getElementById("detailOverlay");
  const content = document.getElementById("detailContent");
  const closeBtn = document.getElementById("closeDetail");

  if (overlay && content) {

    document.querySelectorAll(".btn-detail").forEach(btn => {
      btn.addEventListener("click", async () => {
        const code = btn.dataset.code;
        if (!code) return;

        try {
          const res = await fetch(`/admin/borrow/detail/data/${code}`);
          const data = await res.json();
          if (!data.length) return;

          const h = data[0];

          content.innerHTML = `
  <div class="detail-info">
    <h3>เลขเอกสาร: ${h.BorrowCode}</h3>

    <div class="detail-image">
      <img 
        src="${h.BarcodeImage ? `/uploads/asset/${h.BarcodeImage}` : '/images/no-image.png'}"
        onerror="this.src='/images/no-image.png'"
      >
    </div>

    <div class="row"><span class="label">ผู้ยืม:</span> ${h.fname} ${h.lname}</div>
    <div class="row"><span class="label">อุปกรณ์:</span> ${h.DeviceName}</div>
    <div class="row"><span class="label">รหัสครุภัณฑ์:</span> ${h.AssetTag || "-"}</div>
    <div class="row"><span class="label">IT Code:</span> ${h.ITCode}</div>
    <div class="row"><span class="label">Serial Number:</span> ${h.SerialNumber || "-"}</div>
    <div class="row"><span class="label">ยี่ห้อ:</span> ${h.BrandName || "-"}</div>
    <div class="row"><span class="label">รุ่น:</span> ${h.ModelName || "-"}</div>
    <div class="row"><span class="label">สถานที่:</span> ${h.Location || "-"}</div>
    <div class="row"><span class="label">วัตถุประสงค์:</span> ${h.Purpose || "-"}</div>
    <div class="row"><span class="label">วันที่ยืม:</span> ${h.BorrowDate}</div>
    <div class="row"><span class="label">กำหนดคืน:</span> ${h.DueDate}</div>
    <div class="row">
      <span class="label">
        ${h.ActionType === 'approve'
          ? 'อนุมัติเมื่อ'
          : h.ActionType === 'reject'
          ? 'ปฏิเสธเมื่อ'
          : 'วันที่คืน'}
      :</span>
      ${h.ActionDate || "-"}
    </div>

    <div class="row">
  <span class="label">สถานะ:</span> 
  ${
    h.BorrowStatusID == 1 ? `<span class="badge gray">รออนุมัติ</span>` :
    h.BorrowStatusID == 3 ? `<span class="badge red">ปฏิเสธ</span>` :
    h.BorrowStatusID == 4 ? `<span class="badge green">คืนแล้ว</span>` :
    h.BorrowStatusID == 5 ? `<span class="badge orange">ยกเลิก</span>` :
    h.BorrowStatusID == 2 || h.BorrowStatusID == 6 ? `<span class="badge blue">อนุมัติแล้ว</span>` :
    `<span class="badge gray">${h.StatusName}</span>`
  }
</div>
    
  
    ${h.OverdueText ? `
      <div class="row">
        <span class="label">แจ้งเตือน:</span>
        <span class="overdue-text">${h.OverdueText}</span>
      </div>
    ` : ``}

    <div class="row"><span class="label">หมายเหตุ:</span> ${h.Remark || "-"}</div>
    <div class="row"><span class="label">ดำเนินการโดย:</span> ${h.ActionBy || "-"}</div>

    ${h.RejectRemark ? `
      <div class="row">
        <span class="label">เหตุผล:</span> ${h.RejectRemark}
      </div>
    ` : ``}

  </div>
`;

          overlay.classList.add("show");

        } catch (err) {
          console.error("❌ load detail error:", err);
        }
      });
    });

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        overlay.classList.remove("show");
      });
    }

    overlay.addEventListener("click", e => {
      if (e.target === overlay) {
        overlay.classList.remove("show");
      }
    });

  } else {
    console.warn("⚠️ detail overlay not found");
  }

  // ===============================
  // REJECT MODAL
  // ===============================
  const rejectModal = document.getElementById("rejectModal");
  const rejectForm = document.getElementById("rejectForm");
  const closeReject = document.getElementById("closeReject");
  const reasonSelect = document.getElementById("rejectReasonSelect");
  const remarkTextarea = document.getElementById("rejectRemark");

  if (rejectModal && rejectForm) {
 
    document.querySelectorAll(".btn-reject").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        rejectForm.action = `/admin/borrow/reject/${btn.dataset.id}`;
        rejectModal.style.display = "flex";
      });
    });

    if (closeReject && rejectModal && rejectForm) {
      closeReject.addEventListener("click", () => {
        rejectModal.style.display = "none";
        rejectForm.reset();
        if (reasonSelect) reasonSelect.value = "";
      });
    }

    if (reasonSelect && remarkTextarea) {
      reasonSelect.addEventListener("change", () => {
        remarkTextarea.value =
          reasonSelect.value === "อื่น ๆ" ? "" : reasonSelect.value;
      });
    }

    rejectForm.addEventListener("submit", e => {
      if (!remarkTextarea.value.trim()) {
        e.preventDefault();
        alert("กรุณาระบุเหตุผลในการปฏิเสธ");
      }
    });

  }
// ===============================
// APPROVE MODAL + SEARCHABLE DROPDOWN
// ===============================
const approveModal = document.getElementById("approveModal");
const approveForm = document.getElementById("approveForm");
const closeApprove = document.getElementById("closeApprove");
const deviceSearch = document.getElementById("deviceSearch");
const deviceDropdown = document.getElementById("deviceDropdown");
const selectedDVID = document.getElementById("selectedDVID");
const deviceInfo = document.getElementById("deviceInfo");
const deviceInfoContent = document.getElementById("deviceInfoContent");
const btnConfirmApprove = document.getElementById("btnConfirmApprove");

let allDevices = []; // เก็บ list ทั้งหมดไว้ filter


// ค้นหาแบบ real-time — แทนที่ฟังก์ชัน renderDropdown ใหม่
function renderDropdown(list) {
  deviceDropdown.innerHTML = ""; 
  if (list.length === 0) {
    deviceDropdown.innerHTML = `<div class="dropdown-item no-result">ไม่พบอุปกรณ์</div>`;
  } else {
    deviceDropdown.innerHTML = list.map(d => `
      <div class="dropdown-item" data-dvid="${d.DVID}">
        <strong>${d.AssetTag || "-"} ${d.ITCode ? `(${d.ITCode})` : ""}</strong>
        <small>${d.DeviceName} | ${d.BrandName || "-"} ${d.ModelName || "-"} | S/N: ${d.SerialNumber || "-"}</small>
      </div>
    `).join("");

    deviceDropdown.querySelectorAll(".dropdown-item[data-dvid]").forEach(item => {
      item.addEventListener("click", () => {
        const dvid = item.dataset.dvid;
        const device = allDevices.find(d => String(d.DVID) === dvid);

        selectedDVID.value = dvid;
        deviceSearch.value = device.AssetTag || device.ITCode || "";
        deviceDropdown.style.display = "none";
        btnConfirmApprove.disabled = false;

        deviceInfoContent.innerHTML = `
          <div class="selected-row">📦 ${device.DeviceName}</div>
          <div class="selected-row">🏷 ${device.BrandName || "-"} ${device.ModelName || "-"}</div>
          <div class="selected-row">🔢 Asset Tag: ${device.AssetTag || "-"}</div>
          <div class="selected-row">🔢 IT Code: ${device.ITCode || "-"}</div>
          <div class="selected-row">🔢 S/N: ${device.SerialNumber || "-"}</div>
        `;
        deviceInfo.style.display = "block";
      });
    });
  }
  deviceDropdown.style.display = "block";
}

// เปิด modal + โหลดอุปกรณ์ — แทนที่ของเดิมทั้งหมด
document.querySelectorAll(".btn-approve").forEach(btn => {
  btn.addEventListener("click", async () => {
    const borrowId = btn.dataset.id;
    approveForm.action = `/admin/borrow/approve/${borrowId}`;

    // reset
    deviceSearch.value = "";
    selectedDVID.value = "";
    deviceInfo.style.display = "none";
    deviceDropdown.style.display = "none";
    btnConfirmApprove.disabled = true;
    allDevices = [];

    approveModal.style.display = "flex";

    try {
      const res = await fetch(`/admin/borrow/available/${borrowId}`);
      allDevices = await res.json();

      if (allDevices.length === 0) {
        deviceSearch.placeholder = "ไม่มีอุปกรณ์พร้อมให้ยืม";
        deviceSearch.disabled = true;
        deviceDropdown.innerHTML = `<div class="dropdown-item no-result">ไม่มีอุปกรณ์พร้อมให้ยืม</div>`;
        deviceDropdown.style.display = "block";
      } else {
        deviceSearch.placeholder = "พิมพ์เพื่อกรอง...";
        deviceSearch.disabled = false;
        renderDropdown(allDevices); 
      }
    } catch (err) {
      console.error("load devices error:", err);
    }
  });
});

// filter เมื่อพิมพ์
if (deviceSearch) {
  deviceSearch.addEventListener("input", () => {
    const keyword = deviceSearch.value.trim().toLowerCase();

    selectedDVID.value = "";
    btnConfirmApprove.disabled = true;
    deviceInfo.style.display = "none";

    const filtered = keyword
      ? allDevices.filter(d =>
          (d.AssetTag || "").toLowerCase().includes(keyword) ||
          (d.ITCode || "").toLowerCase().includes(keyword) ||
          (d.SerialNumber || "").toLowerCase().includes(keyword) ||
          (d.DeviceName || "").toLowerCase().includes(keyword)
        )
      : allDevices;

    renderDropdown(filtered);
  });
}

if (deviceSearch && deviceDropdown) {
  deviceSearch.addEventListener("focus", () => {
    if (deviceDropdown.style.display === "block") return;
    
    if (allDevices.length > 0) {
      const keyword = deviceSearch.value.trim().toLowerCase();
      const filtered = keyword
        ? allDevices.filter(d =>
            (d.ITCode || "").toLowerCase().includes(keyword) ||
            (d.SerialNumber || "").toLowerCase().includes(keyword) ||
            (d.DeviceName || "").toLowerCase().includes(keyword)
          )
        : allDevices;

      renderDropdown(filtered);
    }
  });
}

// ปิด dropdown เมื่อคลิกข้างนอก
document.addEventListener("click", e => {
  if (!deviceSearch || !deviceDropdown || !approveModal) return;
  if (
    !deviceSearch.contains(e.target) &&
    !deviceDropdown.contains(e.target) &&
    !approveModal.contains(e.target)
  ) {
    deviceDropdown.style.display = "none";
  }
});

if (closeApprove && approveModal) {
  closeApprove.addEventListener("click", () => {
    approveModal.style.display = "none";
  });
}

  // ===============================
// USER DETAIL OVERLAY (👤)
// ===============================
const userOverlay = document.getElementById("userOverlay");
const userContent = document.getElementById("userContent");
const closeUser = document.getElementById("closeUser");

if (userOverlay && userContent) {

    document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button.icon-action.user");
  if (!btn) return;

  const userId = btn.dataset.userId;

  try {
    const res = await fetch(`/admin/user/data/${userId}`);
    const data = await res.json();

    userContent.innerHTML = `
      <div class="detail-info">
        <h3>ข้อมูลผู้ยืม</h3>
        <div class="row"><span class="label">ชื่อ:</span> ${data.fname} ${data.lname}</div>
        <div class="row"><span class="label">รหัสพนักงาน:</span> ${data.EMP_NUM || "-"}</div>
        <div class="row"><span class="label">อีเมล:</span> ${data.email || "-"}</div> 
        <div class="row"><span class="label">เบอร์โทร:</span> ${data.phone || "-"}</div>
        <div class="row"><span class="label">โทรสาร:</span> ${data.fax || "-"}</div>
        <div class="row"><span class="label">สำนัก:</span> ${data.InstitutionName || "-"}</div>
        <div class="row"><span class="label">ฝ่าย:</span> ${data.DepartmentName || "-"}</div>
        <div class="row"><span class="label">กำลังยืมอยู่:</span> ${data.activeBorrow} รายการ</div>
      </div>
    `;

    userOverlay.classList.add("show");

  } catch (err) {
    console.error("❌ load user error:", err);
  }
});

  if (closeUser && userOverlay) {
  closeUser.addEventListener("click", () => {
    userOverlay.classList.remove("show");
  });
}

  userOverlay.addEventListener("click", e => {
    if (e.target === userOverlay) {
      userOverlay.classList.remove("show");
    }
  });
}

const repairModal = document.getElementById("repairModal");
const repairForm = document.getElementById("repairForm");
const closeRepair = document.getElementById("closeRepair");

const repairBtns = document.querySelectorAll(".btn-repair");

if (repairBtns.length && repairModal && repairForm) {

  repairBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const dvid = btn.dataset.dvid;
      repairForm.action = "/admin/repair/create/" + dvid;
      repairModal.style.display = "flex";
    });
  });

  if (closeRepair) {
    closeRepair.addEventListener("click", () => {
      repairModal.style.display = "none";
      repairForm.reset();
    });
  }
}

});