# Speech Coach

A local, single-user web app for rehearsing work speech in English. You read a script out loud, it shows which words and sounds went wrong, and Claude tells you how to fix them. Built for a Spanish speaker who works in English.

It runs on your machine only. No accounts, no database, no deployment.

## How you use it

1. **Today** plans one guided session: the sounds due for review, an ear drill, then one real script.
2. **Review** a sound in three stages: alone in minimal pairs, mixed with other sounds, then in sentences from your own scripts. Each stage is listen, speak, compare.
3. **Ear training** plays one word of a minimal pair in different voices and you pick which it was.
4. **Practise** a script on the teleprompter. The contour field under it moves with your voice.
5. **Results** shows the score, the script as heard, and the one thing to fix next. Retry any word or weak sentence in place and see before and after.
6. **Progress** is the Sound Map: every sound you have practised, with a ring for each mastery stage.

Keys: Space record and stop, M model, P mine, C model then mine, R retry, N or Enter next.

The design system, the learning rules and how each screen applies them are in [DESIGN.md](DESIGN.md). Screenshots of every screen are in `design-review/`.

## Setup

1. `cd speech-coach && npm install`
2. `cp .env.local.example .env.local`
3. Fill in the keys you have in `.env.local` (all optional, see Modes).
4. `npm run dev`
5. Open http://localhost:3000 in Chrome or Edge.

Restart `npm run dev` after changing `.env.local`.

