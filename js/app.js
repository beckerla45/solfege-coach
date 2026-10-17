// UI controller: tabs, settings, the drill flow, the pitch trace, progress, and the Learn page.
import { Synth } from './synth.js';
import { PitchTracker, captureNote } from './pitch.js';
import { chordEvents, analyzeAttempt } from './drillCommon.js';
import * as triadDrill from './triadDrill.js';
import * as sightDrill from './sightDrill.js';
import {
  CHORDS, CHORD_ROLES, MAJOR_SCALE, MINOR_SCALES, SYLLABLE_SEMIS, VOICES,
  mod, noteName, pitchClassName, syllableName,
} from './theory.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOTE_MS = 1600, SETTLE_MS = 200;
const DRILLS = { [triadDrill.id]: triadDrill, [sightDrill.id]: sightDrill };

// ---------- persistence ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};

const DEFAULTS = {
  drill: 'triad', voice: 'baritone', chord: 'major', targets: [0, 1, 2], sightPool: 'all', style: 'block',
  tolerance: 25, auto: true, sameKey: false, letters: true, volume: 0.6,
};
const settings = store.get('solfege.settings', DEFAULTS);
// v2: the chord is presented as a block chord by default (earlier saves defaulted to arpeggio + chord).
if (!settings.v2) { settings.style = 'block'; settings.v2 = true; }
if (!DRILLS[settings.drill]) settings.drill = DEFAULTS.drill;
const drill = () => DRILLS[settings.drill];
// Progress per drill: progress.drills[drillId][statKey] = { n, inTune, absCents, onNote }.
const progress = store.get('solfege.progress', { drills: {} });
if (progress.bySyl) { // saves from before there was more than one drill were all triad drill
  progress.drills.triad = { ...progress.bySyl, ...progress.drills.triad };
  delete progress.bySyl;
}
const session = { attempts: 0, inTune: 0, streak: 0 };
const saveSettings = () => store.set('solfege.settings', settings);

// ---------- audio ----------
let actx = null, synth = null, tracker = null;
function ensureAudio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    synth = new Synth(actx);
    synth.volume = settings.volume;
    tracker = new PitchTracker(actx);
  }
  if (actx.state === 'suspended') actx.resume();
}

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === 'practice') drawTrace(lastFrames, lastAnalysis);
  });
});

// ---------- drill state ----------
let q = null;
let phase = 'idle'; // idle | playing | ready | listening | done
let playToken = 0;
let abortCtl = null;
let lastFrames = [], lastAnalysis = null;

function setPhase(p, text) {
  phase = p;
  $('status').textContent = text ?? {
    playing: 'Listen…', ready: 'Your turn — press Sing (Space)', listening: `Listening — sing ${q?.target}`,
    done: 'Try again, or press Next', idle: 'Ready',
  }[p];
  const sing = $('singBtn');
  sing.classList.toggle('listening', p === 'listening');
  sing.textContent = p === 'listening' ? '■ Stop' : '🎤 Sing';
  sing.disabled = p === 'playing';
}

function renderQuestion() {
  $('targetSyl').textContent = q.target;
  $('keyLabel').textContent = settings.letters ? q.keyLabel : (q.chord.minor ? 'Minor key' : 'Major key');
  $('chordTones').innerHTML = q.chips
    .map((c) => `<span class="chip${c.target ? ' target' : ''}">${c.label}</span>`).join('');
  $('rootBtn').textContent = `Play ${q.chord.tones[0]}`;
  $('feedback').hidden = true;
  lastFrames = []; lastAnalysis = null;
  drawTrace();
}

function cancelListen() {
  if (abortCtl) { abortCtl.abort(); abortCtl = null; }
}

async function playEvents(events) {
  cancelListen();
  const token = ++playToken;
  setPhase('playing');
  await synth.play(events);
  await sleep(250); // let the room go quiet before the mic opens
  if (token !== playToken) return false;
  setPhase(lastAnalysis ? 'done' : 'ready');
  return true;
}

async function nextQuestion() {
  q = drill().makeQuestion(settings, q);
  renderQuestion();
  if (await playEvents(chordEvents(q, settings.style)) && settings.auto) listen();
}

