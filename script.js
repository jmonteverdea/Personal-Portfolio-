/* ============================================================
   script.js
   - Generates the 200-dot solar SVG grid
   - Animates number counters on viewport entry
   - Subtle fade-in on scroll
   - Respects prefers-reduced-motion
============================================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ----------------------------------------------------------
     Build the 200-dot grid for the Solar case study
  ---------------------------------------------------------- */
  function buildDotGrid() {
    const host = document.getElementById('dot-grid-g');
    if (!host) return;

    const cols = 20;
    const rows = 10;
    const total = cols * rows;
    const cellW = 420 / cols;
    const cellH = 210 / rows;
    const r = 3;

    // Approx 150 residential / 200 total. Distribute the residential
    // ring across the first 150 dots so the visual maps to the cohort.
    const residentialCount = 150;

    let html = '';
    for (let i = 0; i < total; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = cellW / 2 + col * cellW;
      const cy = cellH / 2 + row * cellH;
      const isResidential = i < residentialCount;
      const fill = isResidential ? '#D7E864' : '#AAB4AA';
      html += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r}" fill="${fill}" style="transition-delay:${(i * 6).toFixed(0)}ms"/>`;
    }
    host.innerHTML = html;
  }

  /* ----------------------------------------------------------
     Count-up animation for elements with [data-count]
  ---------------------------------------------------------- */
  function animateCount(el) {
    const target = parseInt(el.getAttribute('data-count'), 10);
    const suffix = el.getAttribute('data-suffix') || '';
    if (Number.isNaN(target)) return;

    if (reduceMotion) {
      el.textContent = target + suffix;
      return;
    }

    const duration = 1200;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(target * eased);
      el.textContent = value + suffix;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ----------------------------------------------------------
     IntersectionObserver: fade-in + counters + dot grid reveal
  ---------------------------------------------------------- */
  function bindObservers() {
    // Fade-in
    const fadeEls = document.querySelectorAll('.fade-in');
    if ('IntersectionObserver' in window && !reduceMotion) {
      const fadeObs = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            fadeObs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      fadeEls.forEach((el) => fadeObs.observe(el));
    } else {
      fadeEls.forEach((el) => el.classList.add('is-visible'));
    }

    // Counters
    const counterEls = document.querySelectorAll('.num-target[data-count]');
    if ('IntersectionObserver' in window) {
      const countObs = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countObs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      counterEls.forEach((el) => {
        // Initialize at 0 so the count-up starts from zero
        if (!reduceMotion) {
          const suffix = el.getAttribute('data-suffix') || '';
          el.textContent = '0' + suffix;
        }
        countObs.observe(el);
      });
    } else {
      counterEls.forEach((el) => animateCount(el));
    }

    // Dot grid reveal
    const grid = document.querySelector('.dot-grid');
    if (grid && 'IntersectionObserver' in window) {
      const gridObs = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            grid.classList.add('in');
            gridObs.unobserve(grid);
          }
        });
      }, { threshold: 0.2 });
      gridObs.observe(grid);
    } else if (grid) {
      grid.classList.add('in');
    }
  }

  /* ----------------------------------------------------------
     Init
  ---------------------------------------------------------- */
  function init() {
    buildDotGrid();
    bindObservers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
