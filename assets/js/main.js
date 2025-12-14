// Countdown to next show
// Set this date/time to your real show datetime


const targetDate = new Date("2025-08-06T19:00:00"); // local time

function updateCountdown() {
  const now = new Date();
  const diff = targetDate - now;

  const daysEl = document.getElementById("days");
  const hoursEl = document.getElementById("hours");
  const minutesEl = document.getElementById("minutes");
  const secondsEl = document.getElementById("seconds");

  if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

  if (diff <= 0) {
    daysEl.textContent = "00";
    hoursEl.textContent = "00";
    minutesEl.textContent = "00";
    secondsEl.textContent = "00";
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  daysEl.textContent = String(days).padStart(2, "0");
  hoursEl.textContent = String(hours).padStart(2, "0");
  minutesEl.textContent = String(minutes).padStart(2, "0");
  secondsEl.textContent = String(seconds).padStart(2, "0");
}

updateCountdown();
setInterval(updateCountdown, 1000);

// Starfield background via tsParticles

document.addEventListener("DOMContentLoaded", () => {
  // Force page to start at top on load/refresh
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
  window.scrollTo(0, 0);

  if (!window.tsParticles) return;

  tsParticles.load("particles-bg", {
    fpsLimit: 60,
    background: { color: "transparent" },
    particles: {
      number: { value: 140, density: { enable: true, area: 900 } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      size: { value: { min: 0.5, max: 2.2 }, random: true },
      opacity: {
        value: { min: 0.3, max: 1.8 },
        animation: { enable: true, speed: 0.25, minimumValue: 0.15 }
      },
      move: {
        enable: true,
        speed: 0.35,
        direction: "none",
        random: true,
        straight: false,
        outModes: { default: "out" }
      },
      twinkle: {
        particles: {
          enable: true,
          color: "#ffffff",
          frequency: 0.06,
          opacity: 1
        }
      },
      links: { enable: false }
    },
    detectRetina: true,
    interactivity: {
      detectsOn: "window",
      events: { onHover: { enable: false }, onClick: { enable: false }, resize: true }
    }
  });
});
