// A small piano-like synth built from Web Audio oscillators.
import { midiToFreq } from './theory.js';

const PARTIALS = [
  { type: 'triangle', mult: 1, gain: 1 },
  { type: 'sine', mult: 2, gain: 0.22 },
  { type: 'sine', mult: 3, gain: 0.07 },
];
const RELEASE = 0.35;

export class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.out = ctx.createGain();
    this.out.gain.value = 0.6;
    this.out.connect(this.comp).connect(ctx.destination);
    this.endTime = 0;
  }

  set volume(v) { this.out.gain.value = v; }

  /** Schedule one note. Returns the time at which it has fully faded out. */
  note(midi, start, dur, vel = 0.5) {
    const { ctx } = this;
    const f = midiToFreq(midi);
    const env = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(Math.min(f * 10, 9000), start);
    filt.frequency.exponentialRampToValueAtTime(Math.max(f * 2.5, 500), start + dur);
    filt.connect(env).connect(this.out);

    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(vel, start + 0.012);
    env.gain.exponentialRampToValueAtTime(vel * 0.35, start + 0.45);
    env.gain.setValueAtTime(vel * 0.35, start + dur);
    env.gain.linearRampToValueAtTime(0, start + dur + RELEASE);

    const stopAt = start + dur + RELEASE + 0.05;
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = p.type;
      osc.frequency.value = f * p.mult;
      g.gain.value = p.gain;
      osc.connect(g).connect(filt);
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
