document.addEventListener("DOMContentLoaded", () => {

  const alerts = document.querySelectorAll(".error-box, .success-box");

  alerts.forEach(alert => {

    setTimeout(() => {

      alert.style.opacity = "0";

      setTimeout(() => {
        alert.remove();
      }, 500);

    }, 3000); // 4 วินาที

  });

});