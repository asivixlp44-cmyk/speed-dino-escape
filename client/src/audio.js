// Procedural soundtrack and sound effects (Web Audio, no asset files).
// The track is an original 116 BPM jungle-adventure tune: tribal toms and shakers, a bouncy
// plucked bass, bright marimba chords, a whistle-flute melody with echo, and birds calling
// in the trees. 16 bars, looping.

let ctx = null, master, musicBus, sfxBus, reverb, delay, ambGain;
let noiseBuf = null;
let musicOn = false, schedTimer = null, step = 0, nextTime = 0;
const settings = { music: 0.6, sfx: 0.8, master: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('sde_audio') || '{}')); } catch (e) { /* defaults */ }

const BPM = 116, STEP = 60 / BPM / 4;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// One chord per bar: C, G, Am, F (root, then voicing in MIDI)
const CHORDS = [
    { root: 36, notes: [60, 64, 67] },
    { root: 43, notes: [59, 62, 67] },
    { root: 45, notes: [57, 60, 64] },
    { root: 41, notes: [57, 60, 65] },
];
// Flute phrases, 4 bars x 16 steps: [step, midi, length in steps]
const MELODY_A = [
    [[0, 76, 2], [2, 79, 2], [4, 84, 4], [10, 83, 2], [12, 79, 4]],
    [[0, 81, 3], [3, 79, 3], [6, 74, 6], [14, 76, 2]],
    [[0, 77, 2], [2, 76, 2], [4, 72, 4], [8, 76, 2], [10, 79, 6]],
    [[0, 77, 4], [4, 76, 2], [6, 74, 2], [8, 72, 8]],
];
const MELODY_B = [
    [[0, 84, 2], [2, 86, 2], [4, 88, 4], [8, 86, 2], [10, 84, 6]],
    [[0, 83, 4], [4, 86, 4], [8, 83, 2], [10, 79, 6]],
    [[0, 81, 2], [2, 84, 2], [4, 88, 6], [12, 86, 4]],
    [[0, 84, 4], [4, 83, 2], [6, 81, 2], [8, 84, 8]],
];
// Bouncy bass line per bar: [step, semitones above the root]
const BASS = [[0, 0], [3, 0], [6, 7], [8, 12], [11, 7], [14, 5]];

export function initAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.9;
    comp.connect(master).connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    applyVolumes();

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Medium room reverb (generated impulse) and an eighth-note echo for the flute
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    reverb.buffer = ir;
    const revGain = ctx.createGain(); revGain.gain.value = 0.3;
    reverb.connect(revGain).connect(musicBus);
    delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 2;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const dlGain = ctx.createGain(); dlGain.gain.value = 0.28;
    delay.connect(fb).connect(delay);
    delay.connect(dlGain).connect(musicBus);

    startJungle();
    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend(); else ctx.resume();
    });
}

function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const m = settings.master ?? 1;
    musicBus.gain.setTargetAtTime(settings.music * 0.55 * m, t, 0.05);
    sfxBus.gain.setTargetAtTime(settings.sfx * m, t, 0.05);
    if (ambGain) ambGain.gain.setTargetAtTime(settings.sfx * 0.05 * m, t, 0.2);
}
export function getVolumes() { return { ...settings }; }
export function setVolume(kind, v) {
    settings[kind] = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('sde_audio', JSON.stringify(settings)); } catch (e) { /* ignore */ }
    applyVolumes();
}

