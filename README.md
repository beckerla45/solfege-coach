# Solfège Coach

A browser-based singing coach for **movable-do solfège with la-based minor**. It plays a chord,
asks you to sing a note by its syllable, listens through your microphone, and tells you how you did.

**▶ Try it online: https://beckerla45.github.io/solfege-coach/**

## Run it

Online: open the link above, click **Begin lesson**, and allow microphone access.

Locally: double-click `start.bat` (or run `python serve.py`). It serves the app at http://localhost:8123 and opens
your browser. Opening `index.html` straight from disk won't work, because browsers block the microphone
and ES modules on `file://`. Use Chrome or Edge, and headphones if you have them.

## Exercise 1: Triad Drill

1. The coach plays a triad (all three notes together) in a random key within the chosen chord range.
2. It asks for one chord tone, e.g. **"Sing mi"**.
3. Sing and hold the note for about two seconds. The coach tracks your pitch live and then reports:
   - **in tune**: within the tolerance (default ±25 cents)
   - **close**: right note, but sharp or flat by how many cents
   - **wrong note**: which syllable you actually sang, the interval and direction you were off, and a tip
4. Any octave counts. Progress is saved per syllable in the browser.

## Exercise 2: Sight-Singing Drill — Solfège

1. A major triad (do–mi–sol) sets the key.
2. The coach shows a randomly chosen syllable from the full chromatic set:
   do di ra re ri me mi fa fi se sol si le la li te ti.
3. Sing it. Grading works as in the Triad Drill, and tips explain altered syllables
   (e.g. *"fi is a raised fa — find fa, then nudge up a half step"*).
4. Accuracy is tracked per syllable. Settings can limit the drill to diatonic-only or altered-only syllables.

Switch drills with the picker at the top of the Practice screen.

Settings: chord range (soprano–bass, also on the Practice screen), major (do–mi–sol) or minor (la–do–mi) triad, which chord tones to ask for,
playback style, tolerance, auto-listen, letter names on/off.

## Code layout

| File | Purpose |
| --- | --- |
| `js/theory.js` | Pitch math, syllables (incl. chromatic), la-based minor scales, chords, voice ranges |
| `js/synth.js` | Web Audio keyboard synth with a clean, near-pure tone |
| `js/pitch.js` | Mic input, YIN pitch detection, noise calibration, single-note capture |
| `js/drillCommon.js` | Shared drill logic: chord playback, attempt analysis, grading, feedback framing |
| `js/triadDrill.js` | Drill 1: sing a chord tone of the triad |
| `js/sightDrill.js` | Drill 2: sight-sing any chromatic syllable over a major triad |
| `js/app.js` | UI controller, pitch trace, progress, Learn page |

New drills export `id`, `title`, `makeQuestion(settings, prev)` and `feedback(analysis, q, opts)`
(see `sightDrill.js`), then get registered in `DRILLS` in `app.js`.
