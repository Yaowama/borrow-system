console.log("device-edit-image.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);

  if (params.get("success") === "1") {
    showSuccessModal();

    // ลบ query ออกจาก URL (กันเด้งซ้ำตอน refresh)
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  /* ===============================
     ส่วน upload + preview (หน้าแก้ไข)
  =============================== */

  const uploadBox = document.querySelector(".upload-btn");

  // ถ้าไม่ใช่หน้า edit → ข้าม แต่ไม่พัง
  if (uploadBox) {

    const fileInput = uploadBox.querySelector("input[type=file]");
    const previewImg = uploadBox.querySelector("#previewImg");
    const saveBtn = document.querySelector(".btn-save");
    const form = document.querySelector("form");

    function enableSave() {
      if (!saveBtn) return;
      saveBtn.classList.add("active");
      saveBtn.disabled = false;
    }

    if (fileInput) {
      fileInput.addEventListener("change", () => {

        const file = fileInput.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
          alert("กรุณาเลือกไฟล์รูปเท่านั้น");
          fileInput.value = "";
          return;
        }

        if (file.size > 2 * 1024 * 1024) {
          alert("ไฟล์ต้องไม่เกิน 2MB");
          fileInput.value = "";
          return;
        }

        const reader = new FileReader();
        reader.onload = e => {
          previewImg.src = e.target.result;
          uploadBox.classList.add("active");
          enableSave();
        };

        reader.readAsDataURL(file);
      });
    }

    if (form) {
      form.querySelectorAll("input, select, textarea").forEach(el => {
        el.addEventListener("input", enableSave);
        el.addEventListener("change", enableSave);
      });
    }
  }

  /* ===============================
     ส่วน preview รูปแบบง่าย (ถ้ามี)
  =============================== */

  const input = document.getElementById("asset_image");
  const preview = document.getElementById("preview");

  if (input && preview) {
    input.addEventListener("change", () => {
      const file = input.files[0];
      if (file) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
      }
    });
  }

});
document.addEventListener("DOMContentLoaded", () => {

const rows = document.querySelectorAll(".device-row");
const categoryFilter = document.getElementById("categoryFilter");
const typeFilter = document.getElementById("typeFilter");

let categories = new Set();
let types = new Set();

rows.forEach(row=>{
    categories.add(row.dataset.category);
    types.add(row.dataset.type);
});


/* ====== ALL CATEGORY ====== */

let allCategory = document.createElement("div");
allCategory.innerText = "ทั้งหมด";

allCategory.onclick = ()=>{
    rows.forEach(r=>{
        r.style.display = "";
    });
};

categoryFilter.appendChild(allCategory);


/* ====== CATEGORY LIST ====== */

categories.forEach(c=>{
    let div = document.createElement("div");
    div.innerText = c;

    div.onclick = ()=>{
        rows.forEach(r=>{
            r.style.display =
            r.dataset.category === c ? "" : "none";
        });
    };

    categoryFilter.appendChild(div);
});


/* ====== ALL TYPE ====== */

let allType = document.createElement("div");
allType.innerText = "ทั้งหมด";

allType.onclick = ()=>{
    rows.forEach(r=>{
        r.style.display = "";
    });
};

typeFilter.appendChild(allType);


/* ====== TYPE LIST ====== */

types.forEach(t=>{
    let div = document.createElement("div");
    div.innerText = t;

    div.onclick = ()=>{
        rows.forEach(r=>{
            r.style.display =
            r.dataset.type === t ? "" : "none";
        });
    };

    typeFilter.appendChild(div);
});


/* ====== DROPDOWN TOGGLE ====== */

document.querySelectorAll(".filter-head").forEach(head=>{

    head.addEventListener("click",()=>{

        let drop = head.querySelector(".filter-dropdown");

        document.querySelectorAll(".filter-dropdown").forEach(d=>{
            if(d!==drop) d.style.display="none";
        });

        drop.style.display =
        drop.style.display==="block" ? "none":"block";

    });

});

});