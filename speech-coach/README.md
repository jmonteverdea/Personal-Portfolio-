# Speech Coach

A local, single-user web app for rehearsing work speech in English. You read a script out loud, it shows which words and sounds went wrong, and Claude tells you how to fix them. Built for a Spanish speaker who works in English.

It runs on your machine only. No accounts, no database, no deployment.

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
| `ANTHROPIC_API_KEY` | Turns on coaching, scenario generation and generated drills. |
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
| **Full** | Azure key and region set | Accuracy, fluency, completeness and prosody scores, per-phoneme IPA scores, word timestamps, pacing, long pauses, word replay, Azure reference voice. Coaching too if the Anthropic key is set. Without it the badge reads "Full · coaching off". |
| **Transcript-only** | No Azure key | Your browser's speech recognition gives a transcript. You get the same skipped/added word comparison and an estimated pace. No scores are shown, because none were measured. |
| **Demo** | Any time, via **Load sample result** | A sample take, sample coaching and four sample sessions, so every screen works with zero keys. Demo data is labeled and can be removed from the Progress page. |

If the Anthropic key is missing, the coaching panel says so and everything else still works. "Drill this sound" falls back to a built-in set of drills.

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
src/lib/coach/             Request summary, prompts, response schema and validation.
src/lib/speech/            Browser side: Azure session, Web Speech session, TTS, replay.
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

**Coaching is on request.** You press **Get coaching** on a result. It is not automatic, so you do not pay for a Claude call on every throwaway take.

**Coach response validation.** The request uses structured outputs with a JSON schema, and the reply is then validated again with Zod (1 to 3 priorities, every sound fix has example words, an instruction, a minimal pair and a drill). One retry with the validation error, then a visible error. No server-side model fallback is configured: if Claude declines, you see an error.

**Coach payload.** Claude gets the sentences, scores, the 10 lowest words with expected vs heard phonemes, the 8 weakest sounds, miscues, pauses with their neighboring words, monotone sentences and up to 8 recurring weak sounds from earlier sessions. Under 6 KB for the sample take (a unit test enforces it).

**One Anthropic route.** Scenario and drill generation also go through `/api/coach` (a `task` field), so Anthropic is called from exactly one file.

**History storage.** Every session's scores, date, script id and per-phoneme stats are kept in `localStorage`. Full word-by-word results are kept for the 8 most recent takes only, to stay well under the browser's storage limit. Audio is never persisted.

**Weak sounds.** Ranked by occurrence-weighted average accuracy across sessions. Sounds heard fewer than 3 times are left out. Demo sessions are excluded as soon as you have one real session.

**Starter scripts.** Three sample scripts are added on first run so the library is not empty. Delete them freely.

**Reference voice.** `en-US-JennyNeural` in Full mode. If Azure TTS fails, the browser voice plays instead and the UI says which one you heard.

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
15. On Progress, **Drill this sound** creates a drill script and opens it for practice.

**Failure paths**

16. Block the microphone in the browser's site settings, press **Record**. You get "Microphone blocked" with instructions.
17. Record 5 seconds of silence and stop. You get "No speech detected".
18. Turn Wi-Fi off mid-recording. You get a network error, and a link to what was captured before it dropped.
19. Put a wrong value in `AZURE_SPEECH_KEY`, restart, press **Record**. You get a message that Azure rejected the key.
20. Put a wrong value in `ANTHROPIC_API_KEY`, restart, press **Get coaching**. You get a message that Anthropic rejected the key, and the scores stay on screen.

**Other modes**

21. Remove the Azure key and restart. Badge reads **Transcript-only**, a take produces a transcript and word comparison, and no scores appear anywhere.
22. Remove the Anthropic key and restart. The coaching panel says coaching is off. Everything else works.
23. Reload a results page. Scores are still there, and the audio player explains that the recording was not kept.
24. On Progress, **Export JSON**, then **Clear history**, then **Import JSON**. Your sessions come back.
