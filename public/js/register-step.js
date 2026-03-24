/* ===============================
   REGISTER ERROR BOX
================================ */

const errorBox = document.getElementById("errorBox");
let errorTimeout = null;

function showRegisterError(message) {
  if (!errorBox) return;

  errorBox.innerText = message;
  errorBox.classList.add("show");

  if (errorTimeout) clearTimeout(errorTimeout);

  errorTimeout = setTimeout(() => {
    errorBox.classList.remove("show");
  }, 2500);
}

function clearRegisterError() {
  if (!errorBox) return;

  errorBox.innerText = "";
  errorBox.classList.remove("show");
}

  const backendError = document.getElementById("backendError");

  if (backendError && backendError.classList.contains("show")) {
    setTimeout(() => {
      backendError.classList.remove("show");
    }, 3000);
  }

/* ===============================
   STEP CONTROL
================================ */

let currentStep = 0;

const steps = document.querySelectorAll(".step");
const title = document.getElementById("stepTitle");

const titles = [
  "สร้างบัญชีผู้ใช้",
  "ข้อมูลพนักงาน",
  "ข้อมูลติดต่อ",
  "หน่วยงาน",
  "อัปโหลดรูปโปรไฟล์"
];

const usernameInput = document.querySelector("input[name='username']");

// กันพิมพ์อักขระอื่น
if (usernameInput) {
  usernameInput.addEventListener("input", () => {
    usernameInput.value = usernameInput.value.replace(/[^A-Za-z0-9]/g, "");
  });
}

const phoneInput = document.querySelector("input[name='phone']");
const faxInput = document.querySelector("input[name='fax']");
const empInput = document.querySelector("input[name='EMP_NUM']");

if (phoneInput) {
  phoneInput.addEventListener("input", () => {
    phoneInput.value = phoneInput.value.replace(/[^0-9]/g, "");
  });
}

if (faxInput) {
  faxInput.addEventListener("input", () => {
    faxInput.value = faxInput.value.replace(/[^0-9]/g, "");
  });
}

if (empInput) {
  empInput.addEventListener("input", () => {
    empInput.value = empInput.value.replace(/[^0-9]/g, "");
  });
}
/* ===============================
   INIT
================================ */

if (steps.length > 0) {

  showStep();
}


/* ===============================
   SHOW STEP
================================ */
function showStep() {
  // ซ่อนทุก step
  steps.forEach(step => step.classList.remove("active"));
  steps[currentStep].classList.add("active");

  // เปลี่ยนหัวข้อ
  title.innerText = titles[currentStep];

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  /* =====================
     ปุ่มย้อนกลับ
  ===================== */
  if (currentStep === 0) {
    prevBtn.style.display = "none";
  } else {
    prevBtn.style.display = "flex";
    prevBtn.innerHTML = `
      <i class="fa-solid fa-arrow-left"></i>
      <span>ย้อนกลับ</span>
    `;
  }

  /* =====================
     ปุ่มถัดไป / ยืนยัน
  ===================== */
  if (currentStep === steps.length - 1) {
    nextBtn.innerHTML = `
      <span>ยืนยัน</span>
      <i class="fa-solid fa-circle-check"></i>
    `;
  } else {
    nextBtn.innerHTML = `
      <span>ถัดไป</span>
      <i class="fa-solid fa-arrow-right"></i>
    `;
  }
}


/* ===============================
   BUTTON EVENTS
================================ */

const nextBtn = document.getElementById("nextBtn");
if(nextBtn){
nextBtn.onclick = () => {

  if (!validateStep()) return;

  if (currentStep < steps.length - 1) {
    currentStep++;
    showStep();
  } else {
    document.querySelector("form").submit();
  }
};

const prevBtn = document.getElementById("prevBtn");

if (prevBtn) {
  prevBtn.onclick = () => {
    currentStep--;
    showStep();
  };
}

};

/* ===============================
   VALIDATION + REQUIRED *
================================ */

function validateStep() {

  clearRegisterError();

  const current = steps[currentStep];
  let valid = true;

  // 🔴 ตรวจ required ทุกช่องใน step นั้น
  const inputs = current.querySelectorAll(
    "input[required], select[required]"
  );

  inputs.forEach(input => {

    const label = input
      .closest(".input")
      .previousElementSibling
      ?.querySelector(".required");

    if (!input.value.trim()) {
      if (label) label.style.display = "inline";
      valid = false;
    } else {
      if (label) label.style.display = "none";
    }
  });

  if (!valid) {
    showRegisterError("กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบ");
    return false;
  }

if (currentStep === 0) {

  const password = document.querySelector('input[name="password"]');
  const confirm  = document.querySelector('input[name="confirm"]');
  const username = document.querySelector('input[name="username"]').value;

  const usernameRule = /^[A-Za-z0-9]{4,20}$/;
  const passwordRule =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

  if (!usernameRule.test(username)) {
    showRegisterError("Username ต้องเป็นอังกฤษ/ตัวเลข และยาว 4-20 ตัว");
    return false;
  }

  if (!passwordRule.test(password.value)) {
    showRegisterError(
      "รหัสผ่านต้องมี 8 ตัวขึ้นไป และต้องมี A-Z a-z 0-9 และอักขระพิเศษ"
    );
    return false;
  }

  if (password.value !== confirm.value) {
    showRegisterError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
    return false;
  }
}
if (currentStep === 1) {

  const emp = document.querySelector('input[name="EMP_NUM"]').value.trim();

  const empRule = /^[0-9]{4,10}$/; // กำหนด 4-10 หลัก (ปรับได้)

  if (!empRule.test(emp)) {
    showRegisterError("รหัสพนักงานต้องเป็นตัวเลขเท่านั้น");
    return false;
  }
}

if (currentStep === 2) {

  const email = document.querySelector('input[name="email"]').value.trim();
  const phone = document.querySelector('input[name="phone"]').value.trim();
  const fax   = document.querySelector('input[name="fax"]').value.trim();

  const emailRule = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRule = /^[0-9]{10}$/;
  const faxRule   = /^[0-9]+$/;

  if (!emailRule.test(email)) {
    showRegisterError("รูปแบบ Email ไม่ถูกต้อง");
    return false;
  }

  if (!phoneRule.test(phone)) {
    showRegisterError("เบอร์โทรต้องเป็นตัวเลข 10 หลัก");
    return false;
  }

  if (!faxRule.test(fax)) {
    showRegisterError("โทรสารต้องเป็นตัวเลขเท่านั้น");
    return false;
  }
}

  if (currentStep === 4) {
    const imageInput = document.getElementById("imageInput");

    if (!imageInput.files || imageInput.files.length === 0) {
      showRegisterError("กรุณาอัปโหลดรูปโปรไฟล์");
      return false;
    }
  }


  return true;
}

// ===============================
// LOAD MASTER DATA
// ===============================

fetch("/api/institutions")
  .then(res => res.json())
  .then(data => {
    const select = document.getElementById("institution");
    data.forEach(i => {
      select.innerHTML += `
        <option value="${i.InstitutionID}">
          ${i.InstitutionName}
        </option>`;
    });
  });

fetch("/api/departments")
  .then(res => res.json())
  .then(data => {
    const select = document.getElementById("department");
    data.forEach(d => {
      select.innerHTML += `
        <option value="${d.DepartmentID}">
          ${d.DepartmentName}
        </option>`;
    });
  });

