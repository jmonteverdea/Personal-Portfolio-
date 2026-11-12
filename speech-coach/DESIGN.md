# Design

Speech Coach is a tool for one professional learning to be understood. The design has two jobs at once: look like nothing else, and make every screen teach. Where those two pull apart, teaching wins.

## Three directions considered

**A. Atlas of a Voice.** The voice as terrain. Every surface borrows from survey maps and phonetics charts: hairline rules, corner ticks, plate numbers, contour lines. Mastery is elevation, so a sound you own stands up like a peak. Type is an old-style serif with real character (Fraunces) for display and the teleprompter, a quiet grotesque (Instrument Sans) for text, a face drawn for phonetics (Gentium Book Plus) for every IPA symbol, and a mono (DM Mono) for coordinates and labels. Color is warm paper and ink, with vermilion for my voice and cobalt for the model voice. Study happens on paper. Speaking happens on a dark stage. Motion is surveying: lines draw, numbers count, then everything holds still.

**B. Phosphor.** The voice as a signal on a lab instrument. Near-black screens, a single phosphor green, monospaced type throughout, oscilloscope traces and spectrograms as the main graphics. Motion is scanning and persistence trails. Strong, but it is the first idea anyone has for audio software, it makes long reading tiring, and it treats me as a signal to be measured, not a person learning.

**C. Resonance.** The voice as color. Large soft gradient fields that shift with vowel formants, oversized grotesque type, generous blur and glow. Motion is slow drifting color. Beautiful in a hero shot, but it gives accuracy colors nothing to stand against, it competes with the script on the practice screen, and decoration that moves while I read feedback breaks the quiet rule.

**Chosen: A, Atlas of a Voice.** It is the only one where the look and the lesson are the same thing: the Sound Map is both the signature visual and the navigation into drills, and contour rings carry mastery without relying on color. It also gives the two modes of the app, studying and speaking, two honest surfaces.

## Tokens

All color is CSS variables in `src/app/globals.css`. Components use only the semantic names, so they work on both surfaces. The stage theme is switched by `data-theme="stage"` on the shell for `/practice`, `/session` and `/ear`.

| Token | Paper | Stage | Use |
| --- | --- | --- | --- |
| `--bg` | `#f2ede2` | `#111215` | Page |
| `--surface` | `#e9e2d3` | `#1a1c20` | Raised areas, selected rows |
| `--fg` | `#15171a` | `#f2ede2` | Text, rules that matter |
| `--fg-2` | `#45474a` | `#c4c0b5` | Secondary text |
| `--fg-3` | `#67665f` | `#99968d` | Labels, captions |
| `--rule` / `--rule-strong` | `#cfc6b2` / `#a99f89` | `#2c2e33` / `#4a4c52` | Hairlines |
| `--signal` | `#b8331c` | `#ff6a47` | My voice, what is due, the next action |
| `--model` | `#23479a` | `#9db8ff` | The model voice, added words, focus ring |
| `--good` | `#1c6b57` | `#63d2b0` | 80 and up |
| `--fair` | `#8a5b00` | `#e8b755` | 60 to 79 |
| `--poor` | same as signal | same as signal | Under 60 |

Text colors were chosen to clear WCAG AA (4.5:1) on their surface. Vermilion on paper is the tightest at about 5:1.

**Detail tokens.** Paper grain (an SVG noise overlay at 5.5% opacity), atlas corner ticks (`.ticks`), plate captions, and one easing curve, `cubic-bezier(0.16, 1, 0.3, 1)`.

## Type

Loaded through `next/font/google` in `src/app/layout.tsx`. All four are open source.

| Role | Face | Where |
| --- | --- | --- |
| Display | Fraunces (variable: optical size, softness, wonk) | Headlines, numerals, the teleprompter |
| Text | Instrument Sans | Body, buttons |
| Phonetic | Gentium Book Plus | Every IPA symbol |
| Label | DM Mono | Captions, coordinates, table figures, key hints |

