/* =========================================
   SHOW REPAIR DETAIL
========================================= */
function showRepairDetail(r) {
  const content = document.getElementById("detailContent");
  if (!content) return;

  content.innerHTML = `
    <div class="detail-info">

      <h3>เลขใบซ่อม: ${r.RepairCode || '-'}</h3> 

      <div class="detail-image">
        ${
          r.DeviceImage
            ? `<img src="/uploads/device/${r.DeviceImage}" 
                   style="max-height:180px; object-fit:cover;"
                   onerror="this.src='/images/no-image.png'">`
            : `<div class="no-image">ไม่มีรูปอุปกรณ์</div>`
        }
      </div>

      <div class="row">
        <span class="label">อุปกรณ์:</span>
        ${r.DeviceName || '-'}
      </div>

      <div class="row">
        <span class="label">Asset Code:</span>
        ${r.AssetCode || '-'}
      </div>

      <div class="row">
        <span class="label">Serial:</span>
        ${r.SerialNumber || '-'}
      </div>

      <div class="row">
        <span class="label">อาการเสีย:</span>
        ${r.ProblemDetail || '-'}
      </div>

      <div class="row">
        <span class="label">ผู้แจ้ง:</span>
        ${r.CreateBy || '-'}
      </div>

      <div class="row">
        <span class="label">ดำเนินการโดย:</span>
        ${r.Technician || '-'}
      </div>

      <div class="row">
        <span class="label">วันที่แจ้ง:</span>
        ${r.CreateDate || '-'}
      </div>

      <div class="row">
        <span class="label">เริ่มซ่อม:</span>
        ${r.StartRepairDate || '-'}
      </div>

      <div class="row">
        <span class="label">ซ่อมเสร็จ:</span>
        ${r.FinishDate || '-'}
      </div>

    </div>
  `;
}

/* =========================================
   DOM READY
========================================= */
document.addEventListener("DOMContentLoaded", () => {

  /* ===============================
     SEARCH
  =============================== */
  const searchInput = document.querySelector(".admin-search");
  if (searchInput) {
    const rows = document.querySelectorAll(".repair-row");

    searchInput.addEventListener("keyup", () => {
      const keyword = searchInput.value.toLowerCase();
      rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(keyword)
          ? ""
          : "none";
      });
    });
  }

  /* ===============================
     DETAIL BUTTON
  =============================== */
  const detailButtons = document.querySelectorAll(".btn-detail");
  if (detailButtons.length > 0) {
    detailButtons.forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          const id = btn.dataset.id;
          const res = await fetch(`/admin/repair/detail/${id}`);
          const r = await res.json();

          showRepairDetail(r);

          const modal = document.getElementById("repairDetailModal");
          modal?.classList.add("show");

        } catch (err) {
          console.error("โหลดรายละเอียดซ่อมไม่สำเร็จ:", err);
        }
      });
    });
  }

  /* ===============================
     CLOSE DETAIL MODAL
  =============================== */
  const detailModal = document.getElementById("repairDetailModal");
  if (detailModal) {
    detailModal.querySelector(".close-btn")?.addEventListener("click", () => {
      detailModal.classList.remove("show");
    });

    detailModal.addEventListener("click", e => {
      if (e.target === detailModal) {
        detailModal.classList.remove("show");
      }
    });
  }

  /* ===============================
     CANCEL REPAIR MODAL
  =============================== */
  const deleteModal = document.getElementById("deleteModal");

  if (deleteModal) {

    const confirmBtn = document.getElementById("confirmDeleteBtn");
    const cancelBtn = deleteModal.querySelector(".btn-cancel");
    const title = document.getElementById("confirmTitle");
    const desc = document.getElementById("confirmDesc");

    let cancelRepairId = null;

    document.querySelectorAll(".btn-repair-cancel").forEach(btn => {
      btn.addEventListener("click", () => {
        cancelRepairId = btn.dataset.id;

        if (title) {
          title.textContent = "ยืนยันการยกเลิก";
        }

        if (desc) {
          desc.textContent = "คุณต้องการยกเลิกคำสั่งซ่อมนี้ใช่หรือไม่ ?";
        }

        deleteModal.classList.add("show");
      });
    });

    confirmBtn?.addEventListener("click", () => {
      if (!cancelRepairId) return;
      window.location.href = `/admin/repair/cancel/${cancelRepairId}`;
    });

    cancelBtn?.addEventListener("click", () => {
      deleteModal.classList.remove("show");
      cancelRepairId = null;
    });

    deleteModal.addEventListener("click", e => {
      if (e.target === deleteModal) {
        deleteModal.classList.remove("show");
        cancelRepairId = null;
      }
    });

  }

});
