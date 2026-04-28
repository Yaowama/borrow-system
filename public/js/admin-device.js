console.log("admin-device.js loaded");

/* ===============================
   STATE
================================ */
let deleteId   = null;
let deleteType = null;
let activeFilters = { category: null, type: null };
let searchQuery   = "";
let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;

  handleQueryStatus();
  initTabs();
  initSearch();
  initFilters();
  initDeleteModal();
  initImageModal();
  initTypeModal();
  numberedRows();
  highlightRowFromURL();
  initExportModal();
  initCategoryModal(); 
  initBrandModal();     
  initModelModal();
}

// รองรับทั้งกรณีที่ DOM พร้อมแล้ว และยังไม่พร้อม
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* ===============================
   EXPORT MODAL
================================ */
function initExportModal() {
  const modal      = document.getElementById("exportModal");
  const btnOpen    = document.getElementById("btnExportDevice");
  const btnClose   = document.getElementById("closeExportModal");
  const btnCancel  = document.getElementById("cancelExportBtn");
  const btnConfirm = document.getElementById("confirmExportBtn");
  const brandSel   = document.getElementById("exportBrand");

  if (!modal) return;

  // โหลดยี่ห้อทั้งหมดตอนเปิด modal
  btnOpen?.addEventListener("click", async () => {
    // โหลด brand list
    try {
      const res    = await fetch("/admin/api/brands");
      const brands = await res.json();
      brandSel.innerHTML = `<option value="">ทั้งหมด</option>`;
      brands.forEach(b => {
        brandSel.innerHTML += `<option value="${b.BrandID}">${b.BrandName}</option>`;
      });
    } catch (e) {
      brandSel.innerHTML = `<option value="">ทั้งหมด</option>`;
    }
    modal.classList.add("show");
  });

  const close = () => modal.classList.remove("show");
  btnClose?.addEventListener("click", close);
  btnCancel?.addEventListener("click", close);
  modal?.addEventListener("click", e => { if (e.target === modal) close(); });

  // ดาวน์โหลด
  btnConfirm?.addEventListener("click", () => {
    const type   = document.getElementById("exportType").value;
    const brand  = document.getElementById("exportBrand").value;
    const status = document.getElementById("exportStatus").value;

    const params = new URLSearchParams();
    if (type)   params.set("type",   type);
    if (brand)  params.set("brand",  brand);
    if (status) params.set("status", status);

    window.location.href = `/admin/device/export/excel?${params.toString()}`;
    close();
  });
}

/* ===============================
   TAB SWITCH
================================ */
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

// Global ไว้รองรับ onclick="switchTab(...)" ที่อาจยังมีใน template อื่น
window.switchTab = function(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));

  const section = document.getElementById(`${tab}-section`);
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);

  section?.classList.add("active");
  btn?.classList.add("active");
};


