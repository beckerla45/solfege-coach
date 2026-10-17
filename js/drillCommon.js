// Shared pieces for every drill: playback, attempt analysis, grading, and feedback framing.
// A question needs: rootMidi, doMidi, chordMidis, chord, target (syllable), targetMidi.
import { INTERVAL_NAMES, mod, noteName, syllableName } from './theory.js';

export const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Notes the teacher plays: optional arpeggio up to the octave, then the block chord. */
export function chordEvents(q, style = 'block') {
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

/**
 * The coach's feedback for an attempt. Returns { verdict, headline, details[] }.
 * `wrongTips(sungSyllable)` lets each drill add its own coaching when the wrong note was sung.
 */
export function buildFeedback(a, q, { toleranceCents, showLetters }, wrongTips) {
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
    details.push(...wrongTips(sung));
  }

  if (verdict !== 'wrong' && a.octave !== 0) {
    details.push(`(You sang it an octave ${a.octave > 0 ? 'higher' : 'lower'} than the chord — that's fine.)`);
  }
  if (a.wobble > 35) {
    details.push(`Your pitch wandered a bit (±${a.wobble}¢). Aim for one steady, supported tone.`);
  }
  return { verdict, headline, details };
}