// ----- instruments -----
function env(g, t, a, peak, d, sustain, r, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
    if (end) { g.gain.setValueAtTime(Math.max(0.0001, sustain), end); g.gain.exponentialRampToValueAtTime(0.0001, end + r); }
}
function noise(t, dur, type, freq, q, gain, out) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out || musicBus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    return g;
}
function kick(t, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    g.gain.setValueAtTime(gain || 0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.35);
}
// Hand drum / tom: pitched sine thump with a little skin noise
function tom(t, f, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    g.gain.setValueAtTime(gain || 0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g); g.connect(musicBus); g.connect(reverb); o.start(t); o.stop(t + 0.3);
    noise(t, 0.04, 'bandpass', 1200, 1.5, (gain || 0.35) * 0.3, musicBus);
}
function clap(t) {
    for (let i = 0; i < 3; i++) noise(t + i * 0.011, 0.07, 'bandpass', 1500, 1.2, 0.16, musicBus);
    noise(t, 0.2, 'bandpass', 1700, 1, 0.06, reverb);
}
function shaker(t, gain) { noise(t, 0.05, 'highpass', 6500, 0.7, gain, musicBus); }
// Plucked bass: square through a closing lowpass
function bass(t, n, dur) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = midi(n);
    f.type = 'lowpass'; f.Q.value = 4; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    env(g, t, 0.005, 0.2, dur * 0.7, 0.08, 0.08, t + dur);
    o.connect(f).connect(g).connect(musicBus); o.start(t); o.stop(t + dur + 0.15);
}
// Marimba: sine with a quickly decaying 4th partial, short and woody
function marimba(t, n, gain) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain || 0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    g.connect(musicBus); g.connect(reverb);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n); o.connect(g);
    const p = ctx.createOscillator(), pg = ctx.createGain(); p.type = 'sine'; p.frequency.value = midi(n) * 4;
    pg.gain.setValueAtTime(0.4, t); pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    p.connect(pg).connect(g);
    o.start(t); o.stop(t + 0.5); p.start(t); p.stop(t + 0.06);
}
// Breathy whistle-flute: triangle + a puff of noise, with vibrato, sent into the echo
function flute(t, n, dur) {
    const g = ctx.createGain();
    env(g, t, 0.04, 0.08, 0.1, 0.06, 0.12, t + dur);
    g.connect(musicBus); g.connect(delay); g.connect(reverb);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(n);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.5; vg.gain.value = midi(n) * 0.006;
    vib.connect(vg).connect(o.frequency);
    o.connect(g); o.start(t); o.stop(t + dur + 0.2); vib.start(t); vib.stop(t + dur + 0.2);
    noise(t, 0.06, 'bandpass', midi(n) * 2, 2, 0.03, g);
}
// Bird call in the trees: a few quick rising chirps
function bird(t) {
    const base = 2200 + Math.random() * 1500;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        const s = t + i * 0.09;
        o.type = 'sine'; o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * 1.5, s + 0.05);
        g.gain.setValueAtTime(0.025, s); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.07);
        o.connect(g); g.connect(musicBus); g.connect(reverb); o.start(s); o.stop(s + 0.08);
    }
}

// One 16th-note step of the song. 16 bars: 2 bars of drums-only intro, then the groove; the
// flute melody plays in bars 4-7 and 10-15, bars 8-9 break down to toms and marimba.
function playStep(s, t) {
    const bar = Math.floor(s / 16) % 16, i = s % 16, chord = CHORDS[bar % 4];
    const intro = bar < 2, brk = bar === 8 || bar === 9;
    // Tribal toms pattern under everything
    if (i === 0 || i === 6 || i === 10) tom(t, i === 6 ? 140 : 100, 0.3);
    if (i === 14 && bar % 2) { tom(t, 180, 0.25); tom(t + STEP / 2, 160, 0.22); }
    if (!intro && !brk) {
        if (i === 0 || i === 8 || (i === 11 && bar % 2)) kick(t, i === 11 ? 0.35 : 0.6);
        if (i === 4 || i === 12) clap(t);
        for (const [at, semi] of BASS) if (at === i) bass(t, chord.root + semi, STEP * 1.6);
    }
    if (i % 2 === 0) shaker(t, i % 4 === 2 ? 0.05 : 0.025);
    // Marimba chord stabs on the off-beats
    if (!intro && (i === 2 || i === 6 || i === 10 || i === 13)) chord.notes.forEach((n, k) => marimba(t + k * 0.012, n + 12, 0.055));
    if (brk && i % 4 === 0) marimba(t, chord.notes[(i / 4) % 3] + 12, 0.1);
    const melody = (bar >= 4 && bar < 8) || bar >= 10;
    if (melody) {
        const phrase = bar >= 12 ? MELODY_B : MELODY_A;
        for (const [at, n, l] of phrase[bar % 4]) if (at === i) flute(t, n, STEP * l);
    }
    if (Math.random() < 0.012) bird(t + Math.random() * STEP);
}

function scheduler() {
    while (nextTime < ctx.currentTime + 0.12) {
        playStep(step, nextTime);
        nextTime += STEP;
        step++;
    }
}
export function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true;
    step = 0; nextTime = ctx.currentTime + 0.1;
    schedTimer = setInterval(scheduler, 25);
}
export function stopMusic() { musicOn = false; clearInterval(schedTimer); }