async function listen() {
  if (!q || phase === 'playing') return;
  if (phase === 'listening') { cancelListen(); setPhase('ready'); return; }
  abortCtl = new AbortController();
  setPhase('listening');
  $('feedback').hidden = true;
  lastAnalysis = null;

  const res = await captureNote(tracker, {
    noteMs: NOTE_MS, settleMs: SETTLE_MS, signal: abortCtl.signal,
    onFrame: (f, frames, onset) => {
      $('levelBar').style.width = `${Math.min(100, (f.rms / 0.15) * 100)}%`;
      $('hearing').textContent = f.voiced ? describeLive(f.midi) : (onset === null ? 'waiting for your voice…' : '');
      if (onset !== null) drawTrace(frames);
    },
  });
  $('levelBar').style.width = '0';
  if (res.aborted) return;
  abortCtl = null;
  lastFrames = res.frames;

  if (res.timedOut) {
    setPhase('ready', "I didn't hear anything. Check the mic, then press Sing and hold the note.");
    $('hearing').textContent = '';
    return;
  }
  const a = analyzeAttempt(res.frames, res.settleMs, q);
  if (!a) {
    setPhase('ready', 'That was too short or unclear — hold the note steadily for about two seconds.');
    drawTrace(res.frames);
    return;
  }
  lastAnalysis = a;
  const fb = DRILLS[q.drill].feedback(a, q, { toleranceCents: settings.tolerance, showLetters: settings.letters });
  showFeedback(fb);
  record(a, fb.verdict);
  $('hearing').textContent = '';
  drawTrace(res.frames, a);
  setPhase('done');
}

function describeLive(midi) {
  const near = Math.round(midi);
  const cents = Math.round((midi - near) * 100);
  const syl = syllableName(near - q.doMidi);
  const letter = settings.letters ? ` ${noteName(near, q.chord.minor)}` : '';
  return `hearing ${syl}${letter} ${cents >= 0 ? '+' : ''}${cents}¢`;
}

function showFeedback(fb) {
  const box = $('feedback');
  box.className = `feedback ${fb.verdict}`;
  $('fbHeadline').textContent = fb.headline;
  $('fbDetails').innerHTML = fb.details.map((d) => `<li>${d}</li>`).join('');
  box.hidden = false;
}

// ---------- progress ----------
function record(a, verdict) {
  const ok = verdict === 'correct';
  session.attempts++;
  if (ok) { session.inTune++; session.streak++; } else session.streak = 0;

  const byKey = (progress.drills[q.drill] ??= {});
  const s = (byKey[q.statKey] ??= { n: 0, inTune: 0, absCents: 0, onNote: 0 });
  s.n++;
  if (ok) s.inTune++;
  if (verdict !== 'wrong') { s.onNote++; s.absCents += Math.abs(a.cents); }
  store.set('solfege.progress', progress);

  const li = document.createElement('li');
  const where = settings.letters ? ` in ${pitchClassName(q.rootMidi, q.chord.minor)}` : '';
  const result = verdict === 'wrong'
    ? `sang ${syllableName(a.sungSemisFromDo)}`
    : `${a.cents >= 0 ? '+' : ''}${a.cents}¢`;
  li.innerHTML = `<span class="dot ${verdict}"></span>${q.target}${where} — ${result}`;
  $('history').prepend(li);
  renderStats();
}

