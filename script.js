/* ============================================================
   script.js — Field Report design system
   - Hero headline word-level staggered reveal
   - Generates the 200-dot solar SVG grid
   - Animates number counters on viewport entry
   - Scroll-triggered reveals with per-group stagger
   - Header hide-on-scroll + scroll progress bar
   - Respects prefers-reduced-motion
============================================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------
     Hero headline: split words into spans for staggered reveal.
     The closing phrase ("I close that gap.") gets the editorial
     serif treatment. Text content is untouched.
  ---------------------------------------------------------- */
  function splitHeroTitle() {
    const title = document.querySelector('.hero-title');
    if (!title || reduceMotion) return;

    const text = title.textContent.trim().replace(/\s+/g, ' ');
    const words = text.split(' ');
    const accentStart = words.length - 4; // "I close that gap."

    title.textContent = '';
    title.classList.remove('fade-in');

    words.forEach(function (word, i) {
      const span = document.createElement('span');
      span.className = i >= accentStart ? 'w w-accent' : 'w';
      span.style.setProperty('--wd', (140 + i * 50) + 'ms');
      span.textContent = word;
      title.appendChild(span);
      if (i < words.length - 1) title.appendChild(document.createTextNode(' '));
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        title.classList.add('words-in');
      });
    });
  }

  /* ----------------------------------------------------------
     Serif accent on the work-index heading parenthetical.
     Visual only; words unchanged.
  ---------------------------------------------------------- */
  function styleIndexHeading() {
    const h2 = document.getElementById('work-index-heading');
    if (!h2) return;
    h2.innerHTML = h2.innerHTML.replace(
      '(and the receipts)',
      '<span class="serif-accent">(and the receipts)</span>'
    );
  }

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
      const fill = isResidential ? '#D7E864' : '#9FAC9F';
      html += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r}" fill="${fill}" style="transition-delay:${(i * 5).toFixed(0)}ms"/>`;
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
     Reveal choreography:
     - auto-apply .fade-in to case blocks so every section
       participates in the scroll rhythm
     - set per-sibling stagger delays (--d) within groups
  ---------------------------------------------------------- */
  function prepareReveals() {
    if (reduceMotion) return;

    document
      .querySelectorAll('.case-body .case-block, .case-meta, .case-bignum, .footer-block')
      .forEach(function (el) { el.classList.add('fade-in'); });

    const groups = document.querySelectorAll(
      '.stat-tiles, .work-index-grid, .stat-strip, .cred-grid, .hero-ctas, .footer-inner'
    );
    groups.forEach(function (group) {
      Array.prototype.forEach.call(group.children, function (child, i) {
        child.style.setProperty('--d', (i * 70) + 'ms');
      });
    });

    // Orchestrated hero entrance
    const heroSeq = document.querySelectorAll(
      '.hero .eyebrow, .hero .hero-status, .hero .hero-prop, .hero .hero-ctas, .hero .stat-tile'
    );
    heroSeq.forEach(function (el, i) {
      el.style.setProperty('--d', (i * 90) + 'ms');
    });
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

      // Safety net: anchor landings, back/forward scroll restoration,
      // and fast programmatic jumps can leave revealed-on-scroll
      // elements stranded above the viewport, or strand the visitor
      // mid-page waiting out the fade. Sweep those in instantly.
      const sweep = function (includeViewport) {
        fadeEls.forEach(function (el) {
          if (el.classList.contains('is-visible')) return;
          const r = el.getBoundingClientRect();
          const above = r.bottom < 0;
          const inView = r.top < window.innerHeight && r.bottom > 0;
          if (above || (includeViewport && inView)) {
            el.classList.add('no-anim', 'is-visible');
            fadeObs.unobserve(el);
          }
        });
      };
      let prevY = window.scrollY;
      window.addEventListener('scroll', function () {
        const y = window.scrollY;
        // A jump bigger than a viewport is a teleport (anchor load,
        // scroll restoration), not human scrolling: reveal instantly.
        sweep(Math.abs(y - prevY) > window.innerHeight);
        prevY = y;
      }, { passive: true });
      window.addEventListener('load', function () {
        setTimeout(function () {
          if (window.scrollY > 100) sweep(true);
        }, 60);
      });
      if (window.scrollY > 100) sweep(true);
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
     Header: hide on scroll down, reveal on scroll up.
     Scroll progress bar driven by --progress.
  ---------------------------------------------------------- */
  function bindHeaderAndProgress() {
    const header = document.querySelector('.site-header');
    const progress = document.querySelector('.scroll-progress');
    let lastY = window.scrollY;
    let ticking = false;

    function update() {
      const y = window.scrollY;

      if (header && !reduceMotion) {
        if (y > 480 && y > lastY + 4) {
          header.classList.add('is-hidden');
        } else if (y < lastY - 4 || y <= 480) {
          header.classList.remove('is-hidden');
        }
      }

      if (progress) {
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(1, y / max) : 0;
        progress.style.setProperty('--progress', p.toFixed(4));
      }

      lastY = y;
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });

    update();
  }

  /* ----------------------------------------------------------
     Lazy-load case videos
     Native <video preload="none"> handles most of this. The JS
     swap from data-lazy-src to src guarantees no network until
     the video is within 200px of the viewport.
  ---------------------------------------------------------- */
  function bindLazyVideos() {
    const videos = document.querySelectorAll('.case-video-el[data-lazy-src]');
    if (!videos.length) return;
    if (!('IntersectionObserver' in window)) {
      videos.forEach((v) => { v.src = v.getAttribute('data-lazy-src'); });
      return;
    }
    const obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const v = entry.target;
          if (!v.src) v.src = v.getAttribute('data-lazy-src');
          obs.unobserve(v);
        }
      });
    }, { rootMargin: '200px 0px' });
    videos.forEach((v) => obs.observe(v));
  }

  /* ----------------------------------------------------------
     Init
  ---------------------------------------------------------- */
  function init() {
    splitHeroTitle();
    styleIndexHeading();
    buildDotGrid();
    bindLazyVideos();
    prepareReveals();
    bindObservers();
    bindHeaderAndProgress();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
