console.log("main.js loaded");

// Google Calendar configuration
const GCAL_API_KEY = "AIzaSyBaX_yo46kszRGOvoEyh7F2VW9FJnkJbbM";
const GCAL_CALENDAR_ID = "cef97ead656710666a7b5f48e902e3b402c480472e6c48dc87098386e26bdeaf@group.calendar.google.com";



// Countdown to next show
// Set this date/time to your real show datetime


const TOUR_DATES_JSON_PATH = "./assets/data/tour-dates.json";
const TOUR_CACHE_KEY = "tourDatesCache";
const TOUR_CACHE_TTL_MS = 10 * 60 * 1000;
const GCAL_MAX_RESULTS = 50;
const GCAL_CACHE_KEY = "tourDatesGcalCache_v1";
let targetDate = new Date("2025-08-06T19:00:00"); // local time fallback

async function loadTourDatesWithCache() {
  try {
    const cachedRaw = sessionStorage.getItem(TOUR_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached && Array.isArray(cached.data) && typeof cached.ts === "number") {
        if (Date.now() - cached.ts < TOUR_CACHE_TTL_MS) {
          return cached.data;
        }
      }
    }
  } catch (err) {
    console.warn("Tour cache read failed; refetching.", err);
  }

  const response = await fetch(TOUR_DATES_JSON_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load tour dates: ${response.status}`);
  }
  const data = await response.json();
  const list = Array.isArray(data) ? data : [];

  try {
    sessionStorage.setItem(TOUR_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: list }));
  } catch (err) {
    console.warn("Tour cache write failed; continuing without cache.", err);
  }

  return list;
}

function getNextUpcomingEvent(dates) {
  const now = new Date();
  const upcoming = dates
    .map((event) => ({ ...event, startDate: new Date(event.start) }))
    .filter((event) => !Number.isNaN(event.startDate.getTime()) && event.startDate >= now)
    .sort((a, b) => a.startDate - b.startDate);

  return upcoming[0] || null;
}

function formatDateForMeta(dateObj) {
  return dateObj.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
}

function formatListDate(dateObj) {
  const monthDay = dateObj.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit"
  });
  return `${monthDay} • ${dateObj.getFullYear()}`;
}

function parseTicketsUrl(description) {
  if (!description) return "";
  const match = String(description).match(/https:\/\/[^\s)]+/i);
  return match ? match[0] : "";
}

async function fetchTourDatesFromGoogleCalendar() {
  if (
    !GCAL_API_KEY ||
    !GCAL_CALENDAR_ID ||
    GCAL_API_KEY === "PASTE_API_KEY_HERE" ||
    GCAL_CALENDAR_ID === "AIzaSyBaX_yo46kszRGOvoEyh7F2VW9FJnkJbbM"
  ) {
    return [];
  }

  try {
    const cachedRaw = sessionStorage.getItem(GCAL_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached && Array.isArray(cached.data) && typeof cached.ts === "number") {
        if (Date.now() - cached.ts < TOUR_CACHE_TTL_MS) {
          return cached.data;
        }
      }
    }
  } catch (err) {
    console.warn("GCAL cache read failed; refetching.", err);
  }

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: new Date().toISOString(),
    maxResults: String(GCAL_MAX_RESULTS),
    key: GCAL_API_KEY
  });

  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_CALENDAR_ID)}/events?${params.toString()}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Failed to load Google Calendar events: ${response.status}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const events = items
    .filter((item) => item?.start?.dateTime)
    .map((item) => ({
      title: item.summary || "TBA",
      city: item.location || "TBA",
      venue: item.summary || "TBA",
      start: item.start.dateTime,
      doorsText: "",
      ticketsUrl: parseTicketsUrl(item.description)
    }));

  try {
    sessionStorage.setItem(GCAL_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: events }));
  } catch (err) {
    console.warn("GCAL cache write failed; continuing without cache.", err);
  }

  return events;
}

function syncNextShowUI(nextEvent) {
  if (!nextEvent) return;

  const nextShowText = document.getElementById("next-show-text");
  const nextShowLink = document.getElementById("next-show-link");
  const countdownEvent = document.querySelector("#tour .countdown-event");
  const parsedDate = nextEvent.startDate instanceof Date ? nextEvent.startDate : new Date(nextEvent.start);

  if (nextShowText && !Number.isNaN(parsedDate.getTime())) {
    const formattedDate = formatDateForMeta(parsedDate);
    const venueText = nextEvent.venue || nextEvent.title || nextEvent.city || "";
    const metaParts = [venueText, formattedDate];
    if (nextEvent.doorsText) metaParts.push(nextEvent.doorsText);
    nextShowText.textContent = metaParts.filter(Boolean).join(" • ");
  }

  if (countdownEvent) {
    const labelParts = [nextEvent.city, nextEvent.title].filter(Boolean);
    if (labelParts.length) {
      countdownEvent.textContent = labelParts.join(" • ");
    }
  }

  if (nextShowLink) {
    if (nextShowLink.tagName === "A") {
      if (nextEvent.ticketsUrl) {
        nextShowLink.setAttribute("href", nextEvent.ticketsUrl);
      }
    } else {
      // Avoid attaching click handlers here; this function may re-run and would duplicate listeners.
      nextShowLink.dataset.url = nextEvent.ticketsUrl || "";
    }
  }
}

function renderTourList(events) {
  const listEl = document.getElementById("tour-list");
  if (!listEl) return;

  listEl.replaceChildren();

  const now = new Date();
  const normalized = events.map((event) => {
    const date = event.startDate instanceof Date ? event.startDate : new Date(event.start);
    const valid = !Number.isNaN(date.getTime());
    return { event, date, valid };
  });

  normalized.sort((a, b) => {
    if (a.valid && b.valid) return a.date - b.date;
    if (a.valid) return -1;
    if (b.valid) return 1;
    return 0;
  });

  normalized.forEach(({ event, date, valid }) => {
    const item = document.createElement("div");
    item.className = "tour-item";

    const isPast = valid && date < now;
    if (isPast) item.classList.add("is-past");

    const dateEl = document.createElement("div");
    dateEl.className = "tour-item-date";
    dateEl.textContent = valid ? formatListDate(date) : "TBA";

    const locationEl = document.createElement("div");
    locationEl.className = "tour-item-location";
    locationEl.textContent = event.city || "TBA";

    const venueEl = document.createElement("div");
    venueEl.className = "tour-item-venue";
    venueEl.textContent = event.venue || event.title || "TBA";

    const actionEl = document.createElement("div");
    actionEl.className = "tour-item-action";

    if (!isPast) {
      const link = document.createElement("a");
      const params = new URLSearchParams();
      if (event.city) params.set("city", event.city);
      if (valid) params.set("date", date.toISOString());
      if (event.venue) params.set("venue", event.venue);
      const query = params.toString();
      link.textContent = "Join waitlist";
      link.setAttribute("href", query ? `tour-hub.html?${query}` : "tour-hub.html");
      actionEl.appendChild(link);
    } else {
      const label = document.createElement("span");
      label.textContent = isPast ? "Ended" : "TBA";
      actionEl.appendChild(label);
    }

    item.append(dateEl, locationEl, venueEl, actionEl);
    listEl.appendChild(item);
  });
}

function initTourHub() {
  const hub = document.querySelector(".tour-hub");
  if (!hub) return;

  const params = new URLSearchParams(window.location.search);
  const city = params.get("city") || "TBA";
  const venue = params.get("venue") || "TBA";
  const dateParam = params.get("date");
  const dateObj = dateParam ? new Date(dateParam) : null;
  const hasValidDate = dateObj && !Number.isNaN(dateObj.getTime());

  const titleEl = document.getElementById("tour-hub-title");
  const regionEl = document.getElementById("tour-hub-region");
  const venueEl = document.getElementById("tour-hub-venue");
  const locationEl = document.getElementById("tour-hub-location");
  const dateEl = document.getElementById("tour-hub-date");
  const daysEl = document.getElementById("hub-days");
  const hoursEl = document.getElementById("hub-hours");
  const secondsEl = document.getElementById("hub-seconds");
  const countEl = document.getElementById("tour-hub-count");
  const statusEl = document.getElementById("tour-hub-status");
  const formEl = document.getElementById("tour-hub-form");

  const formattedDate = hasValidDate ? formatDateForMeta(dateObj) : "TBA";
  const cityLabel = city || "TBA";

  if (titleEl) titleEl.textContent = `${cityLabel} • ${formattedDate}`;
  if (regionEl) regionEl.textContent = cityLabel.toUpperCase();
  if (venueEl) venueEl.textContent = venue;
  if (locationEl) locationEl.textContent = venue;
  if (dateEl) dateEl.textContent = formattedDate;

  const countKey = cityLabel.toLowerCase().replace(/\s+/g, "-");
  const storageKey = "tourWaitlistCounts";

  const readCounts = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn("Failed to read waitlist counts.", err);
      return {};
    }
  };

  const writeCounts = (counts) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(counts));
    } catch (err) {
      console.warn("Failed to write waitlist counts.", err);
    }
  };

  const updateCount = () => {
    if (!countEl) return;
    const counts = readCounts();
    const count = counts[countKey] || 0;
    countEl.textContent = `${count} on the waitlist`;
  };

  updateCount();

  const updateCountdown = () => {
    if (!hasValidDate || !daysEl || !hoursEl || !secondsEl) return;
    const now = new Date();
    const diff = dateObj - now;
    if (diff <= 0) {
      daysEl.textContent = "00";
      hoursEl.textContent = "00";
      secondsEl.textContent = "00";
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const seconds = Math.floor((diff / 1000) % 60);
    daysEl.textContent = String(days).padStart(2, "0");
    hoursEl.textContent = String(hours).padStart(2, "0");
    secondsEl.textContent = String(seconds).padStart(2, "0");
  };

  updateCountdown();
  if (hasValidDate) setInterval(updateCountdown, 1000);

  if (formEl) {
    formEl.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!formEl.checkValidity()) {
        formEl.reportValidity();
        return;
      }

      const counts = readCounts();
      counts[countKey] = (counts[countKey] || 0) + 1;
      writeCounts(counts);
      updateCount();

      if (statusEl) {
        statusEl.textContent = "You are on the list. Watch your inbox for updates.";
      }

      formEl.reset();
    });
  }
}

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

// Starfield background via tsParticles

document.addEventListener("DOMContentLoaded", async () => {
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

  const heroDroplets = document.querySelector(".hero-droplets");
  const buildHeroDroplets = () => {
    if (!heroDroplets) return;
    heroDroplets.innerHTML = "";
    const isGMode = document.body.classList.contains("g-mode");
    const baseCount = Math.max(40, Math.floor(window.innerWidth / 22));
    const dropletCount = Math.min(110, Math.round(baseCount * (isGMode ? 1.3 : 1)));

    for (let i = 0; i < dropletCount; i += 1) {
      const droplet = document.createElement("span");
      droplet.className = "hero-droplet";

      const size = Math.random() * 6 + 3;
      droplet.style.width = `${size}px`;
      droplet.style.height = `${size * 1.6}px`;
      droplet.style.left = `${Math.random() * 100}%`;
      droplet.style.top = `${-Math.random() * 140}px`;
      droplet.style.animationDuration = `${Math.random() * 6 + 4}s`;
      droplet.style.animationDelay = `${Math.random() * 4}s`;
      droplet.style.opacity = `${Math.random() * 0.6 + 0.3}`;

      heroDroplets.appendChild(droplet);
    }
  };

  buildHeroDroplets();
  if (heroDroplets) {
    let resizeTimer;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(buildHeroDroplets, 180);
    });
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

  initTourHub();

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

  const nextShowLink = document.getElementById("next-show-link");
  if (nextShowLink && nextShowLink.tagName !== "A" && !nextShowLink.dataset.listenerAttached) {
    // Bind once at startup to prevent duplicate handlers if UI sync runs multiple times.
    nextShowLink.addEventListener("click", () => {
      const url = nextShowLink.dataset.url;
      if (url) {
        window.open(url, "_blank", "noopener");
      }
    });
    nextShowLink.dataset.listenerAttached = "true";
  }

  try {
    const gcalEvents = await fetchTourDatesFromGoogleCalendar();
    if (gcalEvents.length) {
      const nextEvent = getNextUpcomingEvent(gcalEvents);
      if (nextEvent && nextEvent.startDate) {
        targetDate = nextEvent.startDate;
        syncNextShowUI(nextEvent);
      }
      renderTourList(gcalEvents);
      updateCountdown();
      setInterval(updateCountdown, 1000);
      return;
    }
  } catch (err) {
    console.warn("Google Calendar load failed; falling back to JSON.", err);
  }

  try {
    const tourDates = await loadTourDatesWithCache();
    renderTourList(tourDates);
    const nextEvent = getNextUpcomingEvent(tourDates);

    if (nextEvent && nextEvent.startDate) {
      targetDate = nextEvent.startDate;
      syncNextShowUI(nextEvent);
    }
  } catch (err) {
    console.warn("Tour dates load failed; using fallback date.", err);
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

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
