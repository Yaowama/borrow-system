/* ================================================================
   register-step.js — Multi-step register form
================================================================ */

/* ---- Error box ---- */
const errBox = document.getElementById('registerError');
let errTimer = null;

function showErr(msg) {
  if (!errBox) return;
  errBox.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + msg;
  errBox.classList.add('show');
  if (errTimer) clearTimeout(errTimer);
  errTimer = setTimeout(() => errBox.classList.remove('show'), 3000);
}
function clearErr() {
  if (!errBox) return;
  errBox.classList.remove('show');
}

/* Auto-hide backend error */
const backendError = document.getElementById('backendError');
if (backendError && backendError.classList.contains('show')) {
  setTimeout(() => backendError.classList.remove('show'), 4000);
}

/* ---- Steps ---- */
let current = 0;
const steps = document.querySelectorAll('.step');
const dots  = document.querySelectorAll('.step-dot');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const titleEl = document.getElementById('stepTitle');

const TITLES = [
  '<i class="fa-solid fa-user-plus"></i> สร้างบัญชี',
  '<i class="fa-solid fa-id-card"></i> ข้อมูลส่วนตัว',
  '<i class="fa-solid fa-phone"></i> ข้อมูลติดต่อ',
  '<i class="fa-solid fa-building"></i> หน่วยงาน',
  '<i class="fa-solid fa-camera"></i> รูปโปรไฟล์'
];

const NEXT_LABELS = ['ถัดไป <i class="fa-solid fa-arrow-right"></i>', 'ถัดไป <i class="fa-solid fa-arrow-right"></i>', 'ถัดไป <i class="fa-solid fa-arrow-right"></i>', 'ถัดไป <i class="fa-solid fa-arrow-right"></i>', '<i class="fa-solid fa-check"></i> สมัครสมาชิก'];

function updateUI() {
  steps.forEach((s, i) => s.classList.toggle('active', i === current));
  dots.forEach((d, i) => {
    d.classList.toggle('active', i === current);
    d.classList.toggle('done',   i < current);
  });
  if (titleEl) titleEl.innerHTML = TITLES[current];
  if (nextBtn) nextBtn.innerHTML = NEXT_LABELS[current];

  // prev button visibility
  if (prevBtn) prevBtn.style.display = current === 0 ? 'none' : 'flex';

}

document.querySelector("form").addEventListener("submit", (e) => {
  if (current !== steps.length - 1) {
    e.preventDefault();
  }
});

/* ---- Validation per step ---- */
const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

function validateStep(idx) {
  const step = steps[idx];

  if (idx === 0) {
    const un = step.querySelector('input[name="username"]');
    const pw = step.querySelector('input[name="password"]');
    const cf = step.querySelector('input[name="confirm"]');
    if (!un || !un.value.trim()) return showErr('กรุณากรอก Username'), false;
    if (!/^[A-Za-z0-9]{4,20}$/.test(un.value)) return showErr('Username ต้องเป็น A-Z a-z 0-9 ความยาว 4-20 ตัว'), false;
    if (!pw.value) return showErr('กรุณากรอกรหัสผ่าน'), false;
    if (!passwordRule.test(pw.value)) return showErr('รหัสผ่านต้องมี A-Z a-z 0-9 สัญลักษณ์ อย่างน้อย 8 ตัว'), false;
    if (pw.value !== cf.value) return showErr('รหัสผ่านไม่ตรงกัน'), false;
  }

  if (idx === 1) {
    const inputs = step.querySelectorAll('input[required]');
    for (const inp of inputs) {
      if (!inp.value.trim()) return showErr('กรุณากรอกข้อมูลให้ครบ'), false;
    }
  }

  if (idx === 2) {
    const email = step.querySelector('input[name="email"]');
    const phone = step.querySelector('input[name="phone"]');
    if (!email.value.trim()) return showErr('กรุณากรอก Email'), false;
    if (!/\S+@\S+\.\S+/.test(email.value)) return showErr('รูปแบบ Email ไม่ถูกต้อง'), false;
    if (!phone.value.trim()) return showErr('กรุณากรอกเบอร์โทร'), false;
  }

  if (idx === 3) {
    const inst = step.querySelector('select[name="InstitutionID"]');
    const dept = step.querySelector('select[name="DepartmentID"]');
    if (!inst.value) return showErr('กรุณาเลือกสำนัก'), false;
    if (!dept.value) return showErr('กรุณาเลือกฝ่าย'), false;
  }

  clearErr();
  return true;
}

/* ---- Next / Prev ---- */
if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
    e.preventDefault(); // 👈 สำคัญมาก

    if (!validateStep(current)) return;

    if (current < steps.length - 1) {
      current++;
      updateUI();
    } else {
      document.querySelector("form").submit();
    }
  });
}

if (prevBtn) {
  prevBtn.addEventListener('click', () => {
    if (current > 0) { current--; updateUI(); }
  });
}

/* ---- Load dropdowns ---- */
async function loadDropdowns() {
  try {
    const [instRes, deptRes] = await Promise.all([
      fetch('/api/institutions'),
      fetch('/api/departments')
    ]);
    const [insts, depts] = await Promise.all([instRes.json(), deptRes.json()]);

    const instSel = document.getElementById('institution');
    const deptSel = document.getElementById('department');

    if (instSel) insts.forEach(i => {
      const o = document.createElement('option');
      o.value = i.InstitutionID;
      o.textContent = i.InstitutionName;
      instSel.appendChild(o);
    });

    if (deptSel) depts.forEach(d => {
      const o = document.createElement('option');
      o.value = d.DepartmentID;
      o.textContent = d.DepartmentName;
      deptSel.appendChild(o);
    });
  } catch(e) { console.error('Dropdown load failed', e); }
}

/* ---- Username: block non-alphanumeric ---- */
const unInput = document.querySelector('input[name="username"]');
if (unInput) {
  unInput.addEventListener('input', () => {
    unInput.value = unInput.value.replace(/[^A-Za-z0-9]/g, '');
  });
}

/* ---- Init ---- */
updateUI();
loadDropdowns();
