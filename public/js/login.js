document.addEventListener("DOMContentLoaded", () => {

  const alerts = document.querySelectorAll(".error-box, .success-box");
  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = "0";
      setTimeout(() => alert.remove(), 500);
    }, 3000);
  });

  const otpBtn = document.getElementById("otpBtn");
  const loader = document.getElementById("globalLoader");

  if (otpBtn) {
    otpBtn.addEventListener("click", function (e) {
      e.preventDefault();
      const form = this.form;
      loader.classList.remove("hidden");
      this.disabled = true;
      setTimeout(() => { form.submit(); }, 300);
    });
  }

});

document.addEventListener("DOMContentLoaded", () => {
  const form   = document.querySelector("form[action='/login']");
  const loader = document.getElementById("globalLoader");

  if (!form || !loader) return;

  loader.classList.add("hidden");

  form.addEventListener("submit", () => {
    loader.classList.remove("hidden");
  });
});

window.addEventListener("pageshow", () => {
  const loader = document.getElementById("globalLoader");
  if (loader) loader.classList.add("hidden");
});