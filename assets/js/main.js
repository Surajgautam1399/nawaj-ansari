console.log("main.js loaded");

const TOUR_DATES_JSON_PATH = "./assets/data/tour-dates.json";
const TOUR_CACHE_KEY = "tourDatesCache_v4";
const TOUR_CACHE_TTL_MS = 10 * 60 * 1000;
let countdownTarget = null;
let tourDataCache = null;
const defaultAura = { a: "rgba(76, 130, 255, 0.2)", b: "rgba(84, 240, 210, 0.16)" };

function normalizeCityId(value) {
  return String(value || "tba")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeTourData(raw) {
  if (Array.isArray(raw)) {
    return { events: raw, cities: {} };
  }
  const events = Array.isArray(raw?.events) ? raw.events : [];
  const cities = raw?.cities && typeof raw.cities === "object" ? raw.cities : {};
  return { events, cities };
}

function buildCityMap(cities) {
  const map = new Map();
  if (Array.isArray(cities)) {
    cities.forEach((city) => {
      if (city?.id) map.set(city.id, city);
    });
    return map;
  }
  if (cities && typeof cities === "object") {
    Object.entries(cities).forEach(([id, value]) => {
      if (!id) return;
      map.set(id, { id, ...(value || {}) });
    });
  }
  return map;
}

function normalizeEvents(events, cityMap) {
  return events.map((event) => {
    const cityId = event.cityId || normalizeCityId(event.city || event.region || event.venue || "tba");
    const cityMeta = cityMap.get(cityId) || {};
    const cityName = cityMeta.name || event.city || "TBA";
    const region = cityMeta.region || event.region || "";
    const fallbackId = event.start ? `${cityId}-${event.start}` : `${cityId}-tba`;
    const startDate = event.start ? new Date(event.start) : null;
    const hasValidDate = !!startDate && !Number.isNaN(startDate.getTime());
    return {
      ...event,
      id: event.id || fallbackId,
      cityId,
      cityName,
      region,
      startDate: hasValidDate ? startDate : null,
      hasValidDate
    };
  });
}

function groupEventsByCity(events) {
  const grouped = new Map();
  events.forEach((event) => {
    const cityId = event.cityId || normalizeCityId(event.cityName || event.city || "tba");
    if (!grouped.has(cityId)) grouped.set(cityId, []);
    grouped.get(cityId).push(event);
  });
  return grouped;
}

function buildCitiesArchiveData(cityMap, events = []) {
  const now = new Date();
  const grouped = groupEventsByCity(events);

  const cities = [];
  const hasCityMap = cityMap && typeof cityMap.size === "number" && cityMap.size > 0;

  const addCity = (cityId, meta = {}, cityEvents = []) => {
    const validEvents = cityEvents.filter((event) => event.hasValidDate);
    const upcoming = validEvents
      .filter((event) => event.startDate >= now)
      .sort((a, b) => a.startDate - b.startDate);
    const past = validEvents
      .filter((event) => event.startDate < now)
      .sort((a, b) => b.startDate - a.startDate);

    const status = upcoming.length ? "Upcoming" : cityEvents.length ? "Played" : "Archive";
    const anchorEvent = upcoming[0] || past[0] || cityEvents[0];
    const fallbackName = cityEvents[0]?.cityName || cityEvents[0]?.city || "TBA";
    const fallbackRegion = cityEvents[0]?.region || "";
    const yearLabel = meta.yearLabel || (anchorEvent?.startDate ? `${anchorEvent.startDate.getFullYear()} • Tour` : "Tour");
    const sortDate = upcoming[0]?.startDate || past[0]?.startDate || new Date(0);

    cities.push({
      id: cityId,
      name: meta.name || fallbackName,
      region: meta.region || fallbackRegion,
      yearLabel,
      status,
      attendance: meta.attendance ?? null,
      shows: cityEvents.length,
      merchSold: meta.merchSold ?? null,
      highlights: Array.isArray(meta.highlights) ? meta.highlights : [],
      imageBase: meta.imageBase || "",
      aura: meta.aura || defaultAura,
      galleryCount: Number(meta.galleryCount) || 0,
      sortDate
    });
  };

  if (hasCityMap) {
    cityMap.forEach((meta, cityId) => {
      const cityEvents = grouped.get(cityId) || [];
      addCity(cityId, meta, cityEvents);
    });
  } else {
    grouped.forEach((cityEvents, cityId) => {
      addCity(cityId, {}, cityEvents);
    });
  }

  return cities
    .sort((a, b) => {
      if (a.status === b.status) {
        if (a.status === "Upcoming") return a.sortDate - b.sortDate;
        return b.sortDate - a.sortDate;
      }
      if (a.status === "Upcoming") return -1;
      if (b.status === "Upcoming") return 1;
      if (a.status === "Played" && b.status === "Archive") return -1;
      if (a.status === "Archive" && b.status === "Played") return 1;
      return 0;
    })
    .map(({ sortDate, ...rest }) => rest);
}

function formatCityNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return value.toLocaleString("en-US");
  }
  return String(value);
}

const cityImageSizes = [480, 800, 1200];
const cityImageSizesAttr = "(max-width: 820px) 80vw, 420px";

function buildCitySrcSet(imageBase) {
  return cityImageSizes.map((size) => `${imageBase}-${size}.jpg ${size}w`).join(", ");
}

