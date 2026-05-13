# Changelog

## 2026-05-13. Full rebuild from `portfolio-redesign/` spec.

### Replaced
- Old hero (Source Serif 4 / Playfair name, generic capabilities, project cards) replaced with typography-first hero on deep forest #0F1E1A with 4 animated stat tiles.
- Old project card grid replaced with 5 long-form case studies: Granted, Bright, Solar, CEDES, TRCA. Each opens with a big-number callout, then Challenge / Approach / Role / Outcome, ending in a 3 to 5 item stat strip.
- Color system swapped from warm cream + forest green to deep forest background, warm cream text, citrus-lime accent.
- All headline serif typography swapped for Inter, weights 400 through 900. Tabular figures on numerals.
- Bio rewritten from the new `content/bio.md` (188 words).
- Credentials section restructured into Certifications, Education, Languages with download CTAs for CV and CEM certificate.

### Added
- 200-dot SVG grid in the Solar case study, one dot per project, 150 in lime for the residential cohort, 50 in muted for the rest. Fades in on scroll, respects reduced motion.
- 3-step promotion timeline in the Bright Inc. case study (Advisor → Regional Manager → Partner Manager).
- "7 → 3" funnel treatment for the TRCA case study big number.
- CEDES guide block with typographic SVG cover, 30 MB PDF linked out (loads only on click).
- Schema.org Person JSON-LD for richer search snippets.
- Skip-to-content link.
- Sticky header with Email CTA. Collapses to logo + Email at small viewports.
- Favicon set generated from `favicon-source-face.png` at 32 / 180 / 192 / 512.
- CV and CEM certificate now downloadable from the Credentials section.

### Performance
- Headshot resized from 2000x2000 (2.5 MB) to 1000x1000 (200 KB).
- Hero headshot only loads via the About section, marked `loading="lazy"`.
- CEDES PDF (30 MB) is never embedded. Only downloads on user click.
- JS is deferred. No frameworks. No build step.
- Single CSS file, organized by tokens → reset → typography → components → sections → motion.

### Accessibility
- All images have alt text. Headshot: "Jorge Monteverde, headshot".
- Visible focus ring on all interactive elements.
- Semantic landmarks: header, main, section, article, footer.
- Color contrast: cream on deep forest passes WCAG AA at all body sizes. Lime is reserved for large display numerals and the primary CTA where the background is dark.
- Reduced-motion users get static content with no fade-in or count-up.
- Skip link.

### SEO
- Title: "Jorge Monteverde — Capacity Development for Municipal Energy Programs"
- Meta description pulled from the bio's opening line
- Open Graph + Twitter card meta with `og-image.png`
- Schema.org Person markup

### Removed
- `Source Serif 4` and `Playfair Display` Google Font imports.
- Old impact bar, capabilities grid, project image placeholder pattern.
- "JL" placeholder initials and headshot dashed-border placeholder.
- ECO Canada callout in the hero. Moved into the Credentials list as one line.

### Tone
- Audited for em dashes against `ABOUT ME/anti-ai-writing-style.md`. Replaced with periods or commas throughout.

### Lighthouse mobile target (run by hand after deploy)
- Performance: target 90+
- Accessibility: target 95+
- Best Practices: target 95+
- SEO: target 95+

To verify, deploy and run `npx lighthouse https://<deployed-url> --preset=mobile --view`.
