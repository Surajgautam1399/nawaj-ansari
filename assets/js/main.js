// Countdown to next show
// Set this date/time to your real show datetime


const targetDate = new Date("2025-08-06T19:00:00"); // local time

async function submitLead(payload) {
  const endpoint = typeof window.__LEAD_ENDPOINT__ === "string" ? window.__LEAD_ENDPOINT__ : null;

  if (endpoint) {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return;
  }

  return Promise.resolve();
}

function validateEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function initGModeHeroVideo() {
  const heroVideo = document.querySelector(".hero-video");

  if (!heroVideo) return;

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const isGMode = document.body.classList.contains("g-mode");

  if (prefersReducedMotion || !isGMode) {
    heroVideo.pause();
    heroVideo.classList.remove("is-ready");
    heroVideo.preload = "none";
    return;
  }

  heroVideo.preload = "auto";

  if (!heroVideo.dataset.listenersAttached) {
    heroVideo.addEventListener(
      "canplay",
      () => {
        heroVideo.classList.add("is-ready");
        console.log("Hero video ready", { src: heroVideo.currentSrc || heroVideo.src, readyState: heroVideo.readyState });
      },
      { once: true }
    );

    heroVideo.addEventListener("error", (e) => {
      console.warn("Hero video error", e?.message || e);
    });

    heroVideo.dataset.listenersAttached = "true";
  }

  heroVideo.load();
  heroVideo
    .play()
    .then(() => {
      console.log("Hero video playing", { src: heroVideo.currentSrc || heroVideo.src, readyState: heroVideo.readyState });
    })
    .catch((err) => {
      console.warn("Hero video autoplay blocked; keeping poster visible", err);
      heroVideo.classList.remove("is-ready");
    });
}