function initCitiesArchive(citiesArchiveData = []) {
  const archive = document.querySelector(".cities-archive");
  const deck = document.getElementById("cities-deck");
  const panel = document.getElementById("city-panel");
  const panelOverlay = document.getElementById("city-panel-overlay");
  const template = document.getElementById("city-card-template");
  const modal = document.getElementById("city-modal");
  if (!archive || !deck || !panel || !template || !modal) return;
  if (!Array.isArray(citiesArchiveData) || citiesArchiveData.length === 0) {
    archive.hidden = true;
    return;
  }

  const panelTitle = document.getElementById("city-panel-title");
  const panelMeta = document.getElementById("city-panel-meta");
  const panelAttendance = document.getElementById("city-panel-attendance");
  const panelShows = document.getElementById("city-panel-shows");
  const panelMerch = document.getElementById("city-panel-merch");
  const panelMerchRow = document.getElementById("city-panel-merch-row");
  const panelHighlights = document.getElementById("city-panel-highlights");
  const panelStacks = document.getElementById("city-panel-stacks");
  const panelGalleryWrap = document.getElementById("city-panel-gallery-wrap");
  const panelGalleryEmpty = document.getElementById("city-panel-gallery-empty");
  const panelGalleryToggle = document.getElementById("city-panel-gallery-toggle");
  const panelGrid = document.getElementById("city-panel-grid");
  const panelClose = document.getElementById("city-panel-close");
  const galleryButton = document.getElementById("city-panel-gallery");
  const deckCounter = document.getElementById("cities-deck-counter");
  const miniPanel = document.getElementById("city-mini-panel");
  const miniPanelTitle = document.getElementById("city-mini-panel-title");
  const miniPanelMeta = document.getElementById("city-mini-panel-meta");
  const miniPanelBtn = document.getElementById("city-mini-panel-btn");
  const scrubber = document.getElementById("cities-scrubber");
  const scrubUp = document.getElementById("cities-scrub-up");
  const scrubDown = document.getElementById("cities-scrub-down");
  const bgCurrent = document.getElementById("cities-bg-current");
  const bgNext = document.getElementById("cities-bg-next");

  const modalTitle = document.getElementById("city-modal-title");
  const modalMeta = document.getElementById("city-modal-meta");
  const modalStats = document.getElementById("city-modal-stats");
  const modalGrid = document.getElementById("city-modal-grid");

  const clampIndex = (value) => Math.min(Math.max(value, 0), citiesArchiveData.length - 1);
  const visibleRange = 5;
  let activeIndex = 0;
  let previewIndex = null;
  let focusMode = false;
  let isDeckHover = false;
  let wheelDelta = 0;
  let wheelFrame = null;

  const updateDeckCounter = () => {
    if (!deckCounter) return;
    deckCounter.textContent = `${activeIndex + 1} / ${citiesArchiveData.length}`;
    deckCounter.classList.add("is-visible");
  };

  const buildGradient = (city) => {
    const auraA = city?.aura?.a || defaultAura.a;
    const auraB = city?.aura?.b || defaultAura.b;
    return `radial-gradient(circle at 20% 20%, ${auraA}, transparent 60%), radial-gradient(circle at 80% 30%, ${auraB}, transparent 62%), linear-gradient(180deg, rgba(6, 6, 8, 0.92), rgba(2, 2, 3, 0.98))`;
  };

  const resolveCityImage = (city) => {
    const rawImageBase = city?.imageBase || "";
    if (!rawImageBase) return "";
    return !rawImageBase.startsWith(".") && !rawImageBase.startsWith("/")
      ? `./${rawImageBase}`
      : rawImageBase;
  };

  const applyArchiveBackground = (city, imageUrl = "") => {
    if (!bgCurrent || !bgNext || !city) return;
    const gradient = buildGradient(city);
    const bgKey = `${gradient}|${imageUrl}`;
    if (bgCurrent.dataset.bg === bgKey) return;
    if (archive) archive.style.setProperty("--cities-aura", gradient);
    if (imageUrl) {
      bgNext.style.backgroundImage = `url("${imageUrl}")`;
    } else {
      bgNext.style.backgroundImage = "none";
    }
    bgNext.classList.add("is-visible");
    window.setTimeout(() => {
      if (archive) archive.style.setProperty("--cities-aura", gradient);
      if (imageUrl) {
        bgCurrent.style.backgroundImage = `url("${imageUrl}")`;
      } else {
        bgCurrent.style.backgroundImage = "none";
      }
      bgCurrent.dataset.bg = bgKey;
      bgNext.classList.remove("is-visible");
    }, 420);
  };

  const setBackgroundForCity = (city) => {
    const resolvedImageBase = resolveCityImage(city);
    applyArchiveBackground(city, resolvedImageBase);
  };

  const renderPanelStacks = () => {
    if (!panelStacks) return;
    panelStacks.replaceChildren();
    for (let i = 0; i < 3; i += 1) {
      const stack = document.createElement("div");
      stack.className = "city-panel-stack";
      for (let j = 0; j < 3; j += 1) {
        const card = document.createElement("div");
        card.className = "city-panel-stack-card";
        stack.appendChild(card);
      }
      panelStacks.appendChild(stack);
    }
  };

  const getGalleryCount = (city) => Math.max(12, Number(city?.galleryCount) || 0);

  const renderPanelGrid = (city) => {
    if (!panelGrid) return;
    panelGrid.replaceChildren();
    const count = getGalleryCount(city);
    for (let i = 0; i < count; i += 1) {
      const tile = document.createElement("div");
      tile.className = "city-panel-tile";
      tile.textContent = "Add image";
      panelGrid.appendChild(tile);
    }
  };

  const updateMiniPanel = (city) => {
    if (!miniPanel || !city) return;
    if (miniPanelTitle) miniPanelTitle.textContent = city.name;
    if (miniPanelMeta) miniPanelMeta.textContent = `${city.region} • ${city.yearLabel}`;
  };

  const updatePanel = (city) => {
    if (!city) return;
    if (panelTitle) panelTitle.textContent = city.name;
    if (panelMeta) panelMeta.textContent = `${city.region} • ${city.yearLabel}`;
    if (panelAttendance) panelAttendance.textContent = formatCityNumber(city.attendance);
    if (panelShows) panelShows.textContent = formatCityNumber(city.shows);

    const hasMerch = city.merchSold !== null && city.merchSold !== undefined;
    if (panelMerchRow) panelMerchRow.hidden = !hasMerch;
    if (panelMerch) panelMerch.textContent = hasMerch ? formatCityNumber(city.merchSold) : "—";

    if (panelHighlights) {
      panelHighlights.replaceChildren();
      const highlights = Array.isArray(city.highlights) ? city.highlights : [];
      if (highlights.length) {
        highlights.forEach((item) => {
          const li = document.createElement("li");
          li.textContent = item;
          panelHighlights.appendChild(li);
        });
      } else {
        const li = document.createElement("li");
        li.textContent = "Highlights coming soon.";
        panelHighlights.appendChild(li);
      }
    }

    const galleryCount = getGalleryCount(city);
    if (panelGalleryWrap) panelGalleryWrap.hidden = false;
    if (panelGalleryEmpty) panelGalleryEmpty.hidden = galleryCount > 0;
    if (panelGalleryToggle) panelGalleryToggle.hidden = false;
    renderPanelStacks();
    renderPanelGrid(city);
    if (galleryButton) galleryButton.disabled = false;
    if (panelGalleryWrap) panelGalleryWrap.classList.remove("is-expanded");
    if (panelGalleryToggle) panelGalleryToggle.setAttribute("aria-expanded", "false");
  };

  const getActiveCity = () => citiesArchiveData[activeIndex];
  const getPreviewCity = () => (previewIndex === null ? getActiveCity() : citiesArchiveData[previewIndex]);

  const renderDeck = () => {
    deck.replaceChildren();
    const fragment = document.createDocumentFragment();
    const start = clampIndex(activeIndex - visibleRange);
    const end = clampIndex(activeIndex + visibleRange);

    for (let i = start; i <= end; i += 1) {
      const city = citiesArchiveData[i];
      const card = template.content.firstElementChild.cloneNode(true);
      card.dataset.index = String(i);
      card.dataset.cityId = city.id;
      card.classList.toggle("is-active", i === activeIndex);
      card.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
      const delta = i - activeIndex;
      card.style.setProperty("--delta", String(delta));
      card.style.setProperty("--abs-delta", String(Math.abs(delta)));
      card.style.zIndex = String(100 - Math.abs(delta));

      const nameEl = card.querySelector(".city-card-name");
      const statusEl = card.querySelector(".city-card-status");
      const regionEl = card.querySelector(".city-card-region");
      const yearEl = card.querySelector(".city-card-year");
      const attendanceEl = card.querySelector(".city-card-attendance");
      const mediaEl = card.querySelector(".city-card-media");
      const imageEl = card.querySelector(".city-card-image");
      const placeholderEl = card.querySelector(".city-card-placeholder");

      if (nameEl) nameEl.textContent = city.name;
      if (statusEl) {
        statusEl.textContent = city.status;
        statusEl.className = "city-card-status";
        const statusClass = city.status.toLowerCase() === "upcoming" ? "is-upcoming" : "is-played";
        statusEl.classList.add(statusClass);
      }
      if (regionEl) regionEl.textContent = city.region;
      if (yearEl) yearEl.textContent = city.yearLabel;
      if (attendanceEl) attendanceEl.textContent = `Attendance ${formatCityNumber(city.attendance)}`;

      if (imageEl) {
        imageEl.removeAttribute("src");
        imageEl.style.display = "none";
      }

      const resolvedImageBase = resolveCityImage(city);
      card.dataset.bg = resolvedImageBase;

      if (mediaEl && resolvedImageBase) {
        mediaEl.style.backgroundImage = `url("${resolvedImageBase}")`;
        card.classList.add("has-image");
      } else if (mediaEl) {
        mediaEl.style.backgroundImage = buildGradient(city);
        card.classList.remove("has-image");
      }

      if (placeholderEl) {
        placeholderEl.style.display = resolvedImageBase ? "none" : "flex";
      }

      fragment.appendChild(card);
    }

    deck.appendChild(fragment);
    deck.classList.toggle("is-focus", focusMode);
  };

  const syncUI = () => {
    const city = getPreviewCity();
    updatePanel(city);
    updateMiniPanel(city);
    updateDeckCounter();
    setBackgroundForCity(city);
  };

  const setActiveIndex = (nextIndex) => {
    const clamped = clampIndex(nextIndex);
    if (clamped === activeIndex) return;
    activeIndex = clamped;
    previewIndex = null;
    renderDeck();
    syncUI();
  };

  const setPreviewIndex = (nextIndex) => {
    previewIndex = nextIndex === null ? null : clampIndex(nextIndex);
    syncUI();
  };

  const setFocusMode = (value) => {
    focusMode = value;
    deck.classList.toggle("is-focus", focusMode);
    panel.classList.toggle("is-locked", focusMode);
    if (!focusMode && panelGalleryWrap) {
      panelGalleryWrap.classList.remove("is-expanded");
      if (panelGalleryToggle) panelGalleryToggle.setAttribute("aria-expanded", "false");
    }
  };

  const openModal = (city) => {
    if (!city) return;
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    if (modalTitle) modalTitle.textContent = `${city.name} Gallery`;
    if (modalMeta) modalMeta.textContent = `${city.region} • ${city.yearLabel}`;
    if (modalStats) {
      const attendance = formatCityNumber(city.attendance);
      const shows = formatCityNumber(city.shows);
      modalStats.textContent = `Attendance ${attendance} • Shows ${shows}`;
    }

    if (modalGrid) {
      modalGrid.replaceChildren();
      const count = getGalleryCount(city);
      for (let i = 0; i < count; i += 1) {
        const tile = document.createElement("div");
        tile.className = "city-modal-tile";
        modalGrid.appendChild(tile);
      }
    }
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    modal.hidden = true;
  };

  renderDeck();
  syncUI();
  setFocusMode(false);

  deck.addEventListener("mouseenter", () => {
    isDeckHover = true;
  });

  deck.addEventListener("mouseleave", () => {
    isDeckHover = false;
    setPreviewIndex(null);
  });

  deck.addEventListener("mousemove", (event) => {
    if (focusMode) return;
    const card = event.target.closest(".city-card");
    if (!card) return;
    const index = Number(card.dataset.index);
    if (!Number.isNaN(index)) {
      setPreviewIndex(index);
    }
  });

  deck.addEventListener(
    "wheel",
    (event) => {
      if (!isDeckHover) return;
      event.preventDefault();
      wheelDelta += event.deltaY;
      if (wheelFrame) return;
      wheelFrame = window.requestAnimationFrame(() => {
        wheelFrame = null;
        if (Math.abs(wheelDelta) < 24) return;
        const direction = wheelDelta > 0 ? 1 : -1;
        wheelDelta = 0;
        setActiveIndex(activeIndex + direction);
      });
    },
    { passive: false }
  );

  deck.addEventListener("click", (event) => {
    const card = event.target.closest(".city-card");
    if (!card) return;
    const index = Number(card.dataset.index);
    if (Number.isNaN(index)) return;
    setActiveIndex(index);
    setFocusMode(true);
  });

  document.addEventListener("click", (event) => {
    if (!focusMode) return;
    const target = event.target;
    if (deck.contains(target) || panel.contains(target) || (scrubber && scrubber.contains(target))) return;
    setFocusMode(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setFocusMode(false);
      closeModal();
    }
  });

  if (scrubUp) {
    scrubUp.addEventListener("click", () => setActiveIndex(activeIndex - 1));
  }
  if (scrubDown) {
    scrubDown.addEventListener("click", () => setActiveIndex(activeIndex + 1));
  }
  if (scrubber) {
    scrubber.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(activeIndex - 1);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex(activeIndex + 1);
      }
    });
  }

  if (panelGalleryToggle) {
    panelGalleryToggle.addEventListener("click", () => {
      if (!panelGalleryWrap) return;
      const isExpanded = panelGalleryWrap.classList.toggle("is-expanded");
      panelGalleryToggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    });
  }

  if (galleryButton) {
    galleryButton.addEventListener("click", () => {
      openModal(getActiveCity());
    });
  }

  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "textarea",
    "input",
    "select",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  let lastFocusedElement = null;

  const trapFocus = (event) => {
    if (event.key === "Escape") {
      closeModal();
      if (lastFocusedElement) lastFocusedElement.focus();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = Array.from(modal.querySelectorAll(focusableSelector));
    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  };

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.dataset.action === "close-modal") {
      closeModal();
      if (lastFocusedElement) lastFocusedElement.focus();
    }
  });

  modal.addEventListener("keydown", trapFocus);
}