function renderStats() {
  $('stAttempts').textContent = session.attempts;
  $('stCorrect').textContent = session.attempts ? `${Math.round((100 * session.inTune) / session.attempts)}%` : '–';
  $('stStreak').textContent = session.streak;
  $('statsDrill').textContent = drill().title;
  const order = settings.drill === sightDrill.id ? sightDrill.CHROMATIC_ORDER : null;
  const rows = Object.entries(progress.drills[settings.drill] ?? {}).sort(([a], [b]) =>
    order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b));
  $('sylStats').innerHTML = rows.length
    ? rows.map(([k, s]) => `<tr><td>${k}</td><td>${s.n}</td><td>${Math.round((100 * s.inTune) / s.n)}%</td>`
        + `<td>${s.onNote ? Math.round(s.absCents / s.onNote) : '–'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="muted">No attempts yet</td></tr>';
}

// ---------- pitch trace ----------
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const DIATONIC = new Set([0, 2, 4, 5, 7, 9, 11]);

function drawTrace(frames = [], a = null) {
  const cvs = $('trace');
  const W = cvs.clientWidth, H = 220, dpr = window.devicePixelRatio || 1;
  if (!W) return;
  cvs.width = W * dpr; cvs.height = H * dpr;
  const g = cvs.getContext('2d');
  g.scale(dpr, dpr);
  g.clearRect(0, 0, W, H);
  if (!q) return;

  // Centre the view on the target in whichever octave the singer is using.
  const firstVoiced = frames.find((f) => f.voiced);
  const center = a ? a.targetNear
    : firstVoiced ? q.targetMidi + 12 * Math.round((firstVoiced.midi - q.targetMidi) / 12)
      : q.targetMidi;
  const lo = center - 7.5, hi = center + 7.5;
  const padL = 64, padR = 12, padT = 8, padB = 8;
  const y = (m) => padT + ((hi - m) / (hi - lo)) * (H - padT - padB);
  const totalMs = NOTE_MS + SETTLE_MS;
  const x = (ms) => padL + Math.min(1, ms / totalMs) * (W - padL - padR);

  // Tolerance band around the target.
  const tol = settings.tolerance / 100;
  g.fillStyle = css('--good') + '22';
  g.fillRect(padL, y(center + tol), W - padL - padR, y(center - tol) - y(center + tol));

  // Note lines: chord tones bold, the target highlighted, other scale notes faint.
  g.font = '13px system-ui, sans-serif';
  g.textBaseline = 'middle';
  const chordSemis = q.chord.tones.map((t) => SYLLABLE_SEMIS[t]);
  for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
    const s = mod(m - q.doMidi, 12);
    const isTarget = m === center;
    const isChord = chordSemis.includes(s);
    g.strokeStyle = isTarget ? css('--primary') : css('--grid');
    g.lineWidth = isTarget ? 2 : isChord ? 1.5 : 1;
    g.setLineDash(isChord || isTarget ? [] : [3, 4]);
    g.beginPath(); g.moveTo(padL, y(m)); g.lineTo(W - padR, y(m)); g.stroke();
    if (DIATONIC.has(s) || isChord || isTarget) {
      g.fillStyle = isTarget ? css('--primary') : isChord ? css('--text') : css('--muted');
      g.font = `${isTarget || isChord ? 600 : 400} 13px system-ui, sans-serif`;
      g.fillText((isTarget ? q.target : syllableName(s)) + (settings.letters ? ` ${noteName(m, q.chord.minor)}` : ''), 6, y(m));
    }
  }
  g.setLineDash([]);

  // Sung pitch, folded into the displayed octave.
  for (const f of frames) {
    if (!f.voiced) continue;
    const m = f.midi - 12 * Math.round((f.midi - center) / 12);
    const dev = Math.abs(m - center);
    g.fillStyle = dev <= tol ? css('--good') : dev < 0.5 ? css('--warn') : css('--trace');
    g.globalAlpha = f.rel < SETTLE_MS ? 0.35 : 1;
    g.beginPath(); g.arc(x(f.rel), y(Math.max(lo, Math.min(hi, m))), 2.6, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;

  if (a) {
    const m = center + a.cents / 100;
    g.strokeStyle = css('--text');
    g.setLineDash([6, 4]);
    g.beginPath(); g.moveTo(padL, y(m)); g.lineTo(W - padR, y(m)); g.stroke();
    g.setLineDash([]);
  }
}
window.addEventListener('resize', () => drawTrace(lastFrames, lastAnalysis));

// ---------- practice controls ----------
$('beginBtn').addEventListener('click', async () => {
  const err = $('startError');
  err.hidden = true;
  $('beginBtn').disabled = true;
  try {
    ensureAudio();
    $('beginBtn').textContent = 'Allow the microphone…';
    await tracker.start();
    $('beginBtn').textContent = 'Shh… measuring the room';
    const cal = await tracker.calibrate();
    showCal(cal);
    $('startBox').hidden = true;
    $('drillBox').hidden = false;
    renderStats();
    nextQuestion();
  } catch (e) {
    err.textContent = `Couldn't start the microphone: ${e.message}`;
    err.hidden = false;
    $('beginBtn').disabled = false;
    $('beginBtn').textContent = 'Begin lesson';
  }
});