| Variable | What it is |
| --- | --- |
| `AZURE_SPEECH_KEY` | Key for an Azure Speech resource. Turns on phoneme scoring. |
| `AZURE_SPEECH_REGION` | That resource's region in short form, for example `eastus`. |
| `ANTHROPIC_API_KEY` | Optional. Swaps the free built-in coach for coaching written by Claude, and turns on AI scenario and drill generation. |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-5-5`. |

### Where to get an Azure Speech key

1. Sign in at https://portal.azure.com and choose **Create a resource**.
2. Search for **Speech**, create a Speech resource. The free F0 tier is enough for personal practice.
3. Open the resource, go to **Keys and Endpoint**, copy **KEY 1** and the **Location/Region**.

Prosody scoring only exists for `en-US`, which is the locale this app uses.

## Modes

The mode is detected from `.env.local` and shown as a badge in the header.

| Mode | When | What you get |
| --- | --- | --- |
| **Full** | Azure key and region set | Accuracy, fluency, completeness and prosody scores, per-phoneme IPA scores, word timestamps, pacing, long pauses, word replay, Azure reference voice. Coaching comes from Claude if the Anthropic key is set, and from the free built-in coach if not (badge reads "Full · built-in coach"). |
| **Transcript-only** | No Azure key | Your browser's speech recognition gives a transcript. You get the same skipped/added word comparison and an estimated pace. No scores are shown, because none were measured. |
| **Demo** | With no takes yet, via **Explore with sample data** on Today | Four sample takes, sample coaching and a full guided session with simulated takes, so every screen works with zero keys and no microphone. Demo data is labeled and can be removed from Today or Progress. |

### Running it for free

The Anthropic key is optional. Without it the app uses a **built-in coach**: fixed rules that turn your scores into top priorities, a physical instruction and minimal pair for each weak sound, and pacing and intonation notes on specific sentences. It runs in your browser, sends nothing anywhere and costs nothing. It does not suggest rewordings.

Also free without the Anthropic key: a **scenario library** of 12 ready work scripts you can search and edit, and **drills** from a built-in set or built from the words you missed.

Azure Speech has a free F0 tier (5 audio hours a month at the time of writing), so Azure scoring plus the built-in coach is a zero-cost setup.

## Privacy: what leaves your machine

- **Azure Speech** (Full mode): your microphone audio and the script text are streamed to Microsoft for scoring. Reference pronunciations send the single word to Azure text-to-speech.
- **Anthropic** (when the key is set): the script text, a compact summary of your scores and miscues, and your scenario prompts are sent to Anthropic. Audio is never sent to Anthropic.
- **Your browser vendor** (Transcript-only mode): the Web Speech API in Chrome sends audio to Google.
- **Stays local**: API keys (server side only, never sent to the browser), your scripts and history (browser `localStorage`), and the replay copy of your recording (browser memory, gone on reload).

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Start the app |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build |
| `npm run fixture` | Regenerate the Azure-shaped test and demo fixture |

## How it is put together

```
src/app/api/speech-token   AZURE_SPEECH_KEY -> short-lived token. The only place the Azure key is read.
src/app/api/coach          The only place Anthropic is called (coaching, scenarios, drills).
src/lib/azure/normalize.ts Azure raw JSON -> AssessmentResult. The only file that knows Azure field names.
src/lib/diff.ts            Word alignment: correct, mispronounced, omission, insertion.
src/lib/scoring.ts         Aggregate scores across segments.
src/lib/pacing.ts          Words per minute and long pauses.
src/lib/history.ts         Session summaries, weak-sound ranking, export and import.
src/lib/coach/             Request summary, prompts, response schema and validation, built-in coach.
src/lib/scenarios.ts       Built-in scenario library.
src/lib/speech/            Browser side: Azure session, Web Speech session, TTS, replay.
src/lib/learning/          Spaced review, mastery, priorities, bests, ear training, session plan, drill content.
src/components/voice/      The voice field: GLSL shader, Canvas 2D fallback, level meter.
src/components/ds/         Design-system primitives and the app shell.
src/lib/fixtures/          Azure-shaped fixture, demo result and demo coaching.
```

## Decisions

Choices made without asking, so you can overrule them.

**Where it lives.** The app is in `speech-coach/` so it does not touch the portfolio site at the repo root.

**Audio pipeline.** The installed SDK (1.53.0) types show `AudioConfig.fromStreamInput` accepts a browser `MediaStream`, so one `getUserMedia` stream feeds the Azure recognizer, the waveform analyser and a `MediaRecorder`. The SDK converts the stream to PCM itself. WebM/Opus from `MediaRecorder` is only used for local replay.

**Prosody is a setter, not a method.** The Azure docs show `enableProsodyAssessment()`. In the JavaScript SDK types it is a property setter, so the code uses `config.enableProsodyAssessment = true`.

**Pronunciation config.** HundredMark, Phoneme granularity, IPA, prosody on, detailed output, word-level timestamps, `nbestPhonemeCount = 5` (that is what gives "heard as /b/"), `enableMiscue` off.

**Miscues.** Computed locally with a global word alignment against the script, ignoring case and punctuation. A recognized word that is at least 50% similar to the script word at that position counts as one mispronounced word ("shipped" heard as "sheeped"). Anything less similar counts as a skipped word plus an added word.

**Aggregate scores across segments.**
- Accuracy: mean word accuracy over the script words you said. Added words do not count. Skipped words do not count either, because completeness already penalizes them.
- Fluency and prosody: Azure only reports these per segment, so they are weighted by segment duration.
- Completeness: script words said divided by script words. Azure's per-segment completeness is ignored, since each segment only covers part of the script.
- Overall: Azure's published formula on the aggregates. Lowest score weighted 0.4 and the rest 0.2 each, or 0.6 / 0.2 / 0.2 when there is no prosody score.

**Word colors.** 80 and up green, 60 to 79 amber, under 60 red. Azure's own cutoff for "mispronounced" is 60.

**Pacing.** Words per minute is words said divided by the time from the first word's start to the last word's end. A long pause is a gap of 0.7 seconds or more between words, labeled mid-sentence or between sentences. In Transcript-only mode there are no timestamps, so pace is an estimate from total recording time and pauses are not reported.

**Token handling.** The server caches the Azure token for 9 minutes. The browser swaps a fresh token into the running recognizer at the 9-minute mark, one minute before Azure expires it. If Azure still rejects the token, the take stops with a clear message and whatever was captured is kept.

**Coaching is on request when it costs money.** With an Anthropic key you press **Get coaching**, so you do not pay for a Claude call on every throwaway take. Without a key the built-in coach shows immediately.

**Built-in coach.** Deterministic rules over the same compact summary Claude gets, in `src/lib/coach/local.ts`. It covers about 40 English sounds with instructions written for a Spanish speaker. At most two of the three priorities are sounds, so a pacing or accuracy problem can take the third.

**Coach response validation.** The request uses structured outputs with a JSON schema, and the reply is then validated again with Zod (1 to 3 priorities, every sound fix has example words, an instruction, a minimal pair and a drill). One retry with the validation error, then a visible error. No server-side model fallback is configured: if Claude declines, you see an error.

**Coach payload.** Claude gets the sentences, scores, the 10 lowest words with expected vs heard phonemes, the 8 weakest sounds, miscues, pauses with their neighboring words, monotone sentences and up to 8 recurring weak sounds from earlier sessions. Under 6 KB for the sample take (a unit test enforces it).

**One Anthropic route.** Scenario and drill generation also go through `/api/coach` (a `task` field), so Anthropic is called from exactly one file.

**History storage.** Every session's scores, date, script id and per-phoneme stats are kept in `localStorage`. Full word-by-word results are kept for the 8 most recent takes only, to stay well under the browser's storage limit. Audio is never persisted.

**Weak sounds.** Ranked by occurrence-weighted average accuracy across sessions. Sounds heard fewer than 3 times are left out. Demo sessions are excluded as soon as you have one real session.

**Starter scripts.** Three sample scripts are added on first run so the library is not empty. Delete them freely.

**Reference voice.** `en-US-JennyNeural` in Full mode. If Azure TTS fails, the browser voice plays instead and the UI says which one you heard.

**Learning layer.** Review schedule, mastery stage and priorities are derived from the session history plus drill takes every time they are shown. Only raw events are stored (drill takes, retries, ear results, weekly target), under one new key, `speech-coach.learning.v1`. The existing keys and their shapes are unchanged.

**Drill takes stay out of the score trend.** They are stored separately so the trend chart keeps meaning "real script takes".

**Retries do not count toward mastery.** Saying a word right ten seconds after hearing it is not evidence that it holds.

**Demo takes are simulated.** With sample data and no Azure key, drills, the retry and the script step use generated results marked "demo", so the whole flow can be walked without a microphone.

## Known limits

- **Digits.** Azure hears "15" as "fifteen", which shows up as one skipped and one added word. Write numbers as words. The script editor warns you.
- **Word replay alignment.** Azure's clock and the local recorder start a few milliseconds apart. Replay pads each word by 140 ms on both sides to cover that.
- **Chrome or Edge.** Transcript-only mode needs the Web Speech API, which Firefox does not have.
- **Not verified live.** Nothing that needs a real microphone, a real Azure key or a real Anthropic key could be exercised when this was built. See below.

## Manual test checklist

Everything else is covered by unit tests and a headless browser run. These need a human, a microphone and real keys.

**Full mode (Azure and Anthropic keys set)**

1. The header badge reads **Full**.
2. Press **Record** on a script. The browser asks for the microphone once. Allow it.
3. The red **Recording** indicator shows, the timer counts, and the waveform moves when you speak.
4. The teleprompter highlights the word you are on and scrolls to keep it in view.
5. Read a script longer than 30 seconds. After **Stop**, the results page shows scores for the whole script, and the source pill says more than one segment.
6. Scores are on a 0 to 100 scale. Phonemes are IPA symbols (for example /θ/), not SAPI codes (for example `th`).
7. The Prosody score has a number, not "not measured".
8. Skip a sentence on purpose and repeat a word on purpose. The skipped words show struck through, the repeat shows as "+ added".
9. Click a word. **Hear reference** plays an Azure voice and the note says so. **Replay my word** plays that word from your own recording, not its neighbor. If it is consistently early or late, adjust `PAD_MS` in `src/lib/speech/playback.ts`.
10. The **Your take** player replays the full recording.
11. Words per minute looks right against a stopwatch, and a pause you held for a full second is listed.
12. Press **Get coaching**. Within about 30 seconds you get priorities, sound fixes, and notes that name words and sentences from your script.
13. Record for more than 10 minutes without stopping. Recognition must keep working past the 9-minute token swap.
14. **Generate scenario** with "push back on a deadline with a VP" returns a script you can edit and save.
15. On Progress, select a sound on the map. Its page opens, and **Review now** starts its drill.

**Failure paths**

16. Block the microphone in the browser's site settings, press **Record**. You get "Microphone blocked" with instructions.
17. Record 5 seconds of silence and stop. You get "No speech detected".
18. Turn Wi-Fi off mid-recording. You get a network error, and a link to what was captured before it dropped.
19. Put a wrong value in `AZURE_SPEECH_KEY`, restart, press **Record**. You get a message that Azure rejected the key.
20. Put a wrong value in `ANTHROPIC_API_KEY`, restart, press **Get coaching**. You get a message that Anthropic rejected the key, and the scores stay on screen.

**Learning flow (Full mode)**

25. On Today, press Enter. The session opens on the first sound due for review.
26. In a drill, the record button stays disabled until the model has played. After a take, M, P and C play the model, your audio, and both in turn for the selected word.
27. The voice field under the script is still before recording, moves when you speak and settles when you stop. It should not stutter while the teleprompter highlight moves.
28. Ear training plays each word in a different Azure voice. Press 1 or 2 to answer.
29. On Results, press R. The weakest word opens for retry. After the retry, before and after appear side by side, and "Mine" plays the retry.
30. After a session, the Sound Map shows the reviewed sounds with their new stage, and they are no longer marked due.
31. Turn on "reduce motion" in your system settings and reload. The reveal, ring drawing and page transitions are gone, and the voice field is a still frame with a level bar.

**Other modes**

21. Remove the Azure key and restart. Badge reads **Transcript-only**, a take produces a transcript and word comparison, and no scores appear anywhere. Ear training says it is using browser voices.
22. Remove the Anthropic key and restart. The coaching panel shows the built-in coach right away, labeled "free, no AI". "Generate scenario" becomes "Scenario library".
23. Reload a results page. Scores are still there, and the audio player explains that the recording was not kept.
24. On Progress, **Export JSON**, then **Clear history**, then **Import JSON**. Your takes and your drill history come back. An export made before the redesign still imports.