function initParticlesBackground() {
  if (!window.tsParticles) {
    return;
  }

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const baseConfig = {
    fullScreen: { enable: false },
    fpsLimit: 60,
    background: { color: "transparent" },
    particles: {
      number: { value: prefersReducedMotion ? 0 : 45, density: { enable: true, area: 900 } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      size: { value: { min: 0.8, max: 2.2 }, random: true },
      opacity: {
        value: { min: 0.1, max: 0.18 },
        animation: prefersReducedMotion
          ? { enable: false }
          : { enable: true, speed: 0.25, minimumValue: 0.1 }
      },
      move: {
        enable: !prefersReducedMotion,
        speed: 0.25,
        direction: "none",
        random: true,
        straight: false,
        outModes: { default: "out" }
      },
      links: {
        enable: true,
        distance: 140,
        opacity: 0.08,
        color: "#ffffff",
        width: 1
      }
    },
    detectRetina: true,
    interactivity: {
      detectsOn: "window",
      events: { onHover: { enable: false }, onClick: { enable: false }, resize: true }
    }
  };

  tsParticles.load("particles-bg", baseConfig);
}

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

  const nav = document.querySelector("header nav");
  const navToggle = document.querySelector(".nav-toggle");
  const navList = document.getElementById("primary-nav");
  const gModeToggle = document.getElementById("g-mode-toggle");
  const body = document.body;

  if (nav && navToggle && navList) {
    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    navList.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("nav-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  if (gModeToggle) {
    const saved = localStorage.getItem("gMode") === "on";
    if (saved) {
      body.classList.add("g-mode");
      gModeToggle.setAttribute("aria-pressed", "true");
    }
    gModeToggle.addEventListener("click", () => {
      const isOn = body.classList.toggle("g-mode");
      gModeToggle.setAttribute("aria-pressed", isOn ? "true" : "false");
      localStorage.setItem("gMode", isOn ? "on" : "off");
      initGModeHeroVideo();
      setTimeout(() => window.location.reload(), 550);
    });
    initGModeHeroVideo();
  }

  // Album section listen toggle
  const albumToggle = document.querySelector(".album-toggle");
  if (albumToggle) {
    const toggleButtons = albumToggle.querySelectorAll(".album-toggle-btn");
    const albumLinks = document.querySelectorAll(".album-link");

    const setActivePlatform = (platform) => {
      toggleButtons.forEach((button) => {
        const isActive = button.dataset.target === platform;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      albumLinks.forEach((link) => {
        const isActive = link.dataset.platform === platform;
        link.classList.toggle("is-active", isActive);
        link.hidden = !isActive;
      });
    };

    toggleButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.target;
        if (target) {
          setActivePlatform(target);
        }
      });
    });

    setActivePlatform("spotify");
  }

  const subscribeForm = document.getElementById("subscribe-form");
  const subscribeName = document.getElementById("subscribe-name");
  const subscribeEmail = document.getElementById("subscribe-email");
  const subscribeInterest = document.getElementById("subscribe-interest");
  const subscribeMessage = document.getElementById("subscribe-message");
  const subscribeError = document.getElementById("subscribe-error");
  const subscribeSuccess = document.getElementById("subscribe-success");
  const subscribeSubmit = document.getElementById("subscribe-submit");
  const leadIframe = document.getElementById("lead_iframe");
  const leadPage = document.getElementById("lead-page");
  const leadGMode = document.getElementById("lead-gmode");
  const leadTimestamp = document.getElementById("lead-timestamp");
  const honeypot = document.getElementById("company");

  if (subscribeForm && subscribeEmail && subscribeSubmit && subscribeError && subscribeSuccess && leadIframe && leadPage && leadGMode && leadTimestamp) {
    const setError = (msg) => {
      subscribeError.textContent = msg;
    };

    const clearFeedback = () => {
      setError("");
      subscribeSuccess.hidden = true;
    };

    subscribeEmail.addEventListener("input", clearFeedback);

    subscribeForm.addEventListener("submit", (event) => {
      clearFeedback();

      if (honeypot && honeypot.value.trim() !== "") {
        event.preventDefault();
        return;
      }

      const email = (subscribeEmail.value || "").trim();

      if (!validateEmail(email)) {
        event.preventDefault();
        setError("Please enter a valid email address.");
        subscribeEmail.focus();
        return;
      }

      if (leadPage) leadPage.value = window.location.pathname;
      if (leadGMode) leadGMode.value = document.body.classList.contains("g-mode") ? "1" : "0";
      if (leadTimestamp) leadTimestamp.value = new Date().toISOString();

      subscribeSubmit.disabled = true;
      const originalLabel = subscribeSubmit.textContent;
      subscribeSubmit.textContent = "Submitting...";

      const onIframeLoad = () => {
        subscribeSubmit.disabled = false;
        subscribeSubmit.textContent = originalLabel;
        subscribeSuccess.hidden = false;
        subscribeError.textContent = "";

        if (subscribeName) subscribeName.value = "";
        subscribeEmail.value = "";
        if (subscribeInterest) subscribeInterest.value = "";
        if (subscribeMessage) subscribeMessage.value = "";

        leadIframe.removeEventListener("load", onIframeLoad);
      };

      leadIframe.addEventListener("load", onIframeLoad, { once: true });

      // Submit the form explicitly to avoid any external preventDefault
      event.preventDefault();
      subscribeForm.submit();

      // Fallback safety in case iframe load never fires
      setTimeout(() => {
        if (subscribeSubmit.disabled) {
          subscribeSubmit.disabled = false;
          subscribeSubmit.textContent = originalLabel;
          setError("Please try again — connection might be slow.");
        }
      }, 7000);
    });
  }

  // If toggle not found or state changes elsewhere, ensure video matches current state.
  initGModeHeroVideo();

  initParticlesBackground();

  // Smoke test to verify canvas creation without breaking UI
  setTimeout(() => {
    const canvas = document.querySelector("#particles-bg canvas");
    const msg = canvas ? "Particles smoke test: PASS" : "Particles smoke test: FAIL";
    console.log(msg);
  }, 1500);

});