function initSearch() {
  const input = document.getElementById("searchInput");
  if (!input) return;

  // สร้าง dropdown container
  const wrapper = input.closest(".search") || input.parentElement;
  wrapper.style.position = "relative";

  const dropdown = document.createElement("div");
  dropdown.id = "searchSuggestions";
  dropdown.style.cssText = `
    display:none; position:absolute; top:100%; left:0; right:0;
    background:#fff; border:1px solid #ddd; border-radius:8px;
    box-shadow:0 4px 12px rgba(0,0,0,.12); z-index:9999;
    max-height:320px; overflow-y:auto; margin-top:4px;
  `;
  wrapper.appendChild(dropdown);

  let debounceTimer = null;

  // Live search ขณะพิมพ์
  input.addEventListener("input", () => {
    searchQuery = input.value.trim().toLowerCase();
    applyFilters(); // filter ตารางปกติ

    clearTimeout(debounceTimer);
    const keyword = input.value.trim();

    if (keyword.length < 2) {
      dropdown.style.display = "none";
      return;
    }

    // debounce 300ms กันยิง API ถี่เกิน
    debounceTimer = setTimeout(() => fetchSuggestions(keyword, dropdown), 300);
  });

  // กด Enter = exact search
  input.addEventListener("keypress", async (e) => {
    if (e.key !== "Enter") return;
    const keyword = input.value.trim();
    if (!keyword) return;

    dropdown.style.display = "none";

    try {
      const res  = await fetch(`/admin/search-asset?q=${encodeURIComponent(keyword)}`);
      const data = await res.json();

      if (data.found) {
        window.location.href = `/admin/device/${data.modelId}?highlight=${encodeURIComponent(data.assetTag)}`;
      } else if (data.suggestions?.length === 1) {

        const s = data.suggestions[0];
        window.location.href = `/admin/device/${s.ModelID}?highlight=${encodeURIComponent(s.AssetTag || s.ITCode || s.SerialNumber)}`;
      } else {
      }
    } catch (err) {
    }
  });

  // ปิด dropdown เมื่อคลิกข้างนอก
  document.addEventListener("click", e => {
    if (!wrapper.contains(e.target)) dropdown.style.display = "none";
  });
}

async function fetchSuggestions(keyword, dropdown) {
  try {
    const res  = await fetch(`/admin/search-asset?q=${encodeURIComponent(keyword)}`);
    const data = await res.json();

    dropdown.innerHTML = "";

    // ถ้า exact match ก็แสดงเป็น suggestion แรก
    if (data.found) {
      dropdown.style.display = "none";
      window.location.href = `/admin/device/${data.modelId}?highlight=${encodeURIComponent(data.assetTag)}`;
      return;
    }

    if (!data.suggestions?.length) {
      dropdown.innerHTML = `<div style="padding:12px 16px;color:#999;font-size:13px;">ไม่พบอุปกรณ์</div>`;
      dropdown.style.display = "block";
      return;
    }

    data.suggestions.forEach(s => {
      const matchVal = s.AssetTag || s.ITCode || s.SerialNumber;
      const div = document.createElement("div");
      div.style.cssText = `
        padding:10px 16px; cursor:pointer; border-bottom:1px solid #f0f0f0;
        display:flex; flex-direction:column; gap:2px;
      `;
      div.innerHTML = `
        <span style="font-weight:600;font-size:13px;">${s.DeviceName} — ${s.ModelName}</span>
        <span style="font-size:12px;color:#666;">
          ${s.AssetTag ? `AssetTag: <b>${highlight(s.AssetTag, keyword)}</b>` : ""}
          ${s.ITCode   ? ` | IT: <b>${highlight(s.ITCode, keyword)}</b>` : ""}
          ${s.SerialNumber ? ` | S/N: <b>${highlight(s.SerialNumber, keyword)}</b>` : ""}
        </span>
      `;
      div.addEventListener("mouseenter", () => div.style.background = "#f5f5f5");
      div.addEventListener("mouseleave", () => div.style.background = "");
      div.addEventListener("click", () => {
        window.location.href = `/admin/device/${s.ModelID}?highlight=${encodeURIComponent(matchVal)}`;
      });
      dropdown.appendChild(div);
    });

    dropdown.style.display = "block";

  } catch (err) {
    console.error("suggestion error:", err);
  }
}

// ไฮไลท์คำที่พิมพ์ใน suggestion
function highlight(text, keyword) {
  if (!text) return "";
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), `<mark style="background:#fff3b0;border-radius:2px;">$1</mark>`);
}

