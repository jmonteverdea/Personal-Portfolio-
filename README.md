# Jorge [Last Name] — Personal Portfolio

Single-page portfolio website for a clean energy professional. No build step, no dependencies beyond Google Fonts.

---

## Preview locally

Just open `index.html` in any browser:

```
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

Or right-click `index.html` → Open With → your browser.

---

## Deploy to Netlify (easiest)

1. Go to [netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire **Porfolio** folder onto the drop zone
3. Done — Netlify gives you a live URL instantly
4. Optional: connect a custom domain in Site Settings → Domain Management

---

## Deploy to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. From the project folder: `vercel`
3. Follow the prompts (framework: Other, root: ./)
4. Or push to GitHub and connect the repo at [vercel.com/new](https://vercel.com/new)

---

## TODO checklist — swap placeholder content

All placeholders are marked with `<!-- TODO: ... -->` comments in `index.html`.
Find them with Cmd+F (Mac) or Ctrl+F (Windows) searching for `TODO`.

| # | What to change | Where |
|---|----------------|-------|
| 1 | Your last name | `index.html` — H1 and footer; also `<title>` and OG tags |
| 2 | Real headshot | Drop `headshot.jpg` in `/assets/` (see `/assets/README.md`) |
| 3 | Resume PDF link | `index.html` — "View resume" button: change `href="#"` to `href="/assets/resume.pdf"` |
| 4 | Email address | `index.html` — Contact section `mailto:` link |
| 5 | LinkedIn URL | `index.html` — Contact section LinkedIn link |
| 6 | Deployed URL | `index.html` — `og:url` meta tag |
| 7 | OG image | Add `/assets/og-image.jpg` (1200×630 px) |

---

## File structure

```
Porfolio/
├── index.html       ← all site content (one file)
├── styles.css       ← all styles + design system variables
├── script.js        ← mobile nav toggle + fade-in on scroll
├── assets/
│   ├── README.md    ← instructions for headshot, resume, og-image
│   ├── headshot.jpg ← DROP YOUR HEADSHOT HERE
│   ├── resume.pdf   ← DROP YOUR RESUME HERE
│   └── og-image.jpg ← optional, for social sharing previews
└── README.md        ← this file
```

---

## Design tokens (CSS variables in `styles.css`)

| Variable | Value | Used for |
|----------|-------|----------|
| `--color-primary` | `#1F4D3B` | Forest green — headings, buttons, borders |
| `--color-bg` | `#F4EFE6` | Warm neutral — page background |
| `--color-text` | `#1A1A1A` | Charcoal — body text |
| `--color-accent` | `#C9A66B` | Ochre — pills, icons, hover states |
| `--color-muted` | `#6B6B6B` | Subheads, secondary text |

To change the color scheme, update these variables at the top of `styles.css` — they cascade everywhere automatically.