function initCitiesArchiveV2(citiesArchiveData = []) {
  const archive = document.querySelector(".cities-archive");
  const deck = document.getElementById("cities-deck");
  const panel = document.getElementById("city-panel");
  const template = document.getElementById("city-card-template");
  if (!archive || !deck || !panel || !template) return;
  if (!Array.isArray(citiesArchiveData) || citiesArchiveData.length === 0) {
    archive.hidden = true;
    return;
  }

  const panelTitle = document.getElementById("city-panel-title");
  const panelMeta = document.getElementById("city-panel-meta");
  const panelAttendance = document.getElementById("city-panel-attendance");
  const panelShows = document.getElementById("city-panel-shows");
  const panelMerch = document.getElementById("city-panel-merch");
  const panelMerchRow = document.getElementById("city-panel-merch-row");
  const panelHighlights = document.getElementById("city-panel-highlights");
  const panelGalleryButton = document.getElementById("city-panel-gallery");
  const deckCounter = document.getElementById("cities-deck-counter");
  const scrubber = document.getElementById("cities-scrubber");
  const scrubUp = document.getElementById("cities-scrub-up");
  const scrubDown = document.getElementById("cities-scrub-down");
  const bgCurrent = document.getElementById("cities-bg-current");
  const bgNext = document.getElementById("cities-bg-next");
  const drawer = document.getElementById("city-gallery-drawer");

  const clampIndex = (value) => Math.min(Math.max(value, 0), citiesArchiveData.length - 1);
  const STACK_VISIBLE_COUNT = 5;
  let activeIndex = 0;
  let previewIndex = null;
  let focusMode = false;
  let galleryOpen = false;
  let isDeckHover = false;
  let wheelDelta = 0;
  let wheelFrame = null;
  let panelUpdateTimer = null;

  const buildGradient = (city) => {
    const auraA = city?.aura?.a || defaultAura.a;
    const auraB = city?.aura?.b || defaultAura.b;
    return `radial-gradient(circle at 20% 20%, ${auraA}, transparent 60%), radial-gradient(circle at 80% 30%, ${auraB}, transparent 62%), linear-gradient(180deg, rgba(6, 6, 8, 0.92), rgba(2, 2, 3, 0.98))`;
  };

  const resolveCityImage = (city) => {
    const rawImageBase = city?.imageBase || "";
    if (!rawImageBase) return "";
    return !rawImageBase.startsWith(".") && !rawImageBase.startsWith("/")
      ? `./${rawImageBase}`
      : rawImageBase;
  };

  const applyArchiveBackground = (city, imageUrl = "") => {
    if (!bgCurrent || !bgNext || !city) return;
    const gradient = buildGradient(city);
    const bgKey = `${gradient}|${imageUrl}`;
    if (bgCurrent.dataset.bg === bgKey) return;
    if (archive) archive.style.setProperty("--cities-aura", gradient);
    if (imageUrl) {
      bgNext.style.backgroundImage = `url("${imageUrl}")`;
    } else {
      bgNext.style.backgroundImage = "none";
    }
    bgNext.classList.add("is-visible");
    window.setTimeout(() => {
      if (archive) archive.style.setProperty("--cities-aura", gradient);
      if (imageUrl) {
        bgCurrent.style.backgroundImage = `url("${imageUrl}")`;
      } else {
        bgCurrent.style.backgroundImage = "none";
      }
      bgCurrent.dataset.bg = bgKey;
      bgNext.classList.remove("is-visible");
    }, 420);
  };

  const updateBackground = (city, imageUrl = "") => {
    const resolvedImageBase = imageUrl || resolveCityImage(city);
    applyArchiveBackground(city, resolvedImageBase);
  };

  const updateDeckCounter = () => {
    if (!deckCounter) return;
    deckCounter.textContent = `${activeIndex + 1} / ${citiesArchiveData.length}`;
    deckCounter.classList.add("is-visible");
    if (scrubUp) scrubUp.disabled = activeIndex <= 0;
    if (scrubDown) scrubDown.disabled = activeIndex >= citiesArchiveData.length - 1;
  };

  const formatStat = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "N/A";
    return formatCityNumber(value);
  };

  const animatePanelSwap = () => {
    if (!panel) return;
    panel.classList.add("is-updating");
    if (panelUpdateTimer) window.clearTimeout(panelUpdateTimer);
    panelUpdateTimer = window.setTimeout(() => {
      panel.classList.remove("is-updating");
      panelUpdateTimer = null;
    }, 170);
  };

  const updatePanel = (city) => {
    if (!city) return;
    if (panelTitle) panelTitle.textContent = city.name;
    if (panelMeta) panelMeta.textContent = `${city.region} • ${city.yearLabel}`;
    if (panelAttendance) panelAttendance.textContent = formatStat(city.attendance);
    if (panelShows) panelShows.textContent = formatStat(city.shows);

    const hasMerch = city.merchSold !== null && city.merchSold !== undefined;
    if (panelMerchRow) panelMerchRow.hidden = !hasMerch;
    if (panelMerch) panelMerch.textContent = hasMerch ? formatCityNumber(city.merchSold) : "N/A";

    if (panelHighlights) {
      panelHighlights.replaceChildren();
      const highlights = Array.isArray(city.highlights) ? city.highlights : [];
      if (highlights.length) {
        highlights.forEach((item) => {
          const li = document.createElement("li");
          li.textContent = item;
          panelHighlights.appendChild(li);
        });
      } else {
        const li = document.createElement("li");
        li.textContent = "Highlights coming soon.";
        panelHighlights.appendChild(li);
      }
    }
  };

  const getActiveCity = () => citiesArchiveData[activeIndex];
  const getPreviewCity = () => (previewIndex === null ? getActiveCity() : citiesArchiveData[previewIndex]);

  const renderDeckWindow = () => {
    deck.replaceChildren();
    const fragment = document.createDocumentFragment();
    const half = Math.floor(STACK_VISIBLE_COUNT / 2);
    let start = Math.max(0, activeIndex - half);
    let end = Math.min(citiesArchiveData.length - 1, start + STACK_VISIBLE_COUNT - 1);
    if (end - start + 1 < STACK_VISIBLE_COUNT) {
      start = Math.max(0, end - STACK_VISIBLE_COUNT + 1);
    }

    for (let i = start; i <= end; i += 1) {
      const city = citiesArchiveData[i];
      const card = template.content.firstElementChild.cloneNode(true);
      card.dataset.index = String(i);
      card.dataset.cityId = city.id;
      card.classList.toggle("is-active", i === activeIndex);
      card.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
      const delta = i - activeIndex;
      card.style.setProperty("--delta", String(delta));
      card.style.setProperty("--abs-delta", String(Math.abs(delta)));
      card.style.setProperty("--city-depth", String(Math.abs(delta)));
      card.style.zIndex = String(100 - Math.abs(delta));
      card.classList.toggle("is-muted", Math.abs(delta) > 0);

      const nameEl = card.querySelector(".city-card-name");
      const statusEl = card.querySelector(".city-card-status");
      const regionEl = card.querySelector(".city-card-region");
      const yearEl = card.querySelector(".city-card-year");
      const attendanceEl = card.querySelector(".city-card-attendance");
      const mediaEl = card.querySelector(".city-card-media");
      const emblemEl = card.querySelector(".city-card-emblem");
      const cornerEls = card.querySelectorAll(".city-card-corner");
      const imageEl = card.querySelector(".city-card-image");
      const placeholderEl = card.querySelector(".city-card-placeholder");

      if (nameEl) nameEl.textContent = city.name;
      if (statusEl) {
        statusEl.textContent = city.status;
        statusEl.className = "city-card-status";
        const statusClass = city.status.toLowerCase() === "upcoming" ? "is-upcoming" : "is-played";
        statusEl.classList.add(statusClass);
      }
      if (regionEl) regionEl.textContent = city.region;
      if (yearEl) yearEl.textContent = city.yearLabel;
      if (attendanceEl) attendanceEl.textContent = `Attendance ${formatStat(city.attendance)}`;

      const initial = (city.name || "C").trim().charAt(0).toUpperCase();
      if (emblemEl) emblemEl.textContent = initial;
      if (cornerEls?.length) {
        cornerEls.forEach((corner) => {
          corner.textContent = initial;
        });
      }

      const resolvedImageBase = resolveCityImage(city);
      card.dataset.bg = resolvedImageBase;

      if (resolvedImageBase) {
        if (mediaEl) mediaEl.style.backgroundImage = `url("${resolvedImageBase}")`;
        if (imageEl) {
          imageEl.src = resolvedImageBase;
          imageEl.alt = `${city.name} tour city`;
          imageEl.style.display = "block";
        }
        card.classList.add("has-image");
        if (placeholderEl) placeholderEl.style.display = "none";
      } else {
        if (mediaEl) mediaEl.style.backgroundImage = buildGradient(city);
        if (imageEl) {
          imageEl.removeAttribute("src");
          imageEl.style.display = "none";
        }
        card.classList.remove("has-image");
        if (placeholderEl) placeholderEl.style.display = "flex";
      }

      fragment.appendChild(card);
    }

    deck.appendChild(fragment);
    deck.classList.toggle("is-focus", focusMode);
  };

  const setActiveIndex = (nextIndex) => {
    const clamped = clampIndex(nextIndex);
    if (clamped === activeIndex) return;
    activeIndex = clamped;
    previewIndex = null;
    animatePanelSwap();
    renderDeckWindow();
    updatePanel(getActiveCity());
    updateBackground(getActiveCity());
    updateDeckCounter();
  };

  const setPreviewIndex = (nextIndex) => {
    const resolvedIndex = nextIndex === null ? null : clampIndex(nextIndex);
    if (resolvedIndex === previewIndex) return;
    previewIndex = resolvedIndex;
    const city = getPreviewCity();
    animatePanelSwap();
    updatePanel(city);
    updateBackground(city);
  };

  const setFocusMode = (value) => {
    focusMode = value;
    deck.classList.toggle("is-focus", focusMode);
  };

  const toggleGalleryDrawer = () => {
    if (!drawer) return;
    galleryOpen = !galleryOpen;
    drawer.classList.toggle("is-open", galleryOpen);
    drawer.setAttribute("aria-hidden", galleryOpen ? "false" : "true");
    if (galleryOpen) {
      window.setTimeout(() => {
        drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }
  };

  renderDeckWindow();
  updatePanel(getActiveCity());
  updateBackground(getActiveCity());
  updateDeckCounter();
  setFocusMode(false);

  const observerThresholds = [0.5, 0.6, 0.7];
  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          if (focusMode || isDeckHover) return;
          const visible = entries.filter((entry) => entry.isIntersecting);
          if (!visible.length) return;
          const deckRect = deck.getBoundingClientRect();
          const deckCenter = deckRect.top + deckRect.height / 2;
          let best = null;
          let bestDistance = Number.POSITIVE_INFINITY;
          visible.forEach((entry) => {
            const rect = entry.target.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            const distance = Math.abs(center - deckCenter);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = entry;
            }
          });
          if (!best) return;
          const idx = Number(best.target.dataset.index);
          if (!Number.isNaN(idx)) {
            setActiveIndex(idx);
            updateBackground(getActiveCity(), best.target.dataset.bg || "");
          }
        },
        { root: null, threshold: observerThresholds }
      )
    : null;

  deck.addEventListener("mouseenter", () => {
    isDeckHover = true;
  });

  deck.addEventListener("mouseleave", () => {
    isDeckHover = false;
    setPreviewIndex(null);
  });

  deck.addEventListener("mousemove", (event) => {
    const card = event.target.closest(".city-card");
    if (!card) return;
    const index = Number(card.dataset.index);
    if (!Number.isNaN(index)) {
      setPreviewIndex(index);
    }
  });

  deck.addEventListener(
    "wheel",
    (event) => {
      if (!isDeckHover) return;
      event.preventDefault();
      wheelDelta += event.deltaY;
      if (wheelFrame) return;
      wheelFrame = window.requestAnimationFrame(() => {
        wheelFrame = null;
        if (Math.abs(wheelDelta) < 24) return;
        const direction = wheelDelta > 0 ? 1 : -1;
        wheelDelta = 0;
        setActiveIndex(activeIndex + direction);
      });
    },
    { passive: false }
  );

  deck.addEventListener("click", (event) => {
    const card = event.target.closest(".city-card");
    if (!card) return;
    const index = Number(card.dataset.index);
    if (Number.isNaN(index)) return;
    setActiveIndex(index);
    updateBackground(getActiveCity(), card.dataset.bg || "");
    setFocusMode(true);
  });

  document.addEventListener("click", (event) => {
    if (!focusMode) return;
    const target = event.target;
    if (deck.contains(target) || panel.contains(target) || (scrubber && scrubber.contains(target))) return;
    setFocusMode(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setFocusMode(false);
      if (galleryOpen) toggleGalleryDrawer();
    }
  });

  if (scrubUp) scrubUp.addEventListener("click", () => setActiveIndex(activeIndex - 1));
  if (scrubDown) scrubDown.addEventListener("click", () => setActiveIndex(activeIndex + 1));
  if (scrubber) {
    scrubber.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex(activeIndex - 1);
      }
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex(activeIndex + 1);
      }
    });
  }

  if (deck) {
    deck.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex(activeIndex - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex(activeIndex + 1);
      }
    });
  }

  if (panelGalleryButton) {
    panelGalleryButton.addEventListener("click", () => {
      toggleGalleryDrawer();
    });
  }

  if (observer) {
    deck.querySelectorAll(".city-card").forEach((card) => observer.observe(card));
  }
}