function highlightRowFromURL() {
  const params = new URLSearchParams(window.location.search);
  const highlight = params.get("highlight");
  if (!highlight) return;

  document.querySelectorAll(".device-list-row").forEach(row => {
    const asset  = row.children[2]?.innerText.trim();
    const itcode = row.children[3]?.innerText.trim();
    const serial = row.children[4]?.innerText.trim();

    if ([asset, itcode, serial].includes(highlight)) {
      row.style.background = "#fffcf4";
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

/* ===============================
   FILTER DROPDOWNS
================================ */
function initFilters() {
  buildFilterDropdown("categoryFilter", "catHead",   "category");
  buildFilterDropdown("typeFilter",     "typeHead",  "type");

  // Close dropdowns on outside click
  document.addEventListener("click", e => {
    if (!e.target.closest(".filter-head")) {
      document.querySelectorAll(".filter-dropdown").forEach(d => d.classList.remove("open"));
      document.querySelectorAll(".filter-head").forEach(h => h.classList.remove("open"));
    }
  });
}

function buildFilterDropdown(dropdownId, headId, filterKey) {
  const dropdown = document.getElementById(dropdownId);
  const head = document.getElementById(headId);
  if (!dropdown || !head) return;

  dropdown.innerHTML = "";
  
  // 🔥 ป้องกัน bind ซ้ำ
  if (head.dataset.initialized === "true") return;
  head.dataset.initialized = "true";

  

  const values = new Set();
  document.querySelectorAll(".device-row").forEach(row => {
    const v = row.dataset[filterKey];
    if (v) values.add(v);
  });

  const allOpt = document.createElement("div");
  allOpt.className = "filter-option active";
  allOpt.textContent = "ทั้งหมด";
  allOpt.dataset.value = "";
  dropdown.appendChild(allOpt);

  [...values].sort().forEach(v => {
    const opt = document.createElement("div");
    opt.className = "filter-option";
    opt.textContent = v;
    opt.dataset.value = v;
    dropdown.appendChild(opt);
  });

// แก้ใน buildFilterDropdown
head.addEventListener("click", e => {
  e.stopPropagation();
  const isOpen = dropdown.classList.contains("open");

  document.querySelectorAll(".filter-dropdown").forEach(d => d.classList.remove("open"));
  document.querySelectorAll(".filter-head").forEach(h => h.classList.remove("open"));

  if (!isOpen) {
    const rect = head.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;

    
    dropdown.style.position = "fixed";
    dropdown.style.top  = (rect.bottom + 6) + "px";
    dropdown.style.left = rect.left + "px";
    dropdown.style.transform = "none";

    dropdown.classList.add("open");
    head.classList.add("open");
  }
});

  dropdown.addEventListener("click", e => {
    e.stopPropagation();
    const opt = e.target.closest(".filter-option");
    if (!opt) return;

    dropdown.querySelectorAll(".filter-option").forEach(o => o.classList.remove("active"));
    opt.classList.add("active");

    activeFilters[filterKey] = opt.dataset.value || null;
    dropdown.classList.remove("open");
    head.classList.remove("open");

    head.classList.toggle("has-filter", !!activeFilters[filterKey]);

    applyFilters();
    updateFilterChips();
  });
}


/* ===============================
   APPLY FILTERS + SEARCH
================================ */
function applyFilters() {
  const rows = document.querySelectorAll(".device-row");
  let visibleCount = 0;
  let rowNum = 0;

  rows.forEach(row => {
    const cat   = row.dataset.category?.toLowerCase() || "";
    const type  = row.dataset.type?.toLowerCase() || "";
    const name  = row.dataset.name?.toLowerCase() || "";
    const brand = row.dataset.brand?.toLowerCase() || "";
    const model = row.dataset.model?.toLowerCase() || "";

    const matchCat    = !activeFilters.category || cat === activeFilters.category.toLowerCase();
    const matchType   = !activeFilters.type     || type === activeFilters.type.toLowerCase();
    const matchSearch = !searchQuery || [name, brand, model, type, cat].some(v => v.includes(searchQuery));

    const visible = matchCat && matchType && matchSearch;
    row.style.display = visible ? "" : "none";

    if (visible) {
      rowNum++;
      const numCell = row.querySelector(".row-num");
      if (numCell) numCell.textContent = rowNum;
      visibleCount++;
    }
  });

  // Empty state
  const emptyState = document.getElementById("emptyState");
  if (emptyState) emptyState.style.display = visibleCount === 0 ? "block" : "none";
}


/* ===============================
   FILTER CHIPS
================================ */
function updateFilterChips() {
  const container = document.getElementById("activeFilters");
  if (!container) return;

  container.innerHTML = "";

  Object.entries(activeFilters).forEach(([key, val]) => {
    if (!val) return;

    const chip = document.createElement("div");
    chip.className = "filter-chip";
    chip.innerHTML = `
      <span>${val}</span>
      <button aria-label="ลบตัวกรอง" data-key="${key}">✕</button>
    `;
    chip.querySelector("button").addEventListener("click", () => {
      activeFilters[key] = null;

      // Reset the dropdown option
      const dropId = key === "category" ? "categoryFilter" : "typeFilter";
      const headId = key === "category" ? "catHead" : "typeHead";
      document.querySelector(`#${dropId} .filter-option`)?.classList.add("active");
      document.querySelectorAll(`#${dropId} .filter-option:not(:first-child)`).forEach(o => o.classList.remove("active"));
      document.getElementById(headId)?.classList.remove("has-filter");

      applyFilters();
      updateFilterChips();
    });

    container.appendChild(chip);
  });
}


/* ===============================
   AUTO-NUMBER ROWS
================================ */
function numberedRows() {
  let i = 1;
  document.querySelectorAll(".device-row").forEach(row => {
    const cell = row.querySelector(".row-num");
    if (cell) cell.textContent = i++;
  });
}


/* ===============================
   DELETE MODAL
================================ */
function initDeleteModal() {
  const modal     = document.getElementById("deleteModal");
  const confirmBtn = document.getElementById("confirmDeleteBtn");
  const cancelBtn  = document.getElementById("cancelDeleteBtn");
  const desc       = document.getElementById("deleteModalDesc");

  // Device rows
  document.querySelectorAll(".btn-icon.del").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      deleteId   = btn.dataset.id;
      deleteType = btn.dataset.type;
      const name = btn.dataset.name || "รายการนี้";
      if (desc) desc.textContent = `คุณต้องการลบ "${name}" ใช่หรือไม่?`;
      modal?.classList.add("show");
    });
  });

  // Type delete buttons
  document.querySelectorAll(".btn-type-del").forEach(btn => {
    btn.addEventListener("click", () => {
      const id   = btn.dataset.id;
      const name = btn.dataset.name || "ประเภทนี้";
      if (desc) desc.textContent = `คุณต้องการลบประเภท "${name}" ใช่หรือไม่?`;
      deleteId   = id;
      deleteType = "deviceType";
      modal?.classList.add("show");
    });
  });

  confirmBtn?.addEventListener("click", () => {
    if (!deleteId || !deleteType) return;

    if (deleteType === "model")      window.location.href = `/admin/device/model/delete/${deleteId}`;
    if (deleteType === "item")       window.location.href = `/admin/device/item/${deleteId}/delete`;
    if (deleteType === "deviceType") window.location.href = `/admin/type/delete/${deleteId}`;
    if (deleteType === "category")   window.location.href = `/admin/category/delete/${deleteId}`;
    if (deleteType === "brand")      window.location.href = `/admin/brand/delete/${deleteId}`;
    if (deleteType === "model-item") window.location.href = `/admin/model/delete/${deleteId}`;
  });

  cancelBtn?.addEventListener("click", () => modal?.classList.remove("show"));

  modal?.addEventListener("click", e => {
    if (e.target === modal) modal.classList.remove("show");
  });
}


