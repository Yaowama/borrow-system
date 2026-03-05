document.addEventListener("DOMContentLoaded", () => {

function formatThaiDate(dateStr) {
  if (!dateStr) return "-";

  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear() + 543;

  return `${day}/${month}/${year}`;
}
  /* ===============================
     DETAIL MODAL
  ============================== */
  const overlay = document.getElementById("detailOverlay");
  const content = document.getElementById("detailContent");
  const closeBtn = document.getElementById("closeDetail");

  if (overlay && content && closeBtn) {

    document.querySelectorAll(".btn-detail").forEach(btn => {
      btn.addEventListener("click", async () => {
        const code = btn.dataset.code;

        const res = await fetch(`/user/borrow/detail/data/${code}`);
        const data = await res.json();

        if (!data.length) {
          content.innerHTML = "<p>ไม่พบข้อมูล</p>";
          overlay.classList.add("show");
          return;
        }

        const h = data[0];
       
        if (h.BorrowStatusID == 3) {
          try {
            await fetch(`/user/borrow/mark-viewed/${code}`, {
              method: "POST"
            });
          } catch (err) {
            console.error("mark viewed error:", err);
          }
        }

        content.innerHTML = `
          <div class="detail-layout">

            <div class="detail-image">
              <img src="${h.DeviceImage 
                ? `/uploads/device/${h.DeviceImage}` 
                : '/images/no-image.png'}"
                onerror="this.src='/images/no-image.png'">
            </div>

            <div class="detail-info">

              <div class="row">
                <div class="label">อุปกรณ์:</div>
                <div>${h.DeviceName || '-'}</div>
              </div>

              <div class="row">
                <div class="label">ยี่ห้อ:</div>
                <div>${h.BrandName || '-'}</div>
              </div>

              <div class="row">
                <div class="label">รุ่น:</div>
                <div>${h.ModelName || '-'}</div>
              </div>

              <div class="row">
                <div class="label">รหัสการยืม:</div>
                <div>${h.BorrowCode}</div>
              </div>

              <div class="row">
                <div class="label">วันที่ยืม:</div>
                <div>${formatThaiDate(h.BorrowDate)}</div>
              </div>

              <div class="row">
                <div class="label">กำหนดคืน:</div>
                <div>${formatThaiDate(h.DueDate)}</div>
              </div>

              <div class="row">
                <div class="label">วันที่คืน:</div>
                <div>${h.ReturnDate ? formatThaiDate(h.ReturnDate) : '-'}</div>
              </div>

              <div class="row">
                <div class="label">วัตถุประสงค์:</div>
                <div>${h.Purpose || '-'}</div>
              </div>

              <div class="row">
                <div class="label">สถานที่:</div>
                <div>${h.Location || '-'}</div>
              </div>

              <div class="row">
                <div class="label">สถานะ:</div>
                <div>
                  <span class="status status-${h.BorrowStatusID}">
                    ${h.StatusName}
                  </span>
                </div>
              </div>

              ${h.Remark && h.BorrowStatusID == 3 ? `
              <div class="row">
                <div class="label">เหตุผลการปฏิเสธ:</div>
                <div class="remark-text">
                  ${h.Remark}
                </div>
              </div>
            ` : ``}
            ${h.OverdueText ? `
            <div class="row">
              <div class="label">หมายเหตุ:</div>
              <div class="remark-text text-danger">
                ${h.OverdueText}
              </div>
            </div>
          ` : ``}
            </div>
          </div>
        `;

        overlay.classList.add("show");
      });
    });

    closeBtn.addEventListener("click", () => {
      overlay.classList.remove("show");
    });

    overlay.addEventListener("click", e => {
      if (e.target === overlay) {
        overlay.classList.remove("show");
      }
    });
  }

  /* ===============================
     CANCEL MODAL
  ============================== */
  const cancelModal = document.getElementById("cancelModal");
  const confirmBtn = document.getElementById("confirmCancelBtn");
  const closeCancelBtn = document.querySelector(".btn-cancel-modal");

  if (cancelModal && confirmBtn && closeCancelBtn) {

    let borrowId = null;

    document.querySelectorAll(".btn-cancel-request").forEach(btn => {
      btn.addEventListener("click", () => {
        borrowId = btn.dataset.id;
        cancelModal.classList.add("show");
      });
    });

    closeCancelBtn.addEventListener("click", () => {
      cancelModal.classList.remove("show");
    });

    cancelModal.addEventListener("click", (e) => {
      if (e.target === cancelModal) {
        cancelModal.classList.remove("show");
      }
    });

    confirmBtn.addEventListener("click", () => {
      if (borrowId) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = `/user/borrow/cancel/${borrowId}`;
        document.body.appendChild(form);
        form.submit();
      }
    });

  }
/* ===============================
     DEFAULT BORROW DATE
  ============================== */
const borrowInput = document.querySelector('[name="BorrowDate"]');
const dueInput = document.querySelector('[name="DueDate"]');

if (borrowInput && dueInput) {

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  function formatDate(date) {
    return date.toISOString().split("T")[0];
  }

  borrowInput.value = formatDate(today);
  borrowInput.min = formatDate(today);

  dueInput.value = formatDate(tomorrow);
  dueInput.min = formatDate(today);

  // ⭐ ป้องกันคืนก่อนยืม
  borrowInput.addEventListener("change", () => {
    dueInput.min = borrowInput.value;

    if (dueInput.value < borrowInput.value) {
      dueInput.value = borrowInput.value;
    }
  });

}
function convertDate(inputId){
  const input = document.getElementById(inputId);

  input.addEventListener("change", function(){

    let parts = this.value.split("-");
    let formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;

    console.log("วันที่เลือก:", formatted);

  });
}

convertDate("borrowDate");
convertDate("dueDate");
});
