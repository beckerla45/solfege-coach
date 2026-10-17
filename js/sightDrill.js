// Drill 2: Sight-Singing — Solfège. A major triad sets the key, then the learner sings a randomly
// chosen syllable from the full chromatic set (do, di, ra, re, ri, me, mi, …).
import { CHORDS, SYLLABLE_SEMIS, VOICES, chordOffsets, pitchClassName } from './theory.js';
import { buildFeedback, pick, randInt } from './drillCommon.js';

export const id = 'sight';
export const title = 'Sight-Singing Drill — Solfège';

// Chromatic order: every pitch, raised spelling before lowered.
export const CHROMATIC_ORDER = ['do', 'di', 'ra', 're', 'ri', 'me', 'mi', 'fa', 'fi', 'se', 'sol', 'si', 'le', 'la', 'li', 'te', 'ti'];
const DIATONIC = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
export const POOLS = {
  all: { label: 'All chromatic syllables (17)', syls: CHROMATIC_ORDER },
  diatonic: { label: 'Diatonic only (do re mi fa sol la ti)', syls: DIATONIC },
  altered: { label: 'Altered only (di ra ri me fi se si le li te)', syls: CHROMATIC_ORDER.filter((s) => !DIATONIC.includes(s)) },
};

// Each altered syllable is a diatonic note moved by a half step.
const RAISED = { di: 'do', ri: 're', fi: 'fa', si: 'sol', li: 'la' };
const LOWERED = { ra: 're', me: 'mi', se: 'sol', le: 'la', te: 'ti' };
const DIATONIC_TIPS = {
  do: 'do is home — the bottom note of the chord.',
  re: 're is one step above do: do–re.',
  mi: 'mi is the middle note of the chord: do–mi–sol.',
  fa: 'fa is a half step above mi: mi–fa.',
  sol: 'sol is the top note of the chord: do–mi–sol.',
  la: 'la is one step above sol: sol–la.',
  ti: 'ti is a half step below high do: ti–do.',
};

/** settings: { voice, sightPool: 'all'|'diatonic'|'altered', sameKey } */
export function makeQuestion(settings, prev) {
  const chord = CHORDS.major;
  const voice = VOICES[settings.voice];
  const pool = (POOLS[settings.sightPool] ?? POOLS.all).syls;
  if (prev?.drill !== id) prev = null;

  const rootMidi = settings.sameKey && prev?.voice === settings.voice ? prev.rootMidi : randInt(voice.low, voice.high - 12);
  let target, tries = 0;
  do target = pick(pool); while (prev && target === prev.target && pool.length > 1 && ++tries < 20);

  const tonicName = pitchClassName(rootMidi);
  return {
    drill: id,
    voice: settings.voice,
    chord,
    rootMidi,
    doMidi: rootMidi,
    chordMidis: chordOffsets(chord).map((o) => rootMidi + o),
    target,
    targetMidi: rootMidi + SYLLABLE_SEMIS[target], // between do and ti, above the chord's do
    chips: [],
    statKey: target,
    keyLabel: `${tonicName} major · do = ${tonicName}`,
  };
}

export function feedback(a, q, opts) {
  return buildFeedback(a, q, opts, () => {
    const T = q.target;
    if (RAISED[T]) return [`Tip: ${T} is a raised ${RAISED[T]} — find ${RAISED[T]}, then nudge up a half step.`];
    if (LOWERED[T]) return [`Tip: ${T} is a lowered ${LOWERED[T]} — find ${LOWERED[T]}, then drop down a half step.`];
    return [`Tip: ${DIATONIC_TIPS[T]}`];
  });
}