/* ===============================
   IMAGE MODAL
================================ */
function initImageModal() {
  const modal    = document.getElementById("imageModal");
  const closeBtn = document.getElementById("closeImageModal");
  const img      = document.getElementById("modalImage");

  document.querySelectorAll(".device-img.clickable").forEach(el => {
    el.addEventListener("click", () => {
      const src = el.dataset.src || el.src;
      if (!src || !modal || !img) return;
      img.src = src;
      modal.classList.add("open");
    });
  });

  closeBtn?.addEventListener("click", () => modal?.classList.remove("open"));
  modal?.addEventListener("click", e => {
    if (e.target === modal || e.target === closeBtn) modal.classList.remove("open");
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") modal?.classList.remove("open");
  });
}


/* ===============================
   TYPE MODAL
================================ */
function initTypeModal() {
  const modal    = document.getElementById("typeModal");
  const form     = document.getElementById("typeForm");
  const btnAdd   = document.getElementById("btnAddType");
  const btnClose = document.getElementById("closeTypeModal");
  const btnCancel= document.getElementById("cancelTypeBtn");

  // Image preview
  const fileInput  = document.getElementById("typeImageInput");
  const preview    = document.getElementById("typeImgPreview");
  const previewImg = document.getElementById("typeImgPreviewImg");
  const removeBtn  = document.getElementById("removeTypeImg");

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      previewImg.src = e.target.result;
      preview.style.display = "block";
    };
    reader.readAsDataURL(file);
  });

  removeBtn?.addEventListener("click", () => {
    fileInput.value = "";
    previewImg.src = "";
    preview.style.display = "none";
  });

  // Open for add
  btnAdd?.addEventListener("click", () => {
    resetTypeModal("เพิ่มประเภท", "บันทึก");
    modal?.classList.add("show");
  });

  // Close
  const closeModal = () => modal?.classList.remove("show");
  btnClose?.addEventListener("click", closeModal);
  btnCancel?.addEventListener("click", closeModal);
  modal?.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  // Edit buttons
  document.querySelectorAll(".btn-type-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const id   = btn.dataset.id;
      const name = btn.dataset.name;
      resetTypeModal("แก้ไขประเภท", "บันทึกการแก้ไข");
      document.getElementById("typeId").value   = id;
      document.getElementById("typeName").value = name;
      modal?.classList.add("show");
    });
  });
}


