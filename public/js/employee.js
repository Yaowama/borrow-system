document.addEventListener("DOMContentLoaded", () => {

  const modal = document.getElementById("employeeModal");
  const closeBtn = document.getElementById("closeEmployeeModal");
  const form = document.getElementById("employeeForm");
  const profileInput = document.getElementById("profileImageInput");
  const profilePreview = document.getElementById("profilePreview");

  if (!modal || !form) return;

  let currentEmployeeId = null;

  /* ================= HELPER ================= */

async function apiFetch(url, options = {}) {
  try {

    const res = await fetch(url, {
      credentials: "same-origin",
      ...options
    });

    const result = await res.json();

    if (!res.ok) {

      showSuccessModal("error");

      return null;
    }

    return result;

  } catch (err) {

    console.error(err);

    showSuccessModal("error");

    return null;
  }
}


  function showModal() {
    modal.classList.add("show");
  }

  function hideModal() {
    modal.classList.remove("show");
    form.reset();
  }

  /* ================= OPEN MODAL ================= */

  document.addEventListener("click", async (e) => {

    /* ===== VIEW BUTTON ===== */
    const viewBtn = e.target.closest(".btn-view");
    if (viewBtn) {

      const id = viewBtn.dataset.id;
      currentEmployeeId = id;

      const data = await apiFetch(`/admin/employee/detail/${id}`);
      if (!data) return;

      // เติมข้อมูลลงฟอร์ม
      if (form.fname) form.fname.value = data.fname || "";
      if (form.lname) form.lname.value = data.lname || "";
      if (form.email) form.email.value = data.email || "";
      if (form.phone) form.phone.value = data.phone || "";

      if (form.DepartmentID) form.DepartmentID.value = data.DepartmentID || "";
      if (form.InstitutionID) form.InstitutionID.value = data.InstitutionID || "";

      if (form.RoleID)
        form.RoleID.value = data.RoleID || "";

      if (form.IsActive)
        form.IsActive.value = data.IsActive || "";

      if (form.password) form.password.value = "";
      if (form.username)
        form.username.value = data.username || "";

      if (form.EMP_NUM)
        form.EMP_NUM.value = data.EMP_NUM || "";

      if (form.fax)
        form.fax.value = data.fax || "";

      if (form.CreateDate)
        form.CreateDate.value = data.CreateDate
          ? new Date(data.CreateDate).toLocaleDateString("th-TH")
          : "";


      // รูปโปรไฟล์
      profilePreview.src = data.ProfileImage
        ? `/uploads/profile/${data.ProfileImage}`
        : "/images/default-profile.png";

      showModal();
    }

    /* ===== TOGGLE STATUS ===== */
    const toggleBtn = e.target.closest(".btn-toggle");
    if (toggleBtn) {

      const id = toggleBtn.dataset.id;

      if (!confirm("ต้องการเปลี่ยนสถานะใช่หรือไม่?")) return;

      const result = await apiFetch(`/admin/employee/toggle/${id}`, {
        method: "PUT"
      });

      if (!result) return;

      const icon = toggleBtn.querySelector("i");
      const row = toggleBtn.closest("tr");

      if (icon) {
        icon.className = result.IsActive
          ? "fa-solid fa-toggle-on"
          : "fa-solid fa-toggle-off";
      }

      if (row) {
        row.children[6].innerHTML = result.IsActive
          ? `<span class="badge green">ใช้งาน</span>`
          : `<span class="badge red">ปิดใช้งาน</span>`;
      }
    }

  });

  /* ================= IMAGE PREVIEW ================= */

  if (profileInput) {
    profileInput.addEventListener("change", function () {
      const file = this.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = e => {
        profilePreview.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ================= SAVE FORM ================= */
form.addEventListener("submit", async (e) => {

  e.preventDefault();

  if (!currentEmployeeId) return;

  const formData = new FormData(form);

  try {

    const res = await fetch(`/admin/employee/update/${currentEmployeeId}`, {
      method: "PUT",
      body: formData,
      credentials: "same-origin"
    });

    const result = await res.json();

    if (!res.ok) {

      // ใช้ toast error จาก layout
      showSuccessModal("error");

      return;
    }

    // ใช้ modal success จาก layout กลาง
    showSuccessModal("edit");

    hideModal();

    setTimeout(() => {
      location.reload();
    }, 1400);

  } catch (err) {

    console.error(err);

    showSuccessModal("error");

  }

});

  /* ================= CLOSE ================= */

  if (closeBtn) {
    closeBtn.addEventListener("click", hideModal);
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) hideModal();
  });

  
/* ================= SEARCH ================= */

const searchInput = document.querySelector(".admin-search");
const table = document.getElementById("employeeTable");

if (searchInput && table) {

  const rows = table.querySelectorAll("tbody tr");

  searchInput.addEventListener("keyup", () => {

    const keyword = searchInput.value.toLowerCase();

    rows.forEach(row => {

      const text = row.innerText.toLowerCase();

      if (text.includes(keyword)) {
        row.style.display = "";
      } else {
        row.style.display = "none";
      }

    });

  });

}

});
