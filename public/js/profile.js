async function toggle2FA(cb){
  try {
    const r = await fetch('/toggle-2fa', {
      method: 'POST'
    });

    const d = await r.json();

    if (!d.ok) {
      cb.checked = !cb.checked;
      return;
    }

    const lbl = document.getElementById('tfaLabel');

    lbl.className = 'twofa-status ' + (d.enabled ? 'on' : 'off');
    lbl.textContent = d.enabled ? 'เปิดใช้งาน' : 'ปิดอยู่';

  } catch (err) {
    console.error(err);
    cb.checked = !cb.checked;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const cb = document.getElementById("tfaCheck");

  if (!cb) return;

  cb.addEventListener("change", async () => {
    const enable = cb.checked;

    try {
      const r = await fetch('/user/toggle-2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enable })   // ✅ เพิ่มตรงนี้
      });

      const d = await r.json();

      if (!d.success) {   
        cb.checked = !enable;
        return;
      }

      const lbl = document.getElementById("tfaLabel");

      lbl.className = "twofa-status " + (enable ? "on" : "off");
      lbl.textContent = enable ? "เปิดใช้งาน" : "ปิดอยู่";

    } catch (err) {
      console.error(err);
      cb.checked = !enable;
    }
  });
});