| Step | Size | Class |
| --- | --- | --- |
| Display L | `clamp(3rem, 1.2rem + 7vw, 7.5rem)` | `text-(length:--text-display-l)` |
| Display M | `clamp(2.25rem, 1.3rem + 3.6vw, 4.5rem)` | `--text-display-m` |
| Display S | `clamp(1.75rem, 1.2rem + 1.9vw, 2.75rem)` | `--text-display-s` |
| Teleprompter | `clamp(1.75rem, 1rem + 2.9vw, 3.75rem)`, line height 1.42 | `.prompter` |
| Body | 1rem and 0.9375rem, line height 1.6 | |
| Label | 0.6875rem, uppercase, 0.14em tracking | `.label` |

The teleprompter is the typographic hero: Fraunces at up to 60px, set to about 30 characters a line, readable from a metre. IPA inside a label is exempt from uppercasing, because an uppercase theta is a different letter.

## Motion principles

1. **Motion marks a transition or a result. Nothing else moves.** No loops, no ambient animation on reading screens.
2. **Quiet when I am thinking.** While I read feedback, listen to a model or speak, the only thing that moves is the voice field, which is feedback on my own signal, sits under the script and never behind it, and fades out at the sides where the controls are.
3. **Once.** The results reveal plays the first time a take is opened. A revisit shows the finished page.
4. **Skippable.** A click or Escape finishes the reveal at once.
5. **Tactile, not bouncy.** Buttons press 1px. Hover changes color, not size.

| Tool | Used for | Why it earns its place |
| --- | --- | --- |
| GSAP | Results reveal timeline, Sound Map entrance | Sequenced, scrubbable choreography with one `context` to revert |
| Motion | Step changes inside the drill | Enter and exit of swapped content |
| Lenis | Smooth scroll on Results and Progress only | Long reading pages. Off on touch, on speaking surfaces and with reduced motion. Loaded on demand |
| OGL | The voice field | A 30 KB WebGL layer instead of three.js. Loaded on demand, only on speaking surfaces |

Page transitions and staggered entrances are plain CSS (`.page-in`, `.rise`), so server and browser render the same markup.

## The three signature moments

**1. Practice: the voice field.** A fragment shader written for this app (`src/components/voice/shader.ts`). It draws contour lines of a slow noise terrain. The microphone raises a hill at the centre: loudness is its height, low frequencies widen it, mid frequencies make it tremble, high frequencies (consonants) send fine ripples outward. Lines on the hill turn vermilion. Silence lets it settle to flat ground. Levels come from an `AnalyserNode` on the microphone stream (`levels.ts`), with a fast attack and slow release so it moves like breath.

**2. Results: the reveal.** One GSAP timeline. The overall score counts up, the four sub-scores follow, the script paints in word by word at reading speed with its accuracy styles, a rule draws across, and the one thing to fix next rises into place.

**3. Progress: the Sound Map.** Every English sound on one chart, placed where it is made: consonants by place and manner, vowels on the tongue-position trapezoid. Each mastery stage adds a contour ring. Sounds due for review are drawn in vermilion with a dot. Every point links to its drill. On entry the rings draw outward.

## Fallback strategy

| Condition | What renders |
| --- | --- |
| WebGL 2 available, capable device | The shader, device pixel ratio capped at 1.5 |
| Shader averages over 24 ms a frame over its first 30 frames | Renders at 55% resolution. If still slow, switches to Canvas 2D |
| No WebGL 2, or 2 or fewer cores, or 2 GB or less memory | Contour rings in Canvas 2D (`contour2d.ts`), same language. Force it with `?voice=canvas` |
| `prefers-reduced-motion` | One still contour frame plus a plain level bar so I can still see the microphone hears me. No reveal, no ring drawing, no page transition, no smooth scroll |
| Tab hidden | Rendering pauses |
| Not recording | A single still frame. The field only animates during a take |

## Accessibility

- Accuracy never relies on color: good is plain, fair has a dotted underline, poor a heavy solid underline, skipped is struck through, added is italic with a plus sign.
- Mastery never relies on color: count the rings, or read the stage name beside them.
- Right and wrong in ear training are stated in words with a mark.
- Every control has a visible focus ring. There is a skip link.
- The whole core loop runs from the keyboard (below).
- Layout holds from 390px to 1920px. Wide charts scroll inside their own frame, never the page.

| Key | Action |
| --- | --- |
| Space | Record, stop |
| M | Play the model |
| P | Play mine |
| C | A then B: model, then mine |
| R | Retry |
| N or Enter | Next |
| ← → | Choose a word in a drill |
| 1, 2 | Answer in ear training |
| Esc | Close a panel, finish the reveal |
| E | Ear training, from a sound page |

