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
    <div class="row"><span class="label">Asset Code:</span> ${h.AssetCode}</div>
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

    closeReject.addEventListener("click", () => {
      rejectModal.style.display = "none";
      rejectForm.reset();
      if (reasonSelect) reasonSelect.value = "";
    });

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

  closeUser.addEventListener("click", () => {
    userOverlay.classList.remove("show");
  });

  userOverlay.addEventListener("click", e => {
    if (e.target === userOverlay) {
      userOverlay.classList.remove("show");
    }
  });
}

});
