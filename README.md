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

Settings: chord range (soprano–bass, also on the Practice screen), major (do–mi–sol) or minor (la–do–mi) triad, which chord tones to ask for,
playback style, tolerance, auto-listen, letter names on/off.

## Code layout

| File | Purpose |
| --- | --- |
| `js/theory.js` | Pitch math, syllables (incl. chromatic), la-based minor scales, chords, voice ranges |
| `js/synth.js` | Web Audio piano-like synth |
| `js/pitch.js` | Mic input, YIN pitch detection, noise calibration, single-note capture |
| `js/triadDrill.js` | Exercise logic: question generation, attempt analysis, grading, coach feedback |
| `js/app.js` | UI controller, pitch trace, progress, Learn page |

New drills can follow the `triadDrill.js` pattern: `makeQuestion`, the events to play,
`analyzeAttempt`, and `feedback`.
