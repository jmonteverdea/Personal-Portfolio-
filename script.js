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
     WebGL energy field for the hero.
     A single full-screen quad running a flowing-contour shader:
     topographic lines drifting like heat over terrain, in the
     site's lime on deep green. Hand-written, no dependencies.
     DPR capped, paused offscreen, skipped on reduced motion.
  ---------------------------------------------------------- */
  function initHeroField() {
    if (reduceMotion) return;
    const canvas = document.querySelector('.hero-canvas');
    const hero = document.querySelector('.hero');
    if (!canvas || !hero) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power'
    });
    if (!gl) return;

    const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const FRAG = [
      'precision mediump float;',
      'uniform vec2 u_res;',
      'uniform float u_t;',
      'uniform vec2 u_m;',
      'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
      'float n(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.-2.*f);',
      ' return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}',
      'float fbm(vec2 p){float v=0.;float a=.5;',
      ' for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
      'void main(){',
      ' vec2 uv=gl_FragCoord.xy/u_res.xy;',
      ' vec2 p=uv;p.x*=u_res.x/u_res.y;',
      ' vec2 drift=vec2(u_t*.012,-u_t*.008)+(u_m-.5)*.06;',
      ' float e=fbm(p*1.9+drift+fbm(p*3.1-drift)*.35);',
      ' float bands=fract(e*7.-u_t*.05);',
      ' float line=smoothstep(.5,.485,abs(bands-.5))* (1.-smoothstep(.485,.5,abs(bands-.5)));',
      ' line=smoothstep(.0,.9,1.-abs(bands-.5)*13.);',
      ' float topRight=smoothstep(.15,1.,uv.x)*smoothstep(.05,.95,uv.y);',
      ' float vign=smoothstep(1.25,.35,distance(uv,vec2(.72,.78)));',
      ' float a=line*(.05+.13*topRight)*vign;',
      ' float glow=smoothstep(.55,.0,distance(uv,vec2(.82+.03*sin(u_t*.1),.86)))*.05;',
      ' vec3 lime=vec3(.843,.910,.392);',
      ' gl_FragColor=vec4(lime,a+glow);',
      '}'
    ].join('\n');

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
      return s;
    }
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uT = gl.getUniformLocation(prog, 'u_t');
    const uM = gl.getUniformLocation(prog, 'u_m');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5;
    hero.addEventListener('pointermove', function (e) {
      const r = hero.getBoundingClientRect();
      tmx = (e.clientX - r.left) / r.width;
      tmy = 1 - (e.clientY - r.top) / r.height;
    }, { passive: true });

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = hero.clientWidth, hgt = hero.clientHeight;
      if (canvas.width !== (w * dpr | 0) || canvas.height !== (hgt * dpr | 0)) {
        canvas.width = w * dpr | 0;
        canvas.height = hgt * dpr | 0;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    let running = false, raf = 0, started = false;
    const t0 = performance.now();
    function frame(now) {
      if (!running) return;
      mx += (tmx - mx) * 0.04;
      my += (tmy - my) * 0.04;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.uniform2f(uM, mx, my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!started) { started = true; canvas.classList.add('on'); }
      raf = requestAnimationFrame(frame);
    }
    function play() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
    function stop() { running = false; cancelAnimationFrame(raf); }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { en.isIntersecting ? play() : stop(); });
      }, { rootMargin: '80px 0px' }).observe(hero);
    } else {
      play();
    }
    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : play();
    });
  }

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
     Thesis underline: the closing line of the POV statement
     gets a drawn underline when the block scrolls into view.
  ---------------------------------------------------------- */
  function markPovClose() {
    const pov = document.querySelector('.about-pov');
    if (!pov) return;
    pov.innerHTML = pov.innerHTML.replace(
      'That gap is where I live.',
      '<span class="pov-mark">That gap is where I live.</span>'
    );
  }

  /* ----------------------------------------------------------
     3D tilt on index cards. Pointer-tracked perspective with a
     glare sheen. Fine pointers only; never on touch.
  ---------------------------------------------------------- */
  function initTilt() {
    if (reduceMotion) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    document.querySelectorAll('.index-card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--rx', ((0.5 - py) * 7).toFixed(2) + 'deg');
        card.style.setProperty('--ry', ((px - 0.5) * 9).toFixed(2) + 'deg');
        card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ----------------------------------------------------------
     Magnetic pull on primary CTAs. Small, spring-back, fine
     pointers only.
  ---------------------------------------------------------- */
  function initMagnetic() {
    if (reduceMotion) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    document.querySelectorAll('.btn-primary, .header-cta').forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        btn.style.setProperty('--mx', (dx * 4).toFixed(1) + 'px');
        btn.style.setProperty('--my', (dy * 3).toFixed(1) + 'px');
      });
      btn.addEventListener('pointerleave', function () {
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    });
  }

  /* ----------------------------------------------------------
     Cursor light: a faint solar glow that follows the pointer.
     Desktop only, blend-mode screen, imperceptibly low alpha.
  ---------------------------------------------------------- */
  function initCursorGlow() {
    if (reduceMotion) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);
    let gx = -600, gy = -600, tx = gx, ty = gy, live = false;
    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!live) { live = true; requestAnimationFrame(step); }
    }, { passive: true });
    function step() {
      gx += (tx - gx) * 0.12;
      gy += (ty - gy) * 0.12;
      glow.style.transform = 'translate3d(' + (gx - 240) + 'px,' + (gy - 240) + 'px,0)';
      if (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5) {
        requestAnimationFrame(step);
      } else {
        live = false;
      }
    }
  }

  /* ----------------------------------------------------------
     Scrollspy: mark the nav link for the section in view.
  ---------------------------------------------------------- */
  function initScrollSpy() {
    const map = [
      ['about', 'a[href="#about"]'],
      ['work', 'a[href="#work"]'],
      ['credentials', 'a[href="#credentials"]']
    ];
    if (!('IntersectionObserver' in window)) return;
    const links = {};
    map.forEach(function (m) {
      const el = document.getElementById(m[0]);
      const link = document.querySelector('.header-nav ' + m[1]);
      if (el && link) links[m[0]] = link;
    });
    if (!Object.keys(links).length) return;
    const spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        const link = links[en.target.id];
        if (!link) return;
        if (en.isIntersecting) {
          Object.keys(links).forEach(function (k) { links[k].classList.remove('active'); });
          link.classList.add('active');
        } else if (link.classList.contains('active') && !en.isIntersecting) {
          link.classList.remove('active');
        }
      });
    }, { rootMargin: '-35% 0px -55% 0px' });
    Object.keys(links).forEach(function (id) {
      spy.observe(document.getElementById(id));
    });
  }

  /* ----------------------------------------------------------
     Scroll parallax for case artifact images (guide cover,
     field photo). Transform-only, shared rAF, gentle.
  ---------------------------------------------------------- */
  function initParallax() {
    if (reduceMotion) return;
    const targets = Array.prototype.slice.call(
      document.querySelectorAll('.case-hero-image img')
    );
    if (!targets.length) return;
    let ticking = false;
    function apply() {
      const vh = window.innerHeight;
      targets.forEach(function (img) {
        const r = img.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) return;
        const progress = (r.top + r.height / 2 - vh / 2) / vh;
        img.style.transform = 'translateY(' + (progress * -26).toFixed(1) + 'px)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }, { passive: true });
    apply();
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
      // Ignition wave: dots light up radially from the first panel,
      // like a plant coming online row by row.
      const delay = Math.hypot(col, row * 2) * 32;
      html += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r}" fill="${fill}" style="transition-delay:${delay.toFixed(0)}ms"/>`;
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
    initHeroField();
    splitHeroTitle();
    styleIndexHeading();
    markPovClose();
    buildDotGrid();
    bindLazyVideos();
    prepareReveals();
    bindObservers();
    bindHeaderAndProgress();
    initTilt();
    initMagnetic();
    initCursorGlow();
    initScrollSpy();
    initParallax();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