function resetTypeModal(title, submitLabel) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalSubmitLabel").textContent = submitLabel;
  document.getElementById("typeId").value = "";
  document.getElementById("typeName").value = "";
  document.getElementById("typeImageInput").value = "";

  const preview = document.getElementById("typeImgPreview");
  if (preview) preview.style.display = "none";
}


/* ===============================
   SUCCESS MODAL
================================ */
window.showSuccessModal = function(type) {
  const modal = document.getElementById("successModal");
  if (!modal) return;

  const title = document.getElementById("successTitle");
  const desc  = document.getElementById("successDesc");
  const successIcon = modal.querySelector(".check-wrapper.success");
  const errorIcon   = modal.querySelector(".check-wrapper.danger");

  const map = {
    add:      ["บันทึกสำเร็จ",         "เพิ่มอุปกรณ์เรียบร้อยแล้ว"],
    edit:     ["บันทึกสำเร็จ",         "แก้ไขข้อมูลเรียบร้อยแล้ว"],
    delete:   ["ลบสำเร็จ",             "ลบข้อมูลเรียบร้อยแล้ว"],
    approve:  ["อนุมัติสำเร็จ",        "อนุมัติรายการเรียบร้อยแล้ว"],
    reject:   ["ปฏิเสธสำเร็จ",         "ปฏิเสธรายการยืมเรียบร้อยแล้ว"],
    return:   ["คืนอุปกรณ์สำเร็จ",     "อุปกรณ์ถูกคืนเข้าระบบเรียบร้อยแล้ว"],
    cancel:   ["ยกเลิกสำเร็จ",         "คำสั่งซ่อมถูกยกเลิกแล้ว"],
    start:    ["รับงานสำเร็จ",          "บันทึกการรับงานเรียบร้อยแล้ว"],
    finish:   ["ซ่อมเสร็จแล้ว",        "อัปเดตสถานะเรียบร้อยแล้ว"],
    create:   ["ส่งซ่อมสำเร็จ",        "บันทึกการส่งซ่อมเรียบร้อยแล้ว"],
    password: ["เปลี่ยนรหัสผ่านสำเร็จ","เปลี่ยนรหัสผ่านเรียบร้อยแล้ว"],
    error:    ["เกิดข้อผิดพลาด",        "กรุณาลองใหม่อีกครั้ง"],
  };

  const [t, d] = map[type] || ["สำเร็จ", ""];
  if (title) title.textContent = t;
  if (desc)  desc.textContent  = d;

  if (successIcon) successIcon.style.display = type === "error" ? "none" : "flex";
  if (errorIcon)   errorIcon.style.display   = type === "error" ? "flex" : "none";

  modal.classList.remove("show");
  void modal.offsetWidth; // force reflow for animation restart
  modal.classList.add("show");

  setTimeout(() => modal.classList.remove("show"), 2200);
};