const rootEvent = () => [{ midi: q.rootMidi, at: 0, dur: 1.2, vel: 0.5 }];
const answerEvents = () => [{ midi: q.targetMidi, at: 0, dur: 1.4, vel: 0.55 }];

$('singBtn').addEventListener('click', () => listen());
$('replayBtn').addEventListener('click', () => q && playEvents(chordEvents(q, settings.style)));
$('rootBtn').addEventListener('click', () => q && playEvents(rootEvent()));
$('answerBtn').addEventListener('click', () => q && playEvents(answerEvents()));
$('nextBtn').addEventListener('click', () => q && nextQuestion());

document.addEventListener('keydown', (e) => {
  if (!q || $('drillBox').hidden || !$('tab-practice').classList.contains('active')) return;
  if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const actions = {
    ' ': () => listen(),
    r: () => playEvents(chordEvents(q, settings.style)),
    d: () => playEvents(rootEvent()),
    a: () => playEvents(answerEvents()),
    n: () => nextQuestion(),
  };
  const act = actions[e.key.toLowerCase()];
  if (act) { e.preventDefault(); act(); }
});

// ---------- settings ----------
function showCal(cal) {
  $('calInfo').textContent = `Mic calibrated — room noise ${cal.noise.toFixed(4)}, voice gate ${cal.gate.toFixed(4)}.`;
}

// Switching drills starts a fresh question in the new drill.
function setDrill(id) {
  settings.drill = id;
  saveSettings();
  renderDrillPicker();
  renderStats();
  if (q) nextQuestion();
}

function renderDrillPicker() {
  $('drillPicker').innerHTML = Object.values(DRILLS).map((d) =>
    `<button class="seg${d.id === settings.drill ? ' active' : ''}" data-drill="${d.id}">${d.title}</button>`).join('');
}

// Voice range can be changed from the Practice screen or Settings; keep both pickers in sync.
function setVoice(voice) {
  settings.voice = voice;
  saveSettings();
  $('setVoice').value = $('practiceVoice').value = voice;
  renderLearn();
  if (q) nextQuestion(); // hear a chord in the new range right away
}

function renderTargetChecks() {
  const chord = CHORDS[settings.chord];
  $('setTargets').innerHTML = chord.tones.map((t, i) =>
    `<label><input type="checkbox" value="${i}" ${settings.targets.includes(i) ? 'checked' : ''}> ${t} <span class="muted small">(${CHORD_ROLES[i]})</span></label>`,
  ).join('');
}

