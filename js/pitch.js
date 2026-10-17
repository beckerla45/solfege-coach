// Microphone input + YIN pitch detection, and a helper that captures one sung note.
import { freqToMidi } from './theory.js';

/**
 * YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002).
 * Returns { freq, clarity } or null when no clear pitch is found.
 */
export function yin(buf, sampleRate, { threshold = 0.15, minFreq = 60, maxFreq = 1200 } = {}) {
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
  const W = buf.length - tauMax;

  // Difference function.
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }

  // Cumulative mean normalized difference.
  const c = new Float32Array(tauMax + 1);
  c[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    c[tau] = running ? (d[tau] * tau) / running : 1;
  }

  // First dip below threshold, then slide to its local minimum.
  let tau = -1;
  for (let t = tauMin; t < tauMax; t++) {
    if (c[t] < threshold) {
      while (t + 1 < tauMax && c[t + 1] < c[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  // Parabolic interpolation for sub-sample accuracy.
  const a = c[tau - 1], b = c[tau], g = c[tau + 1];
  const denom = a - 2 * b + g;
  const shift = denom ? (a - g) / (2 * denom) : 0;
  return { freq: sampleRate / (tau + shift), clarity: 1 - b };
}

export class PitchTracker {
  constructor(ctx) {
    this.ctx = ctx;
    this.gate = 0.01; // RMS below this is treated as silence
  }

  get ready() { return !!this.analyser; }

  async start() {
    if (this.analyser) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is unavailable. Open the app via http://localhost (run start.bat).');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
  }

  /** Analyse the most recent ~43 ms of mic audio. */
  read() {
    this.analyser.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(s / this.buf.length);
    let r = null;
    if (rms >= this.gate) r = yin(this.buf, this.ctx.sampleRate);
    const voiced = !!r && r.clarity >= 0.8;
    return {
      t: performance.now(),
      rms,
      freq: r?.freq ?? null,
      clarity: r?.clarity ?? 0,
      midi: r ? freqToMidi(r.freq) : null,
      voiced,
    };
  }

  /** Measure room noise for `ms` and set the silence gate just above it. */
  async calibrate(ms = 900) {
    const levels = [];
    const end = performance.now() + ms;
    while (performance.now() < end) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let s = 0;
      for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
      levels.push(Math.sqrt(s / this.buf.length));
      await new Promise((r) => setTimeout(r, 30));
    }
    levels.sort((a, b) => a - b);
    const noise = levels[Math.floor(levels.length * 0.9)] ?? 0;
    this.gate = Math.min(0.05, Math.max(0.004, noise * 3));
    return { noise, gate: this.gate };
  }
}

/**
 * Wait for the singer to start, then record ~noteMs of pitch frames.
 * Frames before the voice onset are not kept; each kept frame gets `rel` (ms since onset).
 */
export function captureNote(tracker, { maxWaitMs = 7000, noteMs = 1600, settleMs = 200, onFrame, signal } = {}) {
  return new Promise((resolve) => {
    const frames = [];
    const t0 = performance.now();
    let onset = null, run = 0, lastVoiced = 0, voicedKept = 0;

    const tick = () => {
      if (signal?.aborted) return resolve({ frames, aborted: true });
      const f = tracker.read();
      if (f.voiced) { run++; lastVoiced = f.t; } else run = 0;
      if (onset === null && run >= 3) onset = f.t;
      if (onset !== null) {
        f.rel = f.t - onset;
        frames.push(f);
        if (f.voiced && f.rel >= settleMs) voicedKept++;
      }
      onFrame?.(f, frames, onset);

      if (onset === null && f.t - t0 > maxWaitMs) return resolve({ frames, timedOut: true });
      if (onset !== null) {
        const done = f.t - onset > noteMs + settleMs;
        const stoppedEarly = f.t - lastVoiced > 450 && voicedKept >= 12;
        if (done || stoppedEarly) return resolve({ frames, settleMs });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