/* ===============================
   SUCCESS / ERROR FROM URL PARAMS
================================ */
function handleQueryStatus() {
  const params = new URLSearchParams(window.location.search);

  const success = params.get("success");
  const error   = params.get("error");

  if (success) {
    setTimeout(() => {
      showSuccessModal(success);
      window.history.replaceState({}, document.title, window.location.pathname);
    }, 100);
  }

  if (error) {
    const toast   = document.getElementById("errorToast");
    const msgEl   = document.getElementById("errorToastMsg");
    const messages = {
      used:    "ไม่สามารถลบได้ เนื่องจากมีการใช้งานอยู่",
      notfound:"ไม่พบข้อมูลที่ต้องการ",
      default: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
    };
    if (msgEl) msgEl.textContent = messages[error] || messages.default;
    if (toast) {
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 3500);
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}


/* ===============================
   BRAND → MODEL SELECT (add device form)
================================ */
const brandSelect = document.getElementById("brandSelect");
const modelSelect = document.getElementById("modelSelect");

if (brandSelect && modelSelect) {
  brandSelect.addEventListener("change", async () => {
    const brandId = brandSelect.value;
    modelSelect.innerHTML = `<option value="">เลือกรุ่น</option>`;
    modelSelect.disabled = true;
    if (!brandId) return;

    try {
      const res    = await fetch(`/admin/device/models/${brandId}`);
      const models = await res.json();
      models.forEach(m => {
        const opt = document.createElement("option");
        opt.value       = m.ModelID;
        opt.textContent = m.ModelName;
        modelSelect.appendChild(opt);
      });
      modelSelect.disabled = models.length === 0;
    } catch (err) {
      console.error("โหลดรุ่นไม่สำเร็จ:", err);
    }
  });
}


/* ===============================
   BACK BUTTON
================================ */
document.getElementById("btnBack")?.addEventListener("click", () => {
  history.length > 1 ? history.back() : window.location.href = "/admin/device";
});


/* ===============================
   JS SUCCESS ACTION (approve / repair)
================================ */
document.querySelectorAll(".js-success-action").forEach(btn => {
  btn.addEventListener("click", e => {
    e.preventDefault();
    const type = btn.dataset.type || "approve";
    const url  = btn.getAttribute("href");
    showSuccessModal(type);
    setTimeout(() => window.location.href = url, 1200);
  });
});

// ============================
// CATEGORY MODAL
// ============================
function initCategoryModal() {
  const modal = document.getElementById("categoryModal");
  const form  = document.getElementById("categoryForm");
  if (!modal) return;

  const close = () => modal.classList.remove("show");
  document.getElementById("closeCategoryModal")?.addEventListener("click", close);
  document.getElementById("cancelCategoryBtn")?.addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  document.getElementById("btnAddCategory")?.addEventListener("click", () => {
    document.getElementById("categoryModalTitle").textContent = "เพิ่มหมวด";
    document.getElementById("categoryId").value = "";
    document.getElementById("categoryName").value = "";
    modal.classList.add("show");
  });

  document.querySelectorAll(".btn-cat-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("categoryModalTitle").textContent = "แก้ไขหมวด";
      document.getElementById("categoryId").value = btn.dataset.id;
      document.getElementById("categoryName").value = btn.dataset.name;
      modal.classList.add("show");
    });
  });

  document.querySelectorAll(".btn-cat-del").forEach(btn => {
    btn.addEventListener("click", () => {
      const desc = document.getElementById("deleteModalDesc");
      if (desc) desc.textContent = `คุณต้องการลบหมวด "${btn.dataset.name}" ใช่หรือไม่?`;
      deleteId   = btn.dataset.id;
      deleteType = "category";
      document.getElementById("deleteModal")?.classList.add("show");
    });
  });
}

