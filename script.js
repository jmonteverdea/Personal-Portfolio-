/* ============================================================
   script.js — Mobile nav toggle + fade-in on scroll
   No dependencies. Runs after DOM is loaded.
============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     MOBILE NAV TOGGLE
  ---------------------------------------------------------- */
  const toggle = document.querySelector('.nav-toggle');
  const menu   = document.getElementById('mobile-menu');

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      menu.setAttribute('aria-hidden', String(isOpen));
      menu.classList.toggle('is-open', !isOpen);
    });

    // Close menu when a link inside it is clicked
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        toggle.setAttribute('aria-expanded', 'false');
        menu.setAttribute('aria-hidden', 'true');
        menu.classList.remove('is-open');
      });
    });

    // Close menu on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        toggle.setAttribute('aria-expanded', 'false');
        menu.setAttribute('aria-hidden', 'true');
        menu.classList.remove('is-open');
        toggle.focus();
      }
    });
  }


  /* ----------------------------------------------------------
     FADE-IN ON SCROLL
     Skipped entirely if user prefers reduced motion.
  ---------------------------------------------------------- */
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    const fadeEls = document.querySelectorAll('.fade-in');

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target); // animate once
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    fadeEls.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    // Make everything visible immediately — no animation
    document.querySelectorAll('.fade-in').forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

})();
