// A small, clean-toned keyboard synth built from Web Audio oscillators.
// Each note is a pure sine with a faint octave overtone, so a chord sounds like exactly
// its notes and doesn't imply a phantom bass note below them.
import { midiToFreq } from './theory.js';

const PARTIALS = [
  { mult: 1, gain: 1 },
  { mult: 2, gain: 0.06 },
];
const RELEASE = 0.35;

export class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    // Acts only as a safety limiter near full scale, so normal playback isn't compressed.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.out = ctx.createGain();
    this.out.gain.value = 0.6;
    this.out.connect(this.limiter).connect(ctx.destination);
    this.endTime = 0;
  }

  set volume(v) { this.out.gain.value = v; }

  /** Schedule one note. Returns the time at which it has fully faded out. */
  note(midi, start, dur, vel = 0.5) {
    const { ctx } = this;
    const f = midiToFreq(midi);
    const env = ctx.createGain();
    env.connect(this.out);

    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(vel, start + 0.02);
    env.gain.exponentialRampToValueAtTime(vel * 0.5, start + 0.5);
    env.gain.setValueAtTime(vel * 0.5, start + dur);
    env.gain.linearRampToValueAtTime(0, start + dur + RELEASE);

    const stopAt = start + dur + RELEASE + 0.05;
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f * p.mult;
      g.gain.value = p.gain;
      osc.connect(g).connect(env);
      osc.start(start);
      osc.stop(stopAt);
    }
    this.endTime = Math.max(this.endTime, stopAt);
    return stopAt;
  }

  /** Play [{midi, at, dur, vel}] (times relative to now). Resolves when the sound has died away. */
  play(events) {
    const t0 = this.ctx.currentTime + 0.05;
    let end = t0;
    for (const e of events) end = Math.max(end, this.note(e.midi, t0 + e.at, e.dur, e.vel ?? 0.5));
    return new Promise((r) => setTimeout(r, (end - this.ctx.currentTime) * 1000));
  }

  get playing() { return this.ctx.currentTime < this.endTime; }
}