## Learning rules and where each screen applies them

| Rule | How it is built |
| --- | --- |
| **1. One focus at a time** | **Today** shows one guided session, said as a sentence, with one button. **Results** shows the overall score, the script and one next action. Coaching, pacing and the recording are one click deeper and closed by default. On a phone the sub-scores move below the next action. |
| **2. Listen, then speak, then compare** | In every drill stage and every retry the record button is disabled until the model has played. After a take, M, P and C play the model, my audio, or both back to back for the selected word. |
| **3. Fix it now** | In **Results**, every word opens a detail with a retry button, and every weak sentence carries a retry chip. The retry happens in place and ends with before and after side by side. |
| **4. Spaced review** | `schedule.ts`: a sound joins the schedule when it first scores under 80. Good reviews stretch the gap 1, 3, 7, 14 days. A score under 60 shrinks it one step. Good reviews on the same day count once. **Today** lists what is due and builds the session from it. |
| **5. Narrow, then mixed** | `DrillRunner`: stage I minimal pairs, stage II the sound mixed with others, stage III sentences pulled from my own scripts. |
| **6. Ear training** | `EarTrainer`: eight rounds of a minimal pair in rotating voices, answer with 1 or 2, instant feedback. Four Azure neural voices in Full mode. Browser voices otherwise, and the screen says which. |
| **7. Priorities by impact** | `priority.ts` ranks weak sounds by how many sessions and scripts they recur in. The session and the Results next action both use that order, so a sound weak in four takes beats a lower one-off score. |
| **8. Feedback tone** | "What improved" is listed before the next action. Changes under 4 points are treated as noise and not shown. A dip is shown in neutral grey, never red. Verdicts are "held", "close", "not yet". |
| **9. Quiet when I am thinking** | See motion principles 1 to 3. |

## Mastery, bests and rhythm

**Four stages per sound** (`mastery.ts`), drawn as rings:

| Stage | Earned by |
| --- | --- |
| Finding | Heard at least once |
| Shaping | 60 or more on two takes in a row, or 80 once |
| Holding | 80 or more on two separate days |
| Owned | 80 or more in real sentences (a script take or drill stage III) on two separate days |

A score under 60 drops a sound one stage from wherever it stood. Drills alone can never reach Owned.

**Personal bests** (`bests.ts`): a delta against the last take of the same script and a "personal best" mark, shown as small type under the score. Per sound, the latest average against the previous one.

**Weekly rhythm** (`rhythm.ts`): the days practised this week against a target I set. Past days without practice are drawn the same as future days. Nothing is counted as lost.

Not built, on purpose: points, XP, coins, badges, leaderboards, mascots, confetti, sound effects, streak counters or warnings.

## Screens

| Route | Surface | Purpose |
| --- | --- | --- |
| `/` | Paper | Today: the one guided session, weekly rhythm, what is due |
| `/session` | Stage | The session runner: review, ear training, script take, summary |
| `/session/review?p=` | Stage | One sound's three-stage drill, opened from the map |
| `/ear?p=` | Stage | Ear training for one sound |
| `/practice?script=` | Stage | Teleprompter and voice field |
| `/results?session=` | Paper | Reveal, next action, inline retry, detail |
| `/progress` | Paper | Sound Map, what moved, score trend, takes, export and import |
| `/sound?p=` | Paper | One sound: stage, what moves it up, schedule, history |
| `/scripts` | Paper | The script library |

## Data

Nothing existing changed shape. The learning layer stores drill takes, retries, ear-training results, the weekly target and the open session under one new key, `speech-coach.learning.v1`. Schedule, mastery and priorities are derived on the fly from the existing session history plus those drill takes, so they can never drift out of sync with it. Export adds an optional `learning` block. Old export files import as before.

## Design review

`design-review/` holds the final captures from a Demo-mode run with no keys:

- `screens/`: every screen and state of the guided session at 1440px and 390px
- `states/`: transcript-only result, microphone blocked, Azure key rejected, network failure, connection timeout, reduced motion, no WebGL
- `frames/`: frame sequences of the three signature moments
