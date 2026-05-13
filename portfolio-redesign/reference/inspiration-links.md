# Design direction

No reference URLs provided. No photos. No logos. This is a typography-first portfolio.

## Constraints driving the design
- No project photography
- No employer logos
- Headshot, OG image, and favicon source are the only image assets
- All credibility comes from quantified outcomes (numbers, dollars, MW, projects, people trained)

## Direction for Claude Code

### Layout
- Long-form, single-column reading with full-bleed accents
- Generous whitespace, 1.6+ line height on body, max-width around 65ch for prose
- Stat cards and big-number callouts replace project hero images

### Typography
- Sans-serif for everything. Suggested stack: Inter, or system stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`)
- Display weights for numbers. Numerals at 80 to 120 px on desktop, tabular figures
- Body at 18 px, 1.6 line height
- Section labels in small caps with tracking

### Color palette (working direction, locked by OG image)
- Background: deep forest `#0F1E1A` (or near-black `#0E0E0E` as alternate)
- Surface: warm cream `#F5F0E6`
- Accent: citrus-lime `#D7E864` (use sparingly, for numbers and CTAs)
- Muted text: `#AAB4AA`

### Component patterns
- **Hero:** name + title + value prop + 4 stat tiles, no decorative graphic
- **Case study card:** big number on the left, Challenge / Approach / Role / Outcome on the right
- **Employer wordmarks:** text-only, caps tracking, no image dependency
- **CEDES guide:** generate a PDF page-1 thumbnail at build time as a single visual artifact
- **Solar:** consider an SVG data viz: dot grid (200 dots = 200 projects) or growing capacity bar to 3 MW

### Motion (optional, restrained)
- Numbers count up on viewport entry
- Subtle fade-in on scroll, no parallax circus

### Reference shorthand
Closest spiritual analogues without forcing exact imitation:
- Stripe Press / Stripe Atlas content pages: structured, numbers-forward
- Government consultant / think tank report layouts (clean, accountable, scannable)
- Personal portfolios in the typographic-essay tradition (Robin Rendle, Matthew Butterick's Practical Typography)
