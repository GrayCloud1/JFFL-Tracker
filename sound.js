// Sound for the JFFL tracker: event sound effects and an optional generative
// piano or jazz background loop. Everything is synthesized with the Web Audio
// API, so there are no audio files and nothing to license.
(() => {
const KEY = "jffl:sound";
let prefs = { sfx: true, music: "off", vol: 0.6 };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };

let ctx = null, master, musicBus, sfxBus, verb, noiseBuf, timer = null, nextT = 0, step = 0;
const mtof = m => 440 * 2 ** ((m - 69) / 12);

function init() {
  if (ctx) return ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return Promise.resolve();
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = prefs.vol; master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.5; sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8;
  // small room reverb from a generated impulse
  verb = ctx.createConvolver(); const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
  verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.28; verb.connect(wet); wet.connect(master);
  musicBus.connect(master); musicBus.connect(verb); sfxBus.connect(master); sfxBus.connect(verb);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return ctx.resume();
}

// ---------- instruments ----------
function piano(t, midi, dur, vel, bus = musicBus) {
  const f = mtof(midi), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 1800 + vel * 2200;
  [[1, "triangle", 1], [2, "sine", 0.35], [3, "sine", 0.12]].forEach(([h, type, a]) => {
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = f * h; o.detune.value = (Math.random() - 0.5) * 6;
    og.gain.value = a; o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 1.6);
  });
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.06 * vel, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 1.5);
  lp.connect(g); g.connect(bus);
}
function bass(t, midi, dur) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = "triangle"; o.frequency.value = mtof(midi); lp.type = "lowpass"; lp.frequency.value = 520;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.95);
  o.connect(lp); lp.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur);
}
function brush(t, vel, len = 0.09) {
  const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; hp.type = "highpass"; hp.frequency.value = 6500;
  g.gain.setValueAtTime(0.05 * vel, t); g.gain.exponentialRampToValueAtTime(0.0005, t + len);
  s.connect(hp); hp.connect(g); g.connect(musicBus); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
}

// ---------- music ----------
// Rootless voicings over a ii–V–I–VI turnaround in C, plus a slower cycle for solo piano.
const JAZZ = [
  { root: 38, v: [65, 69, 72, 76], walk: [38, 41, 45, 42] },  // Dm9
  { root: 43, v: [65, 69, 71, 76], walk: [43, 47, 50, 49] },  // G13
  { root: 36, v: [64, 67, 71, 74], walk: [36, 40, 43, 44] },  // Cmaj9
  { root: 45, v: [67, 70, 73, 76], walk: [45, 49, 52, 39] }   // A7b9
];
const PIANO = [
  { root: 48, v: [64, 67, 71, 74] },  // Cmaj9
  { root: 45, v: [60, 64, 67, 71] },  // Am9
  { root: 41, v: [64, 69, 72, 76] },  // Fmaj9
  { root: 43, v: [62, 65, 69, 71] }   // G9sus-ish
];
const PENT = [72, 74, 76, 79, 81, 84];

function schedule() {
  if (!ctx || prefs.music === "off") return;
  while (nextT < ctx.currentTime + 0.35) {
    if (prefs.music === "jazz") {
      // swung eighths at 108 bpm; 8 steps per bar
      const beat = 60 / 108, bar = Math.floor(step / 8) % JAZZ.length, s = step % 8, ch = JAZZ[bar];
      const swing = s % 2 ? beat * 0.66 : 0, t = nextT - (s % 2 ? beat * 0.5 : 0) + swing;
      if (s % 2 === 0) bass(t, ch.walk[s / 2], beat * 0.95);
      if (s === 2 || s === 6) brush(t, 1, 0.12);
      brush(t, s % 2 ? 0.45 : 0.7);
      if (s === 3 || (s === 6 && Math.random() < 0.6) || (s === 0 && Math.random() < 0.3)) ch.v.forEach(m => piano(t + Math.random() * 0.012, m, beat * 0.6, 0.55 + Math.random() * 0.15));
      if (Math.random() < 0.18 && s % 2 === 0) piano(t, PENT[Math.floor(Math.random() * PENT.length)], beat * 0.5, 0.5);
      nextT += beat * 0.5;
    } else {
      // gentle arpeggiated piano at 66 bpm; 8 eighth steps per bar
      const beat = 60 / 66, bar = Math.floor(step / 8) % PIANO.length, s = step % 8, ch = PIANO[bar];
      const t = nextT + (Math.random() - 0.5) * 0.015;
      if (s === 0) { piano(t, ch.root - 12, beat * 3.5, 0.6); piano(t + 0.02, ch.root, beat * 3.5, 0.45); }
      const arp = [ch.v[0], ch.v[1], ch.v[2], ch.v[3], ch.v[2], ch.v[1], ch.v[2], ch.v[3]];
      piano(t, arp[s], beat * 1.2, 0.32 + (s === 0 ? 0.1 : 0) + Math.random() * 0.06);
      if ((s === 4 || s === 7) && Math.random() < 0.35) piano(t, PENT[Math.floor(Math.random() * PENT.length)] + 12, beat * 1.5, 0.28);
      nextT += beat * 0.5;
    }
    step++;
  }
}
function startMusic() {
  stopMusic(); if (prefs.music === "off" || !ctx) return;
  step = 0; nextT = ctx.currentTime + 0.1; musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setValueAtTime(0, ctx.currentTime); musicBus.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);
  timer = setInterval(schedule, 90); schedule();
}
function stopMusic() { if (timer) clearInterval(timer); timer = null; }