function initSettings() {
  const voiceOptions = Object.entries(VOICES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  for (const id of ['setVoice', 'practiceVoice']) {
    $(id).innerHTML = voiceOptions;
    $(id).value = settings.voice;
    $(id).addEventListener('change', (e) => setVoice(e.target.value));
  }
  $('setChord').value = settings.chord;
  $('setPool').innerHTML = Object.entries(sightDrill.POOLS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
  $('setPool').value = settings.sightPool;
  $('setPool').addEventListener('change', (e) => { settings.sightPool = e.target.value; saveSettings(); });
  renderDrillPicker();
  $('drillPicker').addEventListener('click', (e) => {
    const id = e.target.closest('[data-drill]')?.dataset.drill;
    if (id && id !== settings.drill) setDrill(id);
  });
  $('setStyle').value = settings.style;
  $('setTol').value = String(settings.tolerance);
  $('setAuto').checked = settings.auto;
  $('setSameKey').checked = settings.sameKey;
  $('setLetters').checked = settings.letters;
  $('setVol').value = settings.volume;
  renderTargetChecks();

  $('setChord').addEventListener('change', (e) => { settings.chord = e.target.value; saveSettings(); renderTargetChecks(); });
  $('setStyle').addEventListener('change', (e) => { settings.style = e.target.value; saveSettings(); });
  $('setTol').addEventListener('change', (e) => { settings.tolerance = Number(e.target.value); saveSettings(); });
  $('setAuto').addEventListener('change', (e) => { settings.auto = e.target.checked; saveSettings(); });
  $('setSameKey').addEventListener('change', (e) => { settings.sameKey = e.target.checked; saveSettings(); });
  $('setLetters').addEventListener('change', (e) => { settings.letters = e.target.checked; saveSettings(); });
  $('setVol').addEventListener('input', (e) => {
    settings.volume = Number(e.target.value); saveSettings();
    if (synth) synth.volume = settings.volume;
  });
  $('setTargets').addEventListener('change', () => {
    const checked = [...$('setTargets').querySelectorAll('input:checked')].map((c) => Number(c.value));
    if (!checked.length) { renderTargetChecks(); return; } // keep at least one
    settings.targets = checked; saveSettings();
  });
  $('recalBtn').addEventListener('click', async () => {
    if (!tracker?.ready) { $('calInfo').textContent = 'Start a lesson first so I can access the microphone.'; return; }
    $('calInfo').textContent = 'Shh… measuring the room';
    showCal(await tracker.calibrate());
  });
  $('resetBtn').addEventListener('click', () => {
    if (!confirm('Reset all saved progress?')) return;
    progress.drills = {};
    store.set('solfege.progress', progress);
    renderStats();
  });
}

// ---------- learn ----------
const learnScales = { major: MAJOR_SCALE, ...MINOR_SCALES };

function learnDo() {
  const pc = Number($('learnKey').value);
  const low = VOICES[settings.voice].low;
  return low + mod(pc - low, 12); // lowest do of this key inside the voice range
}
// Minor scales start on la, three semitones below do (moved up an octave if that's too low).
function learnLa() {
  const la = learnDo() - 3;
  return la < VOICES[settings.voice].low ? la + 12 : la;
}

function sylButtons(rowId, syls, baseMidi, rootSemis) {
  $(rowId).innerHTML = [...syls, syls[0]].map((s, i) => {
    let semis = mod(SYLLABLE_SEMIS[s] - rootSemis, 12);
    if (i === syls.length) semis = 12;
    return `<button class="btn syl-btn" data-midi="${baseMidi + semis}">${s}</button>`;
  }).join('');
}

let minorVariant = 'natural';
function renderLearn() {
  sylButtons('majorRow', MAJOR_SCALE, learnDo(), 0);
  sylButtons('minorRow', MINOR_SCALES[minorVariant], learnLa(), SYLLABLE_SEMIS.la);
}

async function playRow(rowId) {
  ensureAudio();
  const btns = [...$(rowId).querySelectorAll('.syl-btn')];
  const step = 0.45;
  synth.play(btns.map((b, i) => ({ midi: Number(b.dataset.midi), at: i * step, dur: step, vel: 0.5 })));
  for (const b of btns) {
    btns.forEach((x) => x.classList.toggle('lit', x === b));
    await sleep(step * 1000);
  }
  btns.forEach((x) => x.classList.remove('lit'));
}

function initLearn() {
  $('learnKey').innerHTML = Array.from({ length: 12 }, (_, pc) =>
    `<option value="${pc}">${pitchClassName(pc)}</option>`).join('');
  $('learnKey').value = '0';
  $('learnKey').addEventListener('change', renderLearn);
  renderLearn();

  document.querySelector('#tab-learn').addEventListener('click', (e) => {
    const syl = e.target.closest('.syl-btn');
    if (syl) {
      ensureAudio();
      synth.play([{ midi: Number(syl.dataset.midi), at: 0, dur: 0.9, vel: 0.55 }]);
      return;
    }
    const kind = e.target.closest('[data-play]')?.dataset.play;
    if (!kind) return;
    if (kind === 'major') return playRow('majorRow');
    if (kind.startsWith('triad-')) {
      ensureAudio();
      const minor = kind === 'triad-minor';
      const root = minor ? learnLa() : learnDo();
      const offs = minor ? [0, 3, 7] : [0, 4, 7];
      synth.play([
        ...offs.map((o, i) => ({ midi: root + o, at: i * 0.5, dur: 0.5 })),
        ...offs.map((o) => ({ midi: root + o, at: 1.75, dur: 1.5, vel: 0.32 })),
      ]);
      return;
    }
    if (learnScales[kind]) {
      minorVariant = kind;
      renderLearn();
      playRow('minorRow');
    }
  });
}

initSettings();
initLearn();
renderStats();
