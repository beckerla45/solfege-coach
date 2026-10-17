// Exercise 1: the teacher plays a triad, asks for one chord tone by syllable, and grades the sung pitch.
import {
  CHORDS, CHORD_ROLES, INTERVAL_NAMES, SYLLABLE_SEMIS, VOICES,
  chordOffsets, mod, noteName, pitchClassName, scalePath, syllableName,
} from './theory.js';

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Build a question. `prev` is the last question, so we don't repeat the exact same one.
 * settings: { voice, chord: 'major'|'minor', targets: [indices into chord tones], sameKey }
 */
export function makeQuestion(settings, prev) {
  const chord = CHORDS[settings.chord];
  const voice = VOICES[settings.voice];
  const offsets = chordOffsets(chord);
  const targets = settings.targets?.length ? settings.targets : [0, 1, 2];

  let rootMidi, targetIdx, tries = 0;
  do {
    rootMidi = settings.sameKey && prev?.chordKey === settings.chord && prev.voice === settings.voice
      ? prev.rootMidi
      : randInt(voice.low, voice.high - 12);
    targetIdx = pick(targets);
  } while (prev && rootMidi === prev.rootMidi && targetIdx === prev.targetIdx && targets.length > 1 && ++tries < 20);

  const chordMidis = offsets.map((o) => rootMidi + o);
  const doMidi = rootMidi - SYLLABLE_SEMIS[chord.tones[0]];
  const tonicName = pitchClassName(rootMidi, chord.minor);
  return {
    chordKey: settings.chord,
    voice: settings.voice,
    chord,
    rootMidi,
    doMidi,
    chordMidis,
    targetIdx,
    target: chord.tones[targetIdx],
    targetMidi: chordMidis[targetIdx],
    keyLabel: chord.minor
      ? `${tonicName} minor · la = ${tonicName} (do = ${pitchClassName(doMidi)})`
      : `${tonicName} major · do = ${tonicName}`,
  };
}

/** Notes the teacher plays: arpeggio up to the octave, then the block chord. */
export function chordEvents(q, style = 'both') {
  const ev = [];
  let t = 0;
  if (style !== 'block') {
    for (const m of [...q.chordMidis, q.rootMidi + 12]) {
      ev.push({ midi: m, at: t, dur: 0.5, vel: 0.5 });
      t += 0.5;
    }
    t += 0.25;
  }
  if (style !== 'arpeggio') {
    for (const m of q.chordMidis) ev.push({ midi: m, at: t, dur: 1.5, vel: 0.32 });
  }
  return ev;
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/**
 * Turn captured frames into a single sung pitch relative to the target.
 * Octave-agnostic: singing the right syllable in any octave counts.
 */
export function analyzeAttempt(frames, settleMs, q) {
  const v = frames.filter((f) => f.voiced && f.rel >= settleMs).map((f) => f.midi);
  if (v.length < 8) return null;

  // Fold stray octave jumps (a common pitch-tracker error) onto the dominant octave.
  const m0 = median(v);
  const folded = v.map((m) => m - 12 * Math.round((m - m0) / 12));
  const center = median(folded);
  const targetNear = q.targetMidi + 12 * Math.round((center - q.targetMidi) / 12);
  const dev = center - targetNear; // semitones, in [-6, 6]
  const mean = folded.reduce((s, x) => s + x, 0) / folded.length;
  const wobble = Math.sqrt(folded.reduce((s, x) => s + (x - mean) ** 2, 0) / folded.length) * 100;

  return {
    center,
    cents: Math.round(dev * 100),
    semisOff: Math.round(dev),
    sungMidi: Math.round(center),
    sungSemisFromDo: mod(Math.round(center) - q.doMidi, 12),
    targetNear,
    octave: Math.round((targetNear - q.targetMidi) / 12),
    wobble: Math.round(wobble),
    frames: v.length,
  };
}

export function grade(a, toleranceCents) {
  if (Math.abs(a.cents) <= toleranceCents) return 'correct';
  if (a.semisOff === 0) return 'close';
  return 'wrong';
}

const PRAISE = ['Excellent!', 'Spot on!', 'Beautiful!', 'Nailed it!', 'Lovely!'];
const signed = (c) => (c > 0 ? `+${c}¢` : `${c}¢`);

/** The coach's spoken feedback for an attempt. Returns { verdict, headline, details[] }. */
export function feedback(a, q, { toleranceCents, showLetters }) {
  const verdict = grade(a, toleranceCents);
  const T = q.target;
  const letter = (m) => (showLetters ? ` (${noteName(m, q.chord.minor)})` : '');
  const details = [];
  let headline;

  if (verdict === 'correct') {
    headline = `${pick(PRAISE)} That's ${T}${letter(a.targetNear)}, ${signed(a.cents)} — in tune.`;
  } else if (verdict === 'close') {
    const sharp = a.cents > 0;
    headline = `That's ${T}, but ${Math.abs(a.cents)}¢ ${sharp ? 'sharp' : 'flat'}.`;
    details.push(sharp
      ? 'You were slightly above the pitch — relax and let it settle a touch lower.'
      : 'You were slightly under the pitch — lift and brighten it a little.');
  } else {
    const sung = syllableName(a.sungSemisFromDo);
    const steps = Math.abs(a.semisOff);
    headline = `You sang ${sung}${letter(a.sungMidi)} — that's a ${INTERVAL_NAMES[steps]} ${a.semisOff > 0 ? 'above' : 'below'} ${T}.`;
    const role = q.chord.tones.indexOf(sung);
    if (role >= 0) {
      details.push(`${sung} is the ${CHORD_ROLES[role]} of the chord; ${T} is the ${CHORD_ROLES[q.targetIdx]}.`);
    }
    const root = q.chord.tones[0];
    if (q.targetIdx === 0) {
      details.push(`Tip: ${root} is the chord's home note — the one that sounds most "at rest". Try humming the lowest note of the arpeggio.`);
    } else if (q.targetIdx === 2) {
      details.push(`Tip: ${T} is the top of the triad — sing up the chord in your head: ${q.chord.tones.join('–')}.`);
    } else {
      details.push(`Tip: find ${root} first, then walk up the scale in your head: ${scalePath(q.chord, T).join('–')}.`);
    }
  }

  if (verdict !== 'wrong' && a.octave !== 0) {
    details.push(`(You sang it an octave ${a.octave > 0 ? 'higher' : 'lower'} than the chord — that's fine.)`);
  }
  if (a.wobble > 35) {
    details.push(`Your pitch wandered a bit (±${a.wobble}¢). Aim for one steady, supported tone.`);
  }
  return { verdict, headline, details };
}
