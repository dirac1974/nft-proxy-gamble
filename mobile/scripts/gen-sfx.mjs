#!/usr/bin/env node
/**
 * gen-sfx.mjs — synthesize the classic video-poker cabinet sound effects.
 *
 * Pure Node, no external dependencies. Writes mono 16-bit PCM WAV files at
 * 22.05 kHz into mobile/src/assets/sounds/. Run from the mobile/ dir:
 *
 *   node scripts/gen-sfx.mjs
 *
 * Sounds produced:
 *   deal.wav   ~40ms  short click (card snapping onto the felt)
 *   hold.wav   ~80ms  880Hz blip (hold toggle)
 *   win.wav    ~600ms ascending C-E-G triad (paying hand)
 *   bigWin.wav ~1200ms arpeggio (premium hand)
 *   lose.wav   ~200ms descending low tone
 *   coin.wav   ~50ms  1200Hz tick (meter roll-up / coin drop)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22050;
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "assets", "sounds");

/** Build a 44-byte canonical WAV header for mono 16-bit PCM. */
function wavHeader(numSamples) {
  const byteRate = SAMPLE_RATE * 2; // mono, 2 bytes/sample
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);     // fmt chunk size
  buf.writeUInt16LE(1, 20);      // PCM
  buf.writeUInt16LE(1, 22);      // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(2, 32);      // block align
  buf.writeUInt16LE(16, 34);     // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

/** Render a float[-1,1] sample array to a WAV Buffer. */
function toWav(samples) {
  const header = wavHeader(samples.length);
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  return Buffer.concat([header, data]);
}

const n = (ms) => Math.floor((ms / 1000) * SAMPLE_RATE);

/** Linear attack / exponential-ish decay envelope. */
function env(i, total, attackMs = 4) {
  const a = n(attackMs);
  const attack = i < a ? i / a : 1;
  const t = i / total;
  const decay = Math.pow(1 - t, 1.6);
  return attack * decay;
}

function tone(freqHz, ms, { amp = 0.6, attackMs = 4, harmonics = [1] } = {}) {
  const total = n(ms);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (let h = 0; h < harmonics.length; h++) {
      v += harmonics[h] * Math.sin(2 * Math.PI * freqHz * (h + 1) * t);
    }
    v /= harmonics.reduce((s, x) => s + x, 0);
    out[i] = v * amp * env(i, total, attackMs);
  }
  return out;
}

function noiseClick(ms, { amp = 0.7 } = {}) {
  const total = n(ms);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const decay = Math.pow(1 - i / total, 4);
    out[i] = (Math.random() * 2 - 1) * amp * decay;
  }
  return out;
}

function concat(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

function mix(...arrs) {
  const total = Math.max(...arrs.map((a) => a.length));
  const out = new Float32Array(total);
  for (const a of arrs) for (let i = 0; i < a.length; i++) out[i] += a[i];
  return out;
}

// --- Note frequencies ---
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
const A5 = 880.0;

// deal: short filtered noise click
const deal = noiseClick(40, { amp: 0.6 });

// hold: 880Hz blip
const hold = tone(A5, 80, { amp: 0.55, harmonics: [1, 0.3] });

// win: ascending C-E-G triad (each note ~200ms)
const win = concat(
  tone(C5, 200, { amp: 0.55, harmonics: [1, 0.4, 0.15] }),
  tone(E5, 200, { amp: 0.55, harmonics: [1, 0.4, 0.15] }),
  tone(G5, 200, { amp: 0.6, harmonics: [1, 0.4, 0.15] }),
);

// bigWin: faster arpeggio up two octaves, ringing
const bigWin = concat(
  tone(C5, 150, { amp: 0.5, harmonics: [1, 0.5, 0.2] }),
  tone(E5, 150, { amp: 0.5, harmonics: [1, 0.5, 0.2] }),
  tone(G5, 150, { amp: 0.55, harmonics: [1, 0.5, 0.2] }),
  tone(C6, 150, { amp: 0.6, harmonics: [1, 0.5, 0.2] }),
  mix(
    tone(C6, 600, { amp: 0.45, harmonics: [1, 0.5, 0.25] }),
    tone(G5, 600, { amp: 0.3, harmonics: [1, 0.4] }),
    tone(E5, 600, { amp: 0.25, harmonics: [1, 0.4] }),
  ),
);

// lose: descending low tone (sad trombone-ish)
const lose = concat(
  tone(220, 100, { amp: 0.5, harmonics: [1, 0.6, 0.3] }),
  tone(174.61, 100, { amp: 0.45, harmonics: [1, 0.6, 0.3] }),
);

// coin: high 1200Hz tick
const coin = tone(1200, 50, { amp: 0.45, attackMs: 1, harmonics: [1, 0.2] });

const FILES = {
  "deal.wav": deal,
  "hold.wav": hold,
  "win.wav": win,
  "bigWin.wav": bigWin,
  "lose.wav": lose,
  "coin.wav": coin,
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, samples] of Object.entries(FILES)) {
  const wav = toWav(samples);
  writeFileSync(join(OUT_DIR, name), wav);
  console.log(`wrote ${name} (${samples.length} samples, ${(wav.length / 1024).toFixed(1)} KiB)`);
}
console.log(`\nDone — ${Object.keys(FILES).length} WAVs in ${OUT_DIR}`);
