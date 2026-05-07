# /assets — Static files

Drop your files here before deploying.

## headshot.jpg
- Your professional headshot photo
- Recommended size: **400×400 px minimum**, square crop
- File name must be exactly `headshot.jpg` (lowercase)
- The site already references it at `/assets/headshot.jpg`
- A placeholder is shown automatically until this file is added

## resume.pdf
- Your resume as a PDF
- File name must be exactly `resume.pdf` (lowercase)
- Then open `index.html`, find the comment `<!-- TODO: replace href="#" with the path to your resume PDF -->`,
  and change `href="#"` to `href="/assets/resume.pdf"`

## og-image.jpg (optional but recommended)
- Open Graph image shown when you share the site on LinkedIn, X, iMessage, etc.
- Recommended size: **1200×630 px**
- File name: `og-image.jpg`
- Update the `og:image` meta tag in `index.html` once deployed with your real URL