// ---------- sound effects ----------
const fx = {
  score() { // soft two-note chime when points come in
    const t = ctx.currentTime + 0.02; piano(t, 88, 0.4, 0.7, sfxBus); piano(t + 0.11, 95, 0.6, 0.6, sfxBus);
  },
  swing(up) { // rising or falling whoosh when someone's odds move 10+ points
    const t = ctx.currentTime + 0.02, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; bp.type = "bandpass"; bp.Q.value = 4;
    bp.frequency.setValueAtTime(up ? 300 : 3200, t); bp.frequency.exponentialRampToValueAtTime(up ? 3200 : 300, t + 0.7);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    s.connect(bp); bp.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 0.85);
    piano(t + 0.55, up ? 84 : 72, 0.5, 0.45, sfxBus);
  },
  final() { // short stadium horn when a matchup goes final
    const t = ctx.currentTime + 0.02, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1400; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05);
    g.gain.setValueAtTime(0.12, t + 0.7); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    [60, 64, 67, 72].forEach(m => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.connect(lp); o.start(t); o.stop(t + 1.15); });
    lp.connect(g); g.connect(sfxBus);
  }
};

// ---------- public API ----------
window.JFFLSound = {
  prefs: () => ({ ...prefs }),
  ready: () => !!ctx && ctx.state === "running",
  async enable() { await init(); startMusic(); },
  set(p) { Object.assign(prefs, p); save(); if (ctx) { master.gain.value = prefs.vol; startMusic(); } },
  play(name, arg) { if (!prefs.sfx || !ctx || ctx.state !== "running") return; fx[name] && fx[name](arg); },
  onRefresh({ scored, swing, finals }) {
    if (!prefs.sfx || !ctx || ctx.state !== "running") return;
    let delay = 0;
    if (finals) { setTimeout(() => fx.final(), delay); delay += 1200; }
    if (swing) { setTimeout(() => fx.swing(swing > 0), delay); delay += 900; }
    if (scored) setTimeout(() => fx.score(), delay);
  }
};

// ---------- menu ----------
function wire() {
  const btn = document.getElementById("sndBtn"), panel = document.getElementById("sndPanel");
  if (!btn || !panel) return;
  const sync = () => {
    const on = prefs.sfx || prefs.music !== "off";
    btn.setAttribute("aria-pressed", String(on && window.JFFLSound.ready()));
    btn.classList.toggle("on", on && window.JFFLSound.ready());
    panel.querySelector("#sndSfx").checked = prefs.sfx;
    panel.querySelectorAll("input[name=music]").forEach(r => r.checked = r.value === prefs.music);
    panel.querySelector("#sndVol").value = Math.round(prefs.vol * 100);
    document.getElementById("sndHint").hidden = window.JFFLSound.ready();
  };
  btn.addEventListener("click", async e => { e.stopPropagation(); await window.JFFLSound.enable(); panel.hidden = !panel.hidden; sync(); });
  panel.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", () => { panel.hidden = true; });
  document.addEventListener("keydown", e => { if (e.key === "Escape") panel.hidden = true; });
  panel.querySelector("#sndSfx").addEventListener("change", e => { window.JFFLSound.set({ sfx: e.target.checked }); if (e.target.checked) fx.score(); sync(); });
  panel.querySelectorAll("input[name=music]").forEach(r => r.addEventListener("change", e => { window.JFFLSound.set({ music: e.target.value }); sync(); }));
  panel.querySelector("#sndVol").addEventListener("input", e => window.JFFLSound.set({ vol: e.target.value / 100 }));
  panel.querySelector("#sndTest").addEventListener("click", async () => { await window.JFFLSound.enable(); fx.final(); setTimeout(() => fx.swing(true), 1200); setTimeout(() => fx.score(), 2100); sync(); });
  // browsers only allow audio after a tap; resume saved sound on the first interaction
  const resume = async () => { if (prefs.sfx || prefs.music !== "off") { await window.JFFLSound.enable(); sync(); } };
  document.addEventListener("pointerdown", resume, { once: true });
  sync();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
