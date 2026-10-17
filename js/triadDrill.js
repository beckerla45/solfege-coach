// Drill 1: the teacher plays a triad, asks for one chord tone by syllable, and grades the sung pitch.
import { CHORDS, CHORD_ROLES, SYLLABLE_SEMIS, VOICES, chordOffsets, pitchClassName, scalePath } from './theory.js';
import { buildFeedback, pick, randInt } from './drillCommon.js';

export const id = 'triad';
export const title = 'Triad Drill';

/**
 * Build a question. `prev` is the last question, so we don't repeat the exact same one.
 * settings: { voice, chord: 'major'|'minor', targets: [indices into chord tones], sameKey }
 */
export function makeQuestion(settings, prev) {
  const chord = CHORDS[settings.chord];
  const voice = VOICES[settings.voice];
  const offsets = chordOffsets(chord);
  const targets = settings.targets?.length ? settings.targets : [0, 1, 2];
  if (prev?.drill !== id) prev = null;

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
    drill: id,
    chordKey: settings.chord,
    voice: settings.voice,
    chord,
    rootMidi,
    doMidi,
    chordMidis,
    targetIdx,
    target: chord.tones[targetIdx],
    targetMidi: chordMidis[targetIdx],
    chips: chord.tones.map((t, i) => ({ label: t, target: i === targetIdx })),
    statKey: `${chord.tones[targetIdx]} (${settings.chord})`,
    keyLabel: chord.minor
      ? `${tonicName} minor · la = ${tonicName} (do = ${pitchClassName(doMidi)})`
      : `${tonicName} major · do = ${tonicName}`,
  };
}

export function feedback(a, q, opts) {
  return buildFeedback(a, q, opts, (sung) => {
    const tips = [];
    const T = q.target;
    const role = q.chord.tones.indexOf(sung);
    if (role >= 0) tips.push(`${sung} is the ${CHORD_ROLES[role]} of the chord; ${T} is the ${CHORD_ROLES[q.targetIdx]}.`);
    const root = q.chord.tones[0];
    if (q.targetIdx === 0) {
      tips.push(`Tip: ${root} is the chord's home note — the one that sounds most "at rest". Try humming the lowest note of the arpeggio.`);
    } else if (q.targetIdx === 2) {
      tips.push(`Tip: ${T} is the top of the triad — sing up the chord in your head: ${q.chord.tones.join('–')}.`);
    } else {
      tips.push(`Tip: find ${root} first, then walk up the scale in your head: ${scalePath(q.chord, T).join('–')}.`);
    }
    return tips;
  });
}