// ----- jungle ambience -----
// Soft wind through the leaves that swells and fades
function startJungle() {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 400; lfo.connect(lg).connect(f.frequency);
    ambGain = ctx.createGain(); ambGain.gain.value = 0;
    src.connect(f).connect(ambGain).connect(sfxBus);
    src.start(); lfo.start();
    applyVolumes();
}

// ----- sound effects -----
function tone(t, type, f0, f1, dur, gain, out) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
const SFX = {
    click(t) { tone(t, 'triangle', 900, 500, 0.06, 0.25); },
    jump(t) { tone(t, 'sine', 260, 620, 0.14, 0.25); },
    land(t) { noise(t, 0.12, 'lowpass', 500, 1, 0.35, sfxBus); tone(t, 'sine', 120, 60, 0.1, 0.3); },
    // Heavy dino footstep
    step(t) { tone(t, 'sine', 90 + Math.random() * 30, 45, 0.09, 0.09); noise(t, 0.05, 'lowpass', 700, 1, 0.05, sfxBus); },
    pickup(t) { tone(t, 'sine', midi(84), null, 0.12, 0.3); tone(t + 0.07, 'sine', midi(91), null, 0.22, 0.3); },
    gain(t) { tone(t, 'triangle', midi(84), null, 0.06, 0.07); },
    hit(t) { tone(t, 'sine', 180, 50, 0.25, 0.7); noise(t, 0.25, 'lowpass', 1200, 1, 0.5, sfxBus); },
    death(t) { tone(t, 'sawtooth', 420, 60, 0.7, 0.25); noise(t, 0.5, 'lowpass', 800, 1, 0.3, sfxBus); },
    chomp(t) { tone(t, 'square', 160, 60, 0.12, 0.35); tone(t + 0.12, 'square', 140, 50, 0.14, 0.35); noise(t, 0.3, 'lowpass', 900, 1, 0.4, sfxBus); },
    // T-Rex roar: two detuned growling saws with a noisy breath, falling in pitch
    roar(t) {
        const f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(300, t + 1.4);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        f.connect(g).connect(sfxBus);
        for (const det of [-1, 1]) {
            const o = ctx.createOscillator(); o.type = 'sawtooth';
            o.frequency.setValueAtTime(120 + det * 4, t); o.frequency.exponentialRampToValueAtTime(55 + det * 2, t + 1.4);
            const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 28; lg.gain.value = 18; lfo.connect(lg).connect(o.frequency);
            o.connect(f); o.start(t); o.stop(t + 1.55); lfo.start(t); lfo.stop(t + 1.55);
        }
        noise(t, 1.3, 'bandpass', 600, 0.8, 0.35, sfxBus);
    },
    levelUp(t) { [72, 76, 79, 84].forEach((n, i) => tone(t + i * 0.08, 'square', midi(n), null, 0.25, 0.12)); tone(t + 0.32, 'triangle', midi(88), null, 0.6, 0.2); },
    buy(t) { [79, 84, 88, 91, 96].forEach((n, i) => tone(t + i * 0.05, 'sine', midi(n), null, 0.3, 0.16)); },
    whoosh(t) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
        f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.35);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        src.connect(f).connect(g).connect(sfxBus); src.start(t); src.stop(t + 0.55);
    },
    cheer(t) {
        // Drum roll into a fanfare
        for (let i = 0; i < 6; i++) tone(t + i * 0.04, 'sine', 180 - i * 8, 90, 0.08, 0.2);
        [72, 76, 79, 84, 88].forEach((n, i) => tone(t + 0.25 + i * 0.07, 'square', midi(n), null, 0.3, 0.08));
        noise(t + 0.25, 0.6, 'highpass', 4000, 0.7, 0.12, sfxBus);
    },
    gate(t) {
        [84, 88, 91, 96, 100].forEach((n, i) => tone(t + i * 0.035, 'sine', midi(n), null, 0.5, 0.09));
        tone(t, 'triangle', 220, 880, 0.35, 0.12);
    },
    firework(t) { tone(t, 'sine', 900, 200, 0.35, 0.06); noise(t + 0.35, 0.4, 'lowpass', 2500, 0.8, 0.35, sfxBus); },
};
export function sfx(name) {
    if (!ctx || !SFX[name] || settings.sfx <= 0) return;
    SFX[name](ctx.currentTime + 0.005);
}