// ============================
// BRAND MODAL
// ============================
function initBrandModal() {
  const modal = document.getElementById("brandModal");
  if (!modal) return;

  const close = () => modal.classList.remove("show");
  document.getElementById("closeBrandModal")?.addEventListener("click", close);
  document.getElementById("cancelBrandBtn")?.addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  document.getElementById("btnAddBrand")?.addEventListener("click", () => {
    document.getElementById("brandModalTitle").textContent = "เพิ่มยี่ห้อ";
    document.getElementById("brandId").value = "";
    document.getElementById("brandName").value = "";
    modal.classList.add("show");
  });

  document.querySelectorAll(".btn-brand-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("brandModalTitle").textContent = "แก้ไขยี่ห้อ";
      document.getElementById("brandId").value = btn.dataset.id;
      document.getElementById("brandName").value = btn.dataset.name;
      modal.classList.add("show");
    });
  });

  document.querySelectorAll(".btn-brand-del").forEach(btn => {
    btn.addEventListener("click", () => {
      const desc = document.getElementById("deleteModalDesc");
      if (desc) desc.textContent = `คุณต้องการลบยี่ห้อ "${btn.dataset.name}" ใช่หรือไม่?`;
      deleteId   = btn.dataset.id;
      deleteType = "brand";
      document.getElementById("deleteModal")?.classList.add("show");
    });
  });
}

// ============================
// MODEL MODAL
// ============================
function initModelModal() {
  const modal = document.getElementById("modelModal");
  if (!modal) return;

  const close = () => modal.classList.remove("show");
  document.getElementById("closeModelModal")?.addEventListener("click", close);
  document.getElementById("cancelModelBtn")?.addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  document.getElementById("btnAddModel")?.addEventListener("click", () => {
    document.getElementById("modelModalTitle").textContent = "เพิ่มรุ่น";
    document.getElementById("modelId").value = "";
    document.getElementById("modelName").value = "";
    document.getElementById("modelBrand").value = "";
    modal.classList.add("show");
  });

  document.querySelectorAll(".btn-model-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("modelModalTitle").textContent = "แก้ไขรุ่น";
      document.getElementById("modelId").value = btn.dataset.id;
      document.getElementById("modelName").value = btn.dataset.name;
      document.getElementById("modelBrand").value = btn.dataset.brand;
      modal.classList.add("show");
    });
  });

  document.querySelectorAll(".btn-model-del").forEach(btn => {
    btn.addEventListener("click", () => {
      const desc = document.getElementById("deleteModalDesc");
      if (desc) desc.textContent = `คุณต้องการลบรุ่น "${btn.dataset.name}" ใช่หรือไม่?`;
      deleteId   = btn.dataset.id;
      deleteType = "model-item";
      document.getElementById("deleteModal")?.classList.add("show");
    });
  });
}