async function loadTourDatesWithCache() {
  const isLocal =
    typeof location !== "undefined" &&
    (location.hostname === "127.0.0.1" || location.hostname === "localhost");
  if (!isLocal) {
  try {
    const cachedRaw = sessionStorage.getItem(TOUR_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached && cached.data && typeof cached.ts === "number") {
        if (Date.now() - cached.ts < TOUR_CACHE_TTL_MS) {
          return cached.data;
        }
      }
    }
  } catch (err) {
    console.warn("Tour cache read failed; refetching.", err);
  }
  }

  const response = await fetch(TOUR_DATES_JSON_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load tour dates: ${response.status}`);
  }
  const data = await response.json();
  const normalized = normalizeTourData(data);

  try {
    sessionStorage.setItem(TOUR_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: normalized }));
  } catch (err) {
    console.warn("Tour cache write failed; continuing without cache.", err);
  }

  return normalized;
}

async function getTourData() {
  if (tourDataCache) return tourDataCache;
  const data = await loadTourDatesWithCache();
  tourDataCache = data;
  return data;
}

function getNextUpcomingEvent(events) {
  const now = new Date();
  const upcoming = events
    .filter((event) => event?.hasValidDate && event.startDate >= now)
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


function syncNextShowUI(nextEvent) {
  const nextShowText = document.getElementById("next-show-text");
  const nextShowLink = document.getElementById("next-show-link");
  const countdownEvent = document.querySelector("#tour .countdown-event");
  const parsedDate = nextEvent?.startDate instanceof Date ? nextEvent.startDate : nextEvent?.start ? new Date(nextEvent.start) : null;

  if (nextShowText) {
    if (parsedDate && !Number.isNaN(parsedDate.getTime())) {
      const formattedDate = formatDateForMeta(parsedDate);
      const venueText = nextEvent.venue || nextEvent.title || nextEvent.cityName || nextEvent.city || "";
      const metaParts = [venueText, formattedDate];
      if (nextEvent.doorsText) metaParts.push(nextEvent.doorsText);
      nextShowText.textContent = metaParts.filter(Boolean).join(" • ");
    } else {
      nextShowText.textContent = "No upcoming shows right now.";
    }
  }

  if (countdownEvent) {
    if (nextEvent) {
      const labelParts = [nextEvent.cityName || nextEvent.city, nextEvent.title].filter(Boolean);
      countdownEvent.textContent = labelParts.length ? labelParts.join(" • ") : "Next show";
    } else {
      countdownEvent.textContent = "No upcoming shows";
    }
  }

  if (nextShowLink) {
    if (!nextEvent) {
      nextShowLink.textContent = "Join waitlist";
      nextShowLink.setAttribute("href", "#");
      nextShowLink.setAttribute("aria-disabled", "true");
      nextShowLink.removeAttribute("target");
      return;
    }

    const hasTickets = !!nextEvent.ticketsUrl;
    nextShowLink.textContent = hasTickets ? "Buy tickets" : "Join waitlist";
    nextShowLink.setAttribute(
      "href",
      hasTickets ? nextEvent.ticketsUrl : `tour-hub.html?id=${encodeURIComponent(nextEvent.id)}`
    );
    if (hasTickets) {
      nextShowLink.setAttribute("target", "_blank");
      nextShowLink.setAttribute("rel", "noopener");
    } else {
      nextShowLink.removeAttribute("target");
      nextShowLink.removeAttribute("rel");
    }
    nextShowLink.removeAttribute("aria-disabled");
  }
}

function renderTourList(events) {
  const listEl = document.getElementById("tour-list");
  if (!listEl) return;

  listEl.replaceChildren();

  const now = new Date();
  const upcoming = events
    .map((event) => {
      const date = event.startDate instanceof Date ? event.startDate : event.start ? new Date(event.start) : null;
      const valid = !!date && !Number.isNaN(date.getTime());
      return { event, date, valid };
    })
    .filter(({ valid, date }) => valid && date >= now)
    .sort((a, b) => a.date - b.date)
    .slice(0, 3);

  if (upcoming.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tour-item is-past";
    empty.textContent = "No upcoming dates announced.";
    listEl.appendChild(empty);
    return;
  }

  upcoming.forEach(({ event, date }) => {
    const item = document.createElement("div");
    item.className = "tour-item";

    const dateEl = document.createElement("div");
    dateEl.className = "tour-item-date";
    dateEl.textContent = formatListDate(date);

    const locationEl = document.createElement("div");
    locationEl.className = "tour-item-location";
    locationEl.textContent = event.cityName || event.city || "TBA";

    const venueEl = document.createElement("div");
    venueEl.className = "tour-item-venue";
    venueEl.textContent = event.venue || event.title || "TBA";

    const actionEl = document.createElement("div");
    actionEl.className = "tour-item-action";

    const link = document.createElement("a");
    link.textContent = "Join waitlist";
    link.setAttribute("href", event.id ? `tour-hub.html?id=${encodeURIComponent(event.id)}` : "tour-hub.html");
    actionEl.appendChild(link);

    item.append(dateEl, locationEl, venueEl, actionEl);
    listEl.appendChild(item);
  });
}

async function initTourHub() {
  const hub = document.querySelector(".tour-hub");
  if (!hub) return;

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

  const setFallbackUI = () => {
    if (titleEl) titleEl.textContent = "TBA • TBA";
    if (regionEl) regionEl.textContent = "TBA";
    if (venueEl) venueEl.textContent = "Venue TBA";
    if (locationEl) locationEl.textContent = "TBA";
    if (dateEl) dateEl.textContent = "TBA";
    if (daysEl) daysEl.textContent = "00";
    if (hoursEl) hoursEl.textContent = "00";
    if (secondsEl) secondsEl.textContent = "00";
  };

  let tourData;
  try {
    tourData = await getTourData();
  } catch (err) {
    console.warn("Tour hub load failed; no data available.", err);
    setFallbackUI();
    return;
  }

  const cityMap = buildCityMap(tourData.cities);
  const events = normalizeEvents(tourData.events, cityMap);
  if (!events.length) {
    setFallbackUI();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");
  const selectedEvent =
    events.find((event) => event.id === eventId) || getNextUpcomingEvent(events) || events[0];

  if (!selectedEvent) {
    setFallbackUI();
    return;
  }

  const hasValidDate = selectedEvent.hasValidDate;
  const dateObj = selectedEvent.startDate;
  const formattedDate = hasValidDate ? formatDateForMeta(dateObj) : "TBA";
  const cityLabel = selectedEvent.cityName || selectedEvent.city || "TBA";
  const regionLabel = selectedEvent.region || cityLabel;
  const venueLabel = selectedEvent.venue || selectedEvent.title || "TBA";

  if (titleEl) titleEl.textContent = `${cityLabel} • ${formattedDate}`;
  if (regionEl) regionEl.textContent = regionLabel.toUpperCase();
  if (venueEl) venueEl.textContent = venueLabel;
  if (locationEl) locationEl.textContent = venueLabel;
  if (dateEl) dateEl.textContent = formattedDate;

  const countKey = selectedEvent.id;
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
    if (!daysEl || !hoursEl || !secondsEl) return;
    if (!hasValidDate || !dateObj) {
      daysEl.textContent = "00";
      hoursEl.textContent = "00";
      secondsEl.textContent = "00";
      return;
    }
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
  setInterval(updateCountdown, 1000);

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

function initSpotifyReactiveBackground() {
  const spotifySection = document.querySelector("#spotify.spotify-section");
  if (!spotifySection) return;

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const isTouchLike = window.matchMedia?.("(pointer: coarse)")?.matches;
  const supportsFinePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

  if (prefersReducedMotion || isTouchLike || !supportsFinePointer) {
    spotifySection.classList.add("spotify-reactive-disabled");
    return;
  }

  let currentX = 0.5;
  let currentY = 0.46;
  let targetX = 0.5;
  let targetY = 0.46;
  let rafId = null;
  let isInside = false;

  const setVars = () => {
    const parallaxX = (currentX - 0.5) * 2;
    const parallaxY = (currentY - 0.5) * 2;

    spotifySection.style.setProperty("--spotify-cursor-x", `${(currentX * 100).toFixed(2)}%`);
    spotifySection.style.setProperty("--spotify-cursor-y", `${(currentY * 100).toFixed(2)}%`);
    spotifySection.style.setProperty("--spotify-parallax-x", parallaxX.toFixed(4));
    spotifySection.style.setProperty("--spotify-parallax-y", parallaxY.toFixed(4));
  };

  const animate = () => {
    currentX += (targetX - currentX) * 0.12;
    currentY += (targetY - currentY) * 0.12;
    setVars();

    const settled =
      Math.abs(targetX - currentX) < 0.0015 &&
      Math.abs(targetY - currentY) < 0.0015;

    if (!isInside && settled) {
      rafId = null;
      return;
    }

    rafId = window.requestAnimationFrame(animate);
  };

  const ensureLoop = () => {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(animate);
  };

  const onPointerMove = (event) => {
    const rect = spotifySection.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    targetX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    targetY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    isInside = true;
    ensureLoop();
  };

  const onPointerLeave = () => {
    isInside = false;
    targetX = 0.5;
    targetY = 0.46;
    ensureLoop();
  };

  spotifySection.addEventListener("pointermove", onPointerMove, { passive: true });
  spotifySection.addEventListener("pointerenter", onPointerMove, { passive: true });
  spotifySection.addEventListener("pointerleave", onPointerLeave, { passive: true });
  setVars();
}

function initAlbumsOrbitMobile() {
  const stage = document.querySelector(".albums-stage");
  const ring = stage?.querySelector(".albums-ring");
  if (!stage || !ring) return;

  const cards = Array.from(ring.querySelectorAll(".album-card"));
  if (!cards.length) return;

  const swipeHint = document.getElementById("albums-swipe-hint");
  const hintKey = "albumsOrbitSwipeHintDismissed";
  const mobileMQ = window.matchMedia("(max-width: 768px)");
  const reducedMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  const getVisibleDepth = () => {
    const raw = window.getComputedStyle(stage).getPropertyValue("--albums-mobile-visible-depth");
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return 2;
    return Math.max(1, parsed);
  };
  let activeIndex = 0;
  let enabled = false;
  let isDragging = false;
  let dragStartX = 0;
  let dragLastX = 0;
  let dragDeltaX = 0;
  let dragStartTime = 0;
  let suppressClick = false;

  const normalizeIndex = (value) => {
    const len = cards.length;
    return ((value % len) + len) % len;
  };

  const shortestDelta = (index, center) => {
    let delta = index - center;
    const half = cards.length / 2;
    if (delta > half) delta -= cards.length;
    if (delta < -half) delta += cards.length;
    return delta;
  };

  const hideHint = () => {
    if (!swipeHint || swipeHint.classList.contains("is-hidden")) return;
    swipeHint.classList.add("is-hidden");
    try {
      localStorage.setItem(hintKey, "1");
    } catch (err) {
      console.warn("Unable to persist albums hint preference.", err);
    }
  };

  const updateHintVisibility = () => {
    if (!swipeHint) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(hintKey) === "1";
    } catch (err) {
      dismissed = false;
    }
    swipeHint.classList.toggle("is-hidden", dismissed || !enabled);
  };

  const render = (previewOffset = 0) => {
    const visibleDepth = getVisibleDepth();
    cards.forEach((card, index) => {
      const delta = shortestDelta(index, activeIndex) + previewOffset;
      const absDelta = Math.abs(delta);
      const hidden = absDelta > visibleDepth;
      card.style.setProperty("--mobile-delta", delta.toFixed(3));
      card.style.setProperty("--mobile-abs", absDelta.toFixed(3));
      card.dataset.mobileHidden = hidden ? "true" : "false";
      card.classList.toggle("is-mobile-active", Math.round(delta) === 0 && Math.abs(previewOffset) < 0.3);
      card.tabIndex = Math.round(delta) === 0 ? 0 : -1;
      card.style.zIndex = String(80 - Math.round(absDelta * 10));
    });
  };

  const setActive = (nextIndex) => {
    activeIndex = normalizeIndex(nextIndex);
    render();
  };

  const onPointerDown = (event) => {
    if (!enabled || event.pointerType === "mouse") return;
    isDragging = true;
    suppressClick = false;
    dragStartX = event.clientX;
    dragLastX = event.clientX;
    dragDeltaX = 0;
    dragStartTime = performance.now();
    stage.classList.add("is-dragging");
  };

  const onPointerMove = (event) => {
    if (!enabled || !isDragging) return;
    dragLastX = event.clientX;
    dragDeltaX = dragLastX - dragStartX;
    if (Math.abs(dragDeltaX) > 6) suppressClick = true;
    const preview = Math.max(-1.2, Math.min(1.2, dragDeltaX / Math.max(200, stage.clientWidth * 0.7)));
    render(-preview);
  };

  const onPointerUp = () => {
    if (!enabled || !isDragging) return;
    isDragging = false;
    stage.classList.remove("is-dragging");

    const elapsed = Math.max(1, performance.now() - dragStartTime);
    const velocity = dragDeltaX / elapsed;
    const threshold = Math.max(34, stage.clientWidth * 0.08);
    let direction = 0;
    if (Math.abs(dragDeltaX) > threshold || Math.abs(velocity) > 0.34) {
      direction = dragDeltaX < 0 ? 1 : -1;
    }

    if (direction !== 0) {
      setActive(activeIndex + direction);
      hideHint();
    } else {
      render();
    }
  };

  const onCardClick = (event) => {
    if (!enabled) return;
    const card = event.currentTarget;
    const index = Number(card.dataset.mobileIndex);
    if (Number.isNaN(index)) return;

    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
      return;
    }

    if (index !== activeIndex) {
      event.preventDefault();
      setActive(index);
      hideHint();
    } else {
      hideHint();
    }
  };

  const enable = () => {
    enabled = true;
    stage.classList.add("albums-mobile-orbit");
    ring.style.animation = "none";
    cards.forEach((card, index) => {
      card.dataset.mobileIndex = String(index);
    });
    render();
    updateHintVisibility();
  };

  const disable = () => {
    enabled = false;
    isDragging = false;
    stage.classList.remove("albums-mobile-orbit", "is-dragging");
    ring.style.animation = "";
    cards.forEach((card) => {
      card.style.removeProperty("--mobile-delta");
      card.style.removeProperty("--mobile-abs");
      card.style.removeProperty("z-index");
      delete card.dataset.mobileHidden;
      card.classList.remove("is-mobile-active");
      card.tabIndex = 0;
    });
    updateHintVisibility();
  };

  const evaluateMode = () => {
    if (mobileMQ.matches) {
      if (!enabled) enable();
    } else if (enabled) {
      disable();
    }
  };

  cards.forEach((card) => {
    card.addEventListener("click", onCardClick);
  });

  stage.addEventListener("pointerdown", onPointerDown, { passive: true });
  stage.addEventListener("pointermove", onPointerMove, { passive: true });
  stage.addEventListener("pointerup", onPointerUp, { passive: true });
  stage.addEventListener("pointercancel", onPointerUp, { passive: true });
  stage.addEventListener("pointerleave", onPointerUp, { passive: true });

  window.addEventListener("resize", evaluateMode);
  mobileMQ.addEventListener?.("change", evaluateMode);
  reducedMotionMQ.addEventListener?.("change", evaluateMode);

  evaluateMode();
}

function updateCountdown() {
  const now = new Date();
  const diff = countdownTarget ? countdownTarget - now : 0;

  const daysEl = document.getElementById("days");
  const hoursEl = document.getElementById("hours");
  const minutesEl = document.getElementById("minutes");
  const secondsEl = document.getElementById("seconds");

  if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

  if (!countdownTarget || diff <= 0) {
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
    const openNav = () => {
      nav.classList.add("nav-open");
      body.classList.add("menu-open");
      navToggle.setAttribute("aria-expanded", "true");
    };

    const closeNav = () => {
      nav.classList.remove("nav-open");
      body.classList.remove("menu-open");
      navToggle.setAttribute("aria-expanded", "false");
    };

    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.contains("nav-open");
      if (isOpen) {
        closeNav();
        return;
      }
      openNav();
    });

    nav.addEventListener("click", (event) => {
      if (event.target === nav) {
        closeNav();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        closeNav();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!nav.classList.contains("nav-open")) return;
      closeNav();
      navToggle.focus();
    });

    navList.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        closeNav();
      });
    });
  }

  if (navToggle) {
    navToggle.setAttribute("aria-controls", "primary-nav");
    if (!navToggle.hasAttribute("aria-expanded")) {
      navToggle.setAttribute("aria-expanded", "false");
    }
  }

  document.querySelectorAll("[data-scroll]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const target = trigger.getAttribute("data-scroll");
      if (!target) return;
      const el = document.querySelector(target);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  if (gModeToggle) {
    const applyTheme = (isGMode) => {
      body.classList.toggle("g-mode", isGMode);
      document.documentElement.setAttribute("data-theme", isGMode ? "g-red" : "default");
      gModeToggle.setAttribute("aria-pressed", isGMode ? "true" : "false");
    };

    const saved = localStorage.getItem("theme");
    const isSavedGMode = saved ? saved === "g-red" : localStorage.getItem("gMode") === "on";
    applyTheme(isSavedGMode);

    gModeToggle.addEventListener("click", () => {
      const isOn = !body.classList.contains("g-mode");
      applyTheme(isOn);
      localStorage.setItem("theme", isOn ? "g-red" : "default");
      localStorage.setItem("gMode", isOn ? "on" : "off");
      initGModeHeroVideo();
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
  initAlbumsOrbitMobile();
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

  initTourHub();

  try {
    const tourData = await getTourData();
    const cityMap = buildCityMap(tourData.cities);
    const events = normalizeEvents(tourData.events, cityMap);
    renderTourList(events);
    const nextEvent = getNextUpcomingEvent(events);
    if (nextEvent?.startDate) {
      countdownTarget = nextEvent.startDate;
    } else {
      countdownTarget = null;
    }
    syncNextShowUI(nextEvent);
    initCitiesArchiveV2(buildCitiesArchiveData(cityMap, events));
  } catch (err) {
    console.warn("Tour dates load failed; using empty fallback.", err);
    countdownTarget = null;
    syncNextShowUI(null);
    renderTourList([]);
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

  // If toggle not found or state changes elsewhere, ensure video matches current state.
  initGModeHeroVideo();

  initParticlesBackground();
  initSpotifyReactiveBackground();

  // Smoke test to verify canvas creation without breaking UI
  setTimeout(() => {
    const canvas = document.querySelector("#particles-bg canvas");
    const msg = canvas ? "Particles smoke test: PASS" : "Particles smoke test: FAIL";
    console.log(msg);
  }, 1500);

});
