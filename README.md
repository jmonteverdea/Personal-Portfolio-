# Jorge Monteverde — Portfolio

Single-page typography-first portfolio. No frameworks, no build step.
Vanilla HTML, CSS, JS.

## Preview locally

Open `index.html` in any browser.

```
open index.html       # macOS
start index.html      # Windows
xdg-open index.html   # Linux
```

## Deploy

**Netlify.** Drag the folder onto [netlify.com/drop](https://app.netlify.com/drop).

**Vercel.** Push to GitHub and connect at [vercel.com/new](https://vercel.com/new).

**GitHub Pages.** Repo settings → Pages → Source: `main`, root.

## File map

```
/
  index.html            single page, all sections, schema.org Person JSON-LD
  styles.css            design tokens, layout, components, motion
  script.js             dot grid, count-up, fade-in, all reduced-motion aware
  CHANGELOG.md          what changed in this rebuild
  README.md             this file
  assets/
    docs/
      jorge-monteverde-cv-2026.pdf
      cem-certificate.pdf
      cedes-national-energy-guide.pdf     30 MB, never embedded
    images/
      headshot.jpg                         1000x1000, 200 KB
      og-image.png                         1200x630
      favicon-32.png
      favicon-180.png
      favicon-192.png
      favicon-512.png
  portfolio-redesign/   spec folder, not shipped
```

## Design tokens

| Token             | Value     | Use                       |
|-------------------|-----------|---------------------------|
| `--bg`            | `#0F1E1A` | Page background           |
| `--fg`            | `#F5F0E6` | Body and headings         |
| `--accent`        | `#D7E864` | Numbers, primary CTA      |
| `--muted`         | `#AAB4AA` | Secondary text, labels    |
| `--font`          | Inter     | Everything                |

Change the palette by editing `:root` in `styles.css`.

## Updating content

Each section is a clearly commented block in `index.html`. The hero,
bio, case studies, and credentials read top-to-bottom in the file order
they appear on the page.

For copy that needs to match the source spec, see `portfolio-redesign/content/`.
