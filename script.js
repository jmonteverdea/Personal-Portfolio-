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
     V3 FINAL: Lazy-load case videos
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
     V3 FINAL: TRCA scoring matrix
     7 pathway rows x 3 criteria columns. 3 rows highlighted.
     All names and scores are placeholders.
  ---------------------------------------------------------- */
  function buildTrcaMatrix() {
    const svg = document.getElementById('trca-matrix');
    if (!svg) return;
    const W = 600, H = 360;
    const labelW = 220;
    const colW = (W - labelW) / 3;
    const headerH = 36;
    const rowH = (H - headerH) / 7;
    const criteria = ['Cost', 'Risk', 'Feasibility'];
    const shortlisted = new Set([0, 2, 5]);
    let html = '';
    // Header row
    for (let i = 0; i < 3; i++) {
      const x = labelW + i * colW + colW / 2;
      html += `<text x="${x}" y="${headerH - 12}" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="600" letter-spacing="1.2" fill="#AAB4AA">${criteria[i].toUpperCase()}</text>`;
    }
    html += `<line x1="0" y1="${headerH}" x2="${W}" y2="${headerH}" stroke="rgba(245,240,230,0.28)" stroke-width="1"/>`;
    // Rows
    for (let r = 0; r < 7; r++) {
      const y = headerH + r * rowH;
      const cy = y + rowH / 2;
      const isShort = shortlisted.has(r);
      // Left edge highlight for shortlisted
      if (isShort) {
        html += `<rect x="0" y="${y}" width="3" height="${rowH}" fill="#D7E864"/>`;
      }
      // Row separator
      if (r > 0) {
        html += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(245,240,230,0.12)" stroke-width="1"/>`;
      }
      // Pathway label
      html += `<text x="14" y="${cy + 4}" font-family="Inter, sans-serif" font-size="13" font-weight="${isShort ? 600 : 500}" fill="${isShort ? '#F5F0E6' : '#AAB4AA'}">{{PLACEHOLDER: pathway ${r + 1}}}</text>`;
      // Score cells
      for (let c = 0; c < 3; c++) {
        const x = labelW + c * colW + colW / 2;
        html += `<text x="${x}" y="${cy + 5}" text-anchor="middle" font-family="Inter, sans-serif" font-size="14" font-weight="600" font-feature-settings="'tnum' 1" fill="${isShort ? '#D7E864' : '#AAB4AA'}">{{PLACEHOLDER: score}}</text>`;
      }
    }
    // Column dividers
    for (let i = 0; i <= 3; i++) {
      const x = labelW + i * colW;
      html += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="rgba(245,240,230,0.08)" stroke-width="1"/>`;
    }
    svg.innerHTML = html;
  }

  /* ----------------------------------------------------------
     V3 FINAL: Granted funding flow
     4 stages: Clients (30) → Programs explored → Apps → Approved.
     Known counts in lime, placeholders in muted.
  ---------------------------------------------------------- */
  function buildGrantedFlow() {
    const svg = document.getElementById('granted-flow');
    if (!svg) return;
    const W = 600, H = 240;
    const colCount = 4;
    const colW = W / colCount;
    const cy = H / 2 - 10;
    const stages = [
      { num: '30',                       label: 'Active clients',    known: true },
      { num: '{{PLACEHOLDER: count}}',   label: 'Programs explored', known: false },
      { num: '{{PLACEHOLDER: count}}',   label: 'Applications',      known: false },
      { num: 'CAD 200K+',                label: 'Approved',          known: true }
    ];
    let html = '';
    // Connecting lines first (behind nodes)
    for (let i = 0; i < colCount - 1; i++) {
      const x1 = colW / 2 + i * colW + 60;
      const x2 = colW / 2 + (i + 1) * colW - 60;
      html += `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="rgba(245,240,230,0.28)" stroke-width="1"/>`;
      // arrow tip
      html += `<polyline points="${x2 - 6},${cy - 5} ${x2},${cy} ${x2 - 6},${cy + 5}" fill="none" stroke="rgba(245,240,230,0.28)" stroke-width="1"/>`;
    }
    // Nodes
    stages.forEach(function (s, i) {
      const cx = colW / 2 + i * colW;
      const color = s.known ? '#D7E864' : '#AAB4AA';
      const fontSize = s.known ? 28 : 16;
      html += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="Inter, sans-serif" font-size="${fontSize}" font-weight="800" font-feature-settings="'tnum' 1" fill="${color}">${s.num}</text>`;
      html += `<text x="${cx}" y="${cy + 38}" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="500" letter-spacing="1" fill="#AAB4AA">${s.label.toUpperCase()}</text>`;
    });
    svg.innerHTML = html;
  }

  /* ----------------------------------------------------------
     Init
  ---------------------------------------------------------- */
  function init() {
    buildDotGrid();
    buildTrcaMatrix();
    buildGrantedFlow();
    bindLazyVideos();
    bindObservers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
