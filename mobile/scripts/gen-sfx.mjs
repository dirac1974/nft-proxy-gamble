import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../src/assets/sounds");

const SAMPLE_RATE = 22050;
const BITS = 16;
const CHANNELS = 1;
const MAX_AMP = 32767;

/** Build a standard 44-byte PCM WAV header + interleaved samples */
function buildWav(samples) {
  const dataBytes = samples.length * 2; // 16-bit = 2 bytes per sample
  const buf = Buffer.alloc(44 + dataBytes);

  // RIFF chunk
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);

  // fmt sub-chunk
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);          // sub-chunk size
  buf.writeUInt16LE(1, 20);           // PCM
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), 28); // byte rate
  buf.writeUInt16LE(CHANNELS * (BITS / 8), 32);               // block align
  buf.writeUInt16LE(BITS, 34);

  // data sub-chunk
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (const s of samples) {
    // clamp to [-1, 1] then scale
    const clamped = Math.max(-1, Math.min(1, s));
    buf.writeInt16LE(Math.round(clamped * MAX_AMP), offset);
    offset += 2;
  }

  return buf;
}

/** Short linear fade-out over the last `fadeLen` samples */
function applyFadeOut(samples, fadeLen) {
  const start = Math.max(0, samples.length - fadeLen);
  for (let i = start; i < samples.length; i++) {
    const t = (i - start) / fadeLen;
    samples[i] *= 1 - t;
  }
}

/** Sine wave at `freq` Hz */
function sine(t, freq) {
  return Math.sin(2 * Math.PI * freq * t);
}

// ─── deal.wav ─── ~40 ms soft click: white-noise burst, fast exp decay ────────
function genDeal() {
  const n = Math.round(0.04 * SAMPLE_RATE); // 40 ms
  const samples = new Float32Array(n);
  const decay = 60; // 1/tau in 1/s — fast
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-decay * t);
    const noise = (Math.random() * 2 - 1);
    samples[i] = 0.5 * env * noise;
  }
  applyFadeOut(samples, Math.round(0.005 * SAMPLE_RATE));
  return samples;
}

// ─── hold.wav ─── ~80 ms 880 Hz sine blip, quick attack/decay ─────────────────
function genHold() {
  const n = Math.round(0.08 * SAMPLE_RATE);
  const samples = new Float32Array(n);
  const freq = 880;
  const attack = Math.round(0.005 * SAMPLE_RATE);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const decay = Math.exp(-25 * t);
    const att = i < attack ? i / attack : 1;
    samples[i] = 0.55 * att * decay * sine(t, freq);
  }
  applyFadeOut(samples, Math.round(0.008 * SAMPLE_RATE));
  return samples;
}

// ─── win.wav ─── ~600 ms ascending C5-E5-G5 sequential, gentle decay ──────────
function genWin() {
  const total = Math.round(0.6 * SAMPLE_RATE);
  const samples = new Float32Array(total);
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  const segLen = Math.round(total / notes.length);

  for (let n = 0; n < notes.length; n++) {
    const freq = notes[n];
    const start = n * segLen;
    const end = Math.min(start + segLen, total);
    for (let i = start; i < end; i++) {
      const t = (i - start) / SAMPLE_RATE;
      const env = Math.exp(-4 * t);
      const att = Math.min(1, (i - start) / (0.004 * SAMPLE_RATE));
      samples[i] = 0.55 * att * env * sine(t, freq);
    }
  }
  applyFadeOut(samples, Math.round(0.02 * SAMPLE_RATE));
  return samples;
}

// ─── bigWin.wav ─── ~1200 ms arpeggio fanfare C-E-G-C5 then flourish ──────────
function genBigWin() {
  const total = Math.round(1.2 * SAMPLE_RATE);
  const samples = new Float32Array(total);

  // Arpeggio: C4 E4 G4 C5 each ~150 ms, then G5 B5 stacked ~300 ms
  const arpNotes = [261.63, 329.63, 392.0, 523.25];
  const arpLen = Math.round(0.15 * SAMPLE_RATE);
  for (let n = 0; n < arpNotes.length; n++) {
    const freq = arpNotes[n];
    const start = n * arpLen;
    for (let i = start; i < start + arpLen && i < total; i++) {
      const t = (i - start) / SAMPLE_RATE;
      const env = Math.exp(-5 * t);
      const att = Math.min(1, (i - start) / (0.003 * SAMPLE_RATE));
      samples[i] += 0.5 * att * env * sine(t, freq);
    }
  }

  // Flourish chord: G5+B5+D6 stacked, starting at ~600 ms
  const flourishStart = Math.round(0.6 * SAMPLE_RATE);
  const flourishFreqs = [783.99, 987.77, 1174.66];
  for (let i = flourishStart; i < total; i++) {
    const t = (i - flourishStart) / SAMPLE_RATE;
    const env = Math.exp(-3 * t);
    const att = Math.min(1, (i - flourishStart) / (0.005 * SAMPLE_RATE));
    let v = 0;
    for (const freq of flourishFreqs) v += sine(t, freq);
    samples[i] += 0.18 * att * env * v; // /3 voices then gain
  }

  applyFadeOut(samples, Math.round(0.04 * SAMPLE_RATE));
  return samples;
}

// ─── lose.wav ─── ~200 ms descending 400→200 Hz, LOW gain 0.3 ─────────────────
function genLose() {
  const n = Math.round(0.2 * SAMPLE_RATE);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const frac = i / n;
    const freq = 400 - 200 * frac; // linear glide 400→200
    const env = Math.exp(-4 * t);
    const att = Math.min(1, i / (0.005 * SAMPLE_RATE));
    samples[i] = 0.3 * att * env * sine(t, freq);
  }
  applyFadeOut(samples, Math.round(0.01 * SAMPLE_RATE));
  return samples;
}

// ─── coin.wav ─── ~50 ms 1200 Hz tick, short sine fast decay ──────────────────
function genCoin() {
  const n = Math.round(0.05 * SAMPLE_RATE);
  const samples = new Float32Array(n);
  const freq = 1200;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-80 * t);
    const att = Math.min(1, i / (0.002 * SAMPLE_RATE));
    samples[i] = 0.55 * att * env * sine(t, freq);
  }
  applyFadeOut(samples, Math.round(0.005 * SAMPLE_RATE));
  return samples;
}

// ─── write all ────────────────────────────────────────────────────────────────
const files = [
  ["deal.wav",   genDeal()],
  ["hold.wav",   genHold()],
  ["win.wav",    genWin()],
  ["bigWin.wav", genBigWin()],
  ["lose.wav",   genLose()],
  ["coin.wav",   genCoin()],
];

for (const [name, samples] of files) {
  const outPath = path.join(OUT_DIR, name);
  const buf = buildWav(samples);
  fs.writeFileSync(outPath, buf);
  console.log(`  ${name.padEnd(12)} ${buf.length} bytes`);
}

console.log("done");
