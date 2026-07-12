/**
 * effects.js — Glass 3D Visual Enhancement Layer
 * Cursor glow · 3D tilt · holographic shimmer · magnetic buttons
 * scroll reveal · ambient orb injection · ripple clicks
 *
 * Fully self-contained IIFE — does not interfere with main.js
 */
(function () {
  'use strict';

  /* ─── Motion preference ─── */
  const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noHover  = window.matchMedia('(hover: none)').matches;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  /* ─── RAF-based lerp helper ─── */
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ================================================================
     CURSOR GLOW
     Smooth spotlight that follows the mouse with inertia
     ================================================================ */
  function initCursorGlow() {
    if (noMotion || noHover) return;

    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);

    const HALF = 280; // half of the 560px element
    let mouseX = window.innerWidth  / 2;
    let mouseY = window.innerHeight / 2;
    let glowX  = mouseX;
    let glowY  = mouseY;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    // Hide when mouse leaves window
    document.addEventListener('mouseleave', () => {
      glow.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
      glow.style.opacity = '1';
    });

    (function tick() {
      glowX = lerp(glowX, mouseX, 0.065);
      glowY = lerp(glowY, mouseY, 0.065);
      glow.style.transform = `translate(${glowX - HALF}px, ${glowY - HALF}px)`;
      requestAnimationFrame(tick);
    })();
  }

  /* ================================================================
     ALBUM CARD HOLOGRAPHIC SHIMMER
     Updates --mx / --my CSS vars on each card so the
     CSS radial-gradient follows the cursor without overriding
     the existing ring transform
     ================================================================ */
  function initAlbumCardShimmer() {
    document.querySelectorAll('.album-card').forEach((card) => {
      // Inject foil element if not present
      if (!card.querySelector('.album-card-foil')) {
        const foil = document.createElement('div');
        foil.className = 'album-card-foil';
        foil.setAttribute('aria-hidden', 'true');
        card.appendChild(foil);
      }

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top)  / rect.height;
        card.style.setProperty('--mx', mx.toFixed(3));
        card.style.setProperty('--my', my.toFixed(3));

        // Update foil gradient angle dynamically
        const foil = card.querySelector('.album-card-foil');
        if (foil) {
          const deg = 110 + (mx - 0.5) * 40;
          foil.style.background = `linear-gradient(
            ${deg}deg,
            transparent 12%,
            rgba(255,210,90,0.13) 28%,
            rgba(90,255,190,0.15) 44%,
            rgba(90,170,255,0.13) 60%,
            rgba(210,90,255,0.13) 76%,
            transparent 90%)`;
        }
      });

      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--mx', '0.5');
        card.style.setProperty('--my', '0.5');
      });
    });
  }

  /* ================================================================
     3D TILT — city cards, tour items, any .tilt-3d element
     Uses CSS custom properties + requestAnimationFrame for smooth
     interpolation. Does NOT touch transform on album cards
     (ring CSS would break).
     ================================================================ */
  function initTilt3D() {
    if (noMotion || noHover || isMobile) return;

    const targets = [
      ...document.querySelectorAll('.city-card'),
      ...document.querySelectorAll('.tilt-3d'),
    ];

    targets.forEach((card) => {
      // Skip album cards — they use the shimmer approach instead
      if (card.classList.contains('album-card')) return;

      let targetX = 0, targetY = 0;
      let currentX = 0, currentY = 0;
      let rafId = null;
      let active = false;

      // Inject shine + foil layers
      let shine = card.querySelector('.tilt-shine');
      let foil  = card.querySelector('.tilt-foil');
      if (!shine) {
        shine = document.createElement('div');
        shine.className = 'tilt-shine';
        shine.setAttribute('aria-hidden', 'true');
        card.appendChild(shine);
      }
      if (!foil) {
        foil = document.createElement('div');
        foil.className = 'tilt-foil';
        foil.setAttribute('aria-hidden', 'true');
        card.appendChild(foil);
      }

      function tick() {
        currentX = lerp(currentX, targetX, 0.12);
        currentY = lerp(currentY, targetY, 0.12);

        const MAX = 15;
        const rx = currentY * -MAX;
        const ry = currentX *  MAX;

        card.style.transform = active
          ? `perspective(var(--tilt-perspective, 860px)) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.025)`
          : `perspective(var(--tilt-perspective, 860px)) rotateX(${rx}deg) rotateY(${ry}deg) scale(1)`;

        // Shine position
        const sx = (currentX + 0.5 + 0.5) * 50; // map -0.5→0.5 to 0→100
        const sy = (currentY + 0.5 + 0.5) * 50;
        shine.style.background = `radial-gradient(circle at ${sx}% ${sy}%, rgba(255,255,255,0.22) 0%, transparent 56%)`;

        // Foil angle
        const deg = 115 + currentX * 28;
        foil.style.background = `linear-gradient(${deg}deg,
          transparent 14%,
          rgba(255,210,90,0.11) 29%,
          rgba(90,255,190,0.13) 45%,
          rgba(90,170,255,0.11) 61%,
          rgba(210,90,255,0.11) 77%,
          transparent 89%)`;

        const stillMoving =
          Math.abs(currentX - targetX) > 0.0008 ||
          Math.abs(currentY - targetY) > 0.0008;
        if (stillMoving) {
          rafId = requestAnimationFrame(tick);
        } else {
          rafId = null;
          if (!active) {
            // Snap to rest
            card.style.transform = '';
          }
        }
      }

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        targetX = (e.clientX - rect.left) / rect.width  - 0.5;
        targetY = (e.clientY - rect.top)  / rect.height - 0.5;
        active = true;
        shine.style.opacity = '1';
        foil.style.opacity  = '1';
        card.style.transition = 'box-shadow 0.15s ease';
        if (!rafId) rafId = requestAnimationFrame(tick);
      });

      card.addEventListener('mouseleave', () => {
        targetX = 0;
        targetY = 0;
        active = false;
        shine.style.opacity = '0';
        foil.style.opacity  = '0';
        card.style.transition = 'transform 0.65s cubic-bezier(0.22,1,0.36,1), box-shadow 0.65s ease';
        if (!rafId) rafId = requestAnimationFrame(tick);
      });
    });
  }

  /* ================================================================
     MAGNETIC BUTTONS
     CTA buttons subtly attract toward the cursor
     ================================================================ */
  function initMagnetic() {
    if (noMotion || noHover) return;

    const STRENGTH = 0.38;

    document.querySelectorAll('.btn-magnetic').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width  / 2);
        const dy = e.clientY - (rect.top  + rect.height / 2);
        btn.style.transform = `translate(${dx * STRENGTH}px, ${dy * STRENGTH}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transition = 'transform 0.55s cubic-bezier(0.22,1,0.36,1)';
        btn.style.transform  = '';
        // reset transition after spring finishes
        btn.addEventListener('transitionend', () => {
          btn.style.transition = '';
        }, { once: true });
      });
    });
  }

  /* ================================================================
     RIPPLE CLICK EFFECT
     Creates an ink-ripple on every .btn click
     ================================================================ */
  function initRipple() {
    // Inject keyframe once
    if (!document.getElementById('ripple-kf')) {
      const style = document.createElement('style');
      style.id = 'ripple-kf';
      style.textContent = `
        @keyframes ripple-expand {
          to { transform: scale(22); opacity: 0; }
        }`;
      document.head.appendChild(style);
    }

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn) return;

      const rect  = btn.getBoundingClientRect();
      const x     = e.clientX - rect.left;
      const y     = e.clientY - rect.top;
      const size  = 10;

      const ripple = document.createElement('span');
      ripple.setAttribute('aria-hidden', 'true');
      Object.assign(ripple.style, {
        position:    'absolute',
        width:       `${size}px`,
        height:      `${size}px`,
        borderRadius:'50%',
        background:  'rgba(255,255,255,0.32)',
        top:         `${y - size / 2}px`,
        left:        `${x - size / 2}px`,
        pointerEvents:'none',
        animation:   'ripple-expand 0.55s ease-out forwards',
        zIndex:      '20',
      });

      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }

  /* ================================================================
     SCROLL REVEAL
     Observes .reveal elements and toggles .is-visible with stagger
     ================================================================ */
  function initScrollReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;

    if (noMotion) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const delay = parseInt(entry.target.dataset.revealDelay || '0', 10);
          setTimeout(() => {
            entry.target.classList.add('is-visible');
          }, delay);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.10, rootMargin: '0px 0px -36px 0px' }
    );

    els.forEach((el) => observer.observe(el));
  }

  /* ================================================================
     AMBIENT ORBS INJECTION
     Inserts the three floating orb divs into a section
     ================================================================ */
  function injectAmbientOrbs(selector, count) {
    count = count || 3;
    const section = document.querySelector(selector);
    if (!section) return;
    if (section.querySelector('.ambient-orbs')) return;

    const wrap = document.createElement('div');
    wrap.className = 'ambient-orbs';
    wrap.setAttribute('aria-hidden', 'true');

    for (let i = 1; i <= count; i++) {
      const orb = document.createElement('div');
      orb.className = `ambient-orb ambient-orb--${i}`;
      wrap.appendChild(orb);
    }

    // Insert before first child so it stays behind content
    section.insertBefore(wrap, section.firstChild);
  }

  /* ================================================================
     CITY CARD SHIMMER
     Same CSS-var approach as album cards for city deck cards
     ================================================================ */
  function initCityCardShimmer() {
    document.querySelectorAll('.city-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--cx', ((e.clientX - rect.left) / rect.width).toFixed(3));
        card.style.setProperty('--cy', ((e.clientY - rect.top)  / rect.height).toFixed(3));
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--cx', '0.5');
        card.style.setProperty('--cy', '0.5');
      });
    });
  }

  /* ================================================================
     STAT COUNTER ANIMATION
     Counts up numeric .stat-value elements when scrolled into view
     ================================================================ */
  function initStatCounters() {
    const stats = document.querySelectorAll('.stat-value');
    if (!stats.length || noMotion) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const raw = el.textContent.replace(/[^0-9]/g, '');
        const target = parseInt(raw, 10);
        if (!raw || isNaN(target) || target === 0) return;

        const DURATION = 1100;
        const start = performance.now();

        (function step(now) {
          const elapsed  = now - start;
          const progress = Math.min(elapsed / DURATION, 1);
          const ease     = 1 - Math.pow(1 - progress, 3); // cubic out
          el.textContent = Math.round(target * ease).toLocaleString('en-US');
          if (progress < 1) requestAnimationFrame(step);
        })(performance.now());

        observer.unobserve(el);
      });
    }, { threshold: 0.6 });

    stats.forEach((el) => observer.observe(el));
  }

  /* ================================================================
     SECTION PARALLAX
     Gentle vertical parallax on elements with data-parallax-speed
     ================================================================ */
  function initParallax() {
    if (noMotion || noHover || isMobile) return;

    const layers = document.querySelectorAll('[data-parallax-speed]');
    if (!layers.length) return;

    let scheduled = false;

    function update() {
      const viewH = window.innerHeight;
      layers.forEach((el) => {
        const rect  = el.getBoundingClientRect();
        const cy    = rect.top + rect.height / 2;
        const norm  = (viewH / 2 - cy) / (viewH / 2); // -1 → 1
        const speed = parseFloat(el.dataset.parallaxSpeed || '0.12');
        el.style.transform = `translateY(${norm * speed * 55}px)`;
      });
      scheduled = false;
    }

    window.addEventListener('scroll', () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
  }

  /* ================================================================
     STICKY HEADER GLASS
     Adds .is-scrolled to <header> once the page scrolls past the
     hero pill's resting position, for a stronger glass strip.
     ================================================================ */
  function initStickyHeaderGlass() {
    const header = document.querySelector('header');
    if (!header) return;

    let scheduled = false;
    function update() {
      header.classList.toggle('is-scrolled', window.scrollY > 24);
      scheduled = false;
    }

    window.addEventListener('scroll', () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });

    update();
  }

  /* ================================================================
     INIT — DOMContentLoaded guard
     ================================================================ */
  function init() {
    initCursorGlow();
    initAlbumCardShimmer();
    initTilt3D();
    initMagnetic();
    initRipple();
    initScrollReveal();
    initCityCardShimmer();
    initStatCounters();
    initParallax();
    initStickyHeaderGlass();

    // Inject ambient orbs into key sections
    injectAmbientOrbs('.hero',      3);
    injectAmbientOrbs('.tour',      2);
    injectAmbientOrbs('#subscribe', 2);
    injectAmbientOrbs('.spotify-section', 2);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
