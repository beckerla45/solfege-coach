// Music theory helpers: pitch math, movable-do syllables, la-based minor, chords, voice ranges.

export const mod = (n, m) => ((n % m) + m) % m;
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

const MAJOR_KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MINOR_KEY_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

export const pitchClassName = (midi, minor = false) =>
  (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[mod(Math.round(midi), 12)];
export const noteName = (midi, minor = false) =>
  pitchClassName(midi, minor) + (Math.floor(Math.round(midi) / 12) - 1);

// Semitones above do for every movable-do syllable (raised and lowered chromatics included).
export const SYLLABLE_SEMIS = {
  do: 0, di: 1, ra: 1, re: 2, ri: 3, me: 3, mi: 4, fa: 5, fi: 6, se: 6,
  sol: 7, si: 8, le: 8, la: 9, li: 10, te: 10, ti: 11,
};
const SHARP_SYLS = ['do', 'di', 're', 'ri', 'mi', 'fa', 'fi', 'sol', 'si', 'la', 'li', 'ti'];
const FLAT_SYLS = ['do', 'ra', 're', 'me', 'mi', 'fa', 'se', 'sol', 'le', 'la', 'te', 'ti'];

/** Name for a pitch `semis` above do, e.g. 4 -> "mi", 3 -> "ri/me". */
export function syllableName(semis) {
  const i = mod(semis, 12);
  return SHARP_SYLS[i] === FLAT_SYLS[i] ? SHARP_SYLS[i] : `${SHARP_SYLS[i]}/${FLAT_SYLS[i]}`;
}

export const MAJOR_SCALE = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
export const MINOR_SCALES = {
  natural: ['la', 'ti', 'do', 're', 'mi', 'fa', 'sol'],
  harmonic: ['la', 'ti', 'do', 're', 'mi', 'fa', 'si'],
  melodic: ['la', 'ti', 'do', 're', 'mi', 'fi', 'si'],
};

export const INTERVAL_NAMES = [
  'unison', 'half step', 'whole step', 'minor third', 'major third', 'perfect fourth', 'tritone',
];

// Triads are stored as syllables in root position. A minor triad is la–do–mi (la-based minor).
export const CHORDS = {
  major: { name: 'Major triad', tones: ['do', 'mi', 'sol'], scale: MAJOR_SCALE, minor: false },
  minor: { name: 'Minor triad', tones: ['la', 'do', 'mi'], scale: MINOR_SCALES.natural, minor: true },
};
export const CHORD_ROLES = ['root', 'third', 'fifth'];

/** Semitone offsets of each chord tone above the chord root, e.g. major -> [0, 4, 7]. */
export function chordOffsets(chord) {
  const root = SYLLABLE_SEMIS[chord.tones[0]];
  return chord.tones.map((t) => mod(SYLLABLE_SEMIS[t] - root, 12));
}

/** Scale path from the chord root up to `target`, e.g. major root->sol: do–re–mi–fa–sol. */
export function scalePath(chord, target) {
  const i = chord.scale.indexOf(target);
  return i < 0 ? [target] : chord.scale.slice(0, i + 1);
}

// Comfortable singing ranges (MIDI). The chord root is chosen so root..root+12 fits inside.
export const VOICES = {
  bass: { label: 'Bass (E2–C4)', low: 40, high: 60 },
  baritone: { label: 'Baritone (G2–E4)', low: 43, high: 64 },
  tenor: { label: 'Tenor (C3–G4)', low: 48, high: 67 },
  alto: { label: 'Alto (F3–C5)', low: 53, high: 72 },
  soprano: { label: 'Soprano (C4–G5)', low: 60, high: 79 },
};
