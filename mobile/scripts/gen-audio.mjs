#!/usr/bin/env node
// Generates every game sound + dealer voice line with ElevenLabs, then writes
// src/assets/sounds/manifest.ts. Run from mobile/:
//
//   ELEVENLABS_API_KEY=... node scripts/gen-audio.mjs            # fill in missing files
//   ELEVENLABS_API_KEY=... node scripts/gen-audio.mjs --force    # regenerate everything
//   node scripts/gen-audio.mjs --sfx-fallback                    # procedural SFX only (no key)
//
// SFX use /v1/sound-generation (key needs the `sound_generation` permission).
// When that call is not permitted, a procedurally synthesised WAV is written
// instead so the game is never silent; re-run later to upgrade it to ElevenLabs.
// Voice uses /v1/text-to-speech (key needs `text_to_speech`).
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "..", "src", "assets", "sounds");
const API = "https://api.elevenlabs.io/v1";
const KEY = process.env.ELEVENLABS_API_KEY;
const FORCE = process.argv.includes("--force");
const SFX_FALLBACK_ONLY = process.argv.includes("--sfx-fallback");

// Calm, low British male — reads as a croupier. Override with ELEVENLABS_VOICE_ID.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const VOICE_MODEL = "eleven_multilingual_v2";
const VOICE_SETTINGS = { stability: 0.6, similarity_boost: 0.8, style: 0.12, use_speaker_boost: true };

export const SFX = {
  ui_tap: { prompt: "soft muted wooden UI click, very short, premium, no reverb", seconds: 0.5 },
  ui_toggle: { prompt: "subtle soft felt tap with a faint tick, short UI selection sound", seconds: 0.5 },
  chip_place: { prompt: "single clay casino poker chip placed down on felt table, crisp close-up", seconds: 0.6 },
  chip_collect: { prompt: "dealer sweeping a small stack of clay casino chips across felt", seconds: 1.0 },
  card_deal: { prompt: "single playing card slid quickly across a felt casino table, close-up", seconds: 0.5 },
  card_flip: { prompt: "playing card flipped over onto felt table, crisp light snap", seconds: 0.5 },
  card_hold: { prompt: "soft low tactile click, muted button, short", seconds: 0.5 },
  shuffle: { prompt: "casino dealer riffle shuffle of playing cards, short and clean", seconds: 1.6 },
  win_small: { prompt: "two soft warm chime notes, elegant and brief, casino win, no voice", seconds: 1.0 },
  win_medium: { prompt: "warm ascending three-note bell chime with light sparkle, elegant casino win", seconds: 1.6 },
  win_big: { prompt: "luxurious short orchestral swell with soft bells and a cascade of casino chips, classy celebration", seconds: 3.5 },
  count_tick: { prompt: "tiny soft coin tick, single short metallic click", seconds: 0.5 },
  push: { prompt: "neutral soft single thud on felt, understated", seconds: 0.5 },
  lose: { prompt: "very soft low muted felt tap, neutral, not sad", seconds: 0.5 },
  roulette_spin: { prompt: "roulette wheel spinning with ivory ball rolling around the wooden track, gradually slowing down", seconds: 3.6 },
  ball_drop: { prompt: "roulette ball bouncing between metal pocket separators then settling into a pocket", seconds: 1.4 },
};

export const VOICE = {
  vo_welcome: "Welcome to the table.",
  vo_good_luck: "Good luck.",
  vo_place_bets: "Place your bets.",
  vo_no_more_bets: "No more bets.",
  vo_blackjack: "Blackjack.",
  vo_dealer_bj: "Dealer has blackjack.",
  vo_insurance: "Insurance?",
  vo_dealer_bust: "Dealer busts.",
  vo_push: "Push.",
  vo_royal: "Royal flush.",
  vo_straight_flush: "Straight flush.",
  vo_four_kind: "Four of a kind.",
  vo_four_deuces: "Four deuces.",
};

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
  "Twenty-one", "Twenty-two", "Twenty-three", "Twenty-four", "Twenty-five", "Twenty-six", "Twenty-seven",
  "Twenty-eight", "Twenty-nine", "Thirty", "Thirty-one", "Thirty-two", "Thirty-three", "Thirty-four",
  "Thirty-five", "Thirty-six",
];
const numberLine = (n) => (n === 0 ? "Zero. Green." : `${WORDS[n]}. ${RED.has(n) ? "Red" : "Black"}.`);

function existing(base) {
  for (const ext of [".mp3", ".wav"]) if (existsSync(join(OUT, base + ext))) return base + ext;
  return null;
}

async function eleven(path, body, outFile) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  writeFileSync(join(OUT, outFile), Buffer.from(await res.arrayBuffer()));
}

// ---------- procedural fallback synth (mono 16-bit 44.1k WAV) ----------
const SR = 44100;
const len = (s) => Math.floor(s * SR);
function wav(samples) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + samples.length * 2, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(samples.length * 2, 40);
  const d = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const g = peak > 0 ? 0.89 / peak : 1;
  samples.forEach((s, i) => d.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * g)) * 32767), i * 2));
  return Buffer.concat([h, d]);
}
let seed = 1234567;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
function lowpass(x, cutoff) {
  const a = Math.exp((-2 * Math.PI * cutoff) / SR); let y = 0;
  return x.map((v) => (y = (1 - a) * v + a * y));
}
function highpass(x, cutoff) {
  const lp = lowpass(x, cutoff); return x.map((v, i) => v - lp[i]);
}
function noiseBurst(dur, attack, decay, lo, hi) {
  const n = len(dur); let x = Array.from({ length: n }, rnd);
  x = highpass(lowpass(x, hi), lo);
  return x.map((v, i) => { const t = i / SR; return v * Math.min(1, t / attack) * Math.exp(-t / decay); });
}
function bell(freq, dur, decay, amp = 1) {
  const n = len(dur);
  return Array.from({ length: n }, (_, i) => {
    const t = i / SR;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / decay);
    return amp * env * (Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(2 * Math.PI * freq * 2.76 * t) * Math.exp(-t / (decay * 0.4)) + 0.2 * Math.sin(2 * Math.PI * freq * 5.4 * t) * Math.exp(-t / (decay * 0.2)));
  });
}
function mix(total, ...parts) {
  const out = new Array(len(total)).fill(0);
  for (const [sig, at, gain = 1] of parts) {
    const o = len(at);
    sig.forEach((v, i) => { if (o + i < out.length) out[o + i] += v * gain; });
  }
  return out;
}
function clack(f = 2400) {
  return mix(0.12, [noiseBurst(0.08, 0.0005, 0.012, 1500, 9000), 0], [bell(f, 0.1, 0.02, 0.5), 0]);
}
const FALLBACK = {
  ui_tap: () => mix(0.06, [noiseBurst(0.05, 0.0005, 0.006, 800, 5000), 0]),
  ui_toggle: () => mix(0.08, [noiseBurst(0.06, 0.0005, 0.008, 1200, 7000), 0], [bell(1800, 0.05, 0.012, 0.25), 0]),
  chip_place: () => mix(0.2, [clack(2600), 0], [clack(3100), 0.035, 0.45]),
  chip_collect: () => mix(0.9, ...Array.from({ length: 9 }, (_, i) => [clack(2200 + (i % 3) * 400), 0.05 + i * 0.07 + rnd() * 0.02, 0.6]), [noiseBurst(0.8, 0.1, 0.25, 300, 3000), 0, 0.35]),
  card_deal: () => mix(0.22, [noiseBurst(0.16, 0.02, 0.04, 2000, 10000), 0], [noiseBurst(0.04, 0.0005, 0.008, 600, 4000), 0.12, 0.8]),
  card_flip: () => mix(0.14, [noiseBurst(0.06, 0.008, 0.015, 2500, 11000), 0], [noiseBurst(0.04, 0.0005, 0.006, 700, 5000), 0.05, 0.9]),
  card_hold: () => mix(0.08, [noiseBurst(0.05, 0.0005, 0.007, 300, 2500), 0], [bell(620, 0.06, 0.015, 0.35), 0]),
  shuffle: () => mix(1.4, ...Array.from({ length: 34 }, (_, i) => [noiseBurst(0.03, 0.001, 0.008, 2500, 9000), 0.15 + i * 0.03, 0.5]), [noiseBurst(0.12, 0.005, 0.04, 400, 4000), 1.25]),
  win_small: () => mix(1.0, [bell(1046.5, 1.0, 0.35), 0], [bell(1568, 0.9, 0.35), 0.12]),
  win_medium: () => mix(1.6, [bell(784, 1.4, 0.45), 0], [bell(1046.5, 1.3, 0.45), 0.13], [bell(1318.5, 1.2, 0.5), 0.26], [bell(2093, 1.0, 0.3, 0.3), 0.4]),
  win_big: () => mix(3.4,
    ...[523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093].map((f, i) => [bell(f, 2.4, 0.8, 0.8), i * 0.11]),
    ...Array.from({ length: 22 }, (_, i) => [clack(2400 + (i % 4) * 300), 0.9 + i * 0.07 + rnd() * 0.03, 0.35])),
  count_tick: () => mix(0.05, [bell(2600, 0.04, 0.008, 0.6), 0], [noiseBurst(0.02, 0.0003, 0.003, 3000, 12000), 0, 0.4]),
  push: () => mix(0.25, [noiseBurst(0.2, 0.002, 0.05, 80, 900), 0]),
  lose: () => mix(0.22, [noiseBurst(0.18, 0.002, 0.04, 60, 700), 0, 0.8]),
  roulette_spin: () => {
    const n = len(3.5); const out = new Array(n).fill(0);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR; const speed = 14 * Math.pow(1 - t / 3.7, 1.6) + 1.2;
      phase += speed / SR; const frac = phase % 1;
      out[i] = (frac < 0.012 ? rnd() * 0.6 : 0) + rnd() * 0.05 * (1 - t / 3.6);
    }
    return lowpass(highpass(out, 400), 7000);
  },
  ball_drop: () => mix(1.3, ...[0, 0.18, 0.32, 0.43, 0.52, 0.6, 0.66].map((at, i) => [clack(3400 - i * 150), at, 1 - i * 0.12]), [noiseBurst(0.3, 0.005, 0.08, 200, 2000), 0.75, 0.3]),
};

// ---------- classic video-poker cabinet set (always synthesised) ----------
// Genre-convention electronic tones, ORIGINAL compositions — no vendor audio.
function tone(freq, dur, { wave = "square", attack = 0.002, decay = 0.08, amp = 1, glideTo = null } = {}) {
  const n = len(dur);
  const nyq = 8000;
  let phase = 0;
  return Array.from({ length: n }, (_, i) => {
    const t = i / SR;
    const f = glideTo ? freq + (glideTo - freq) * (t / dur) : freq;
    phase += (2 * Math.PI * f) / SR;
    let v = 0;
    if (wave === "square") {
      for (let h = 1; h * f < nyq && h <= 15; h += 2) v += Math.sin(phase * h) / h;
      v *= 0.8;
    } else if (wave === "triangle") {
      for (let h = 1, k = 0; h * f < nyq && h <= 15; h += 2, k++) v += ((k % 2 ? -1 : 1) * Math.sin(phase * h)) / (h * h);
    } else v = Math.sin(phase);
    const env = Math.min(1, t / attack) * Math.exp(-t / decay);
    return amp * v * env;
  });
}
const NOTE = (semis) => 440 * Math.pow(2, semis / 12); // semis from A4
const C6 = NOTE(15), D6 = NOTE(17), E6 = NOTE(19), G6 = NOTE(22), A6 = NOTE(24), C7 = NOTE(27);
const CABINET = {
  vp_bet1: () => tone(C6, 0.07, { decay: 0.03, amp: 0.7 }),
  vp_bet2: () => tone(D6, 0.07, { decay: 0.03, amp: 0.7 }),
  vp_bet3: () => tone(E6, 0.07, { decay: 0.03, amp: 0.7 }),
  vp_bet4: () => tone(G6, 0.07, { decay: 0.03, amp: 0.7 }),
  vp_bet5: () => mix(0.16, [tone(A6, 0.07, { decay: 0.03, amp: 0.7 }), 0], [tone(C7, 0.09, { decay: 0.04, amp: 0.7 }), 0.06]),
  vp_deal: () => mix(0.04, [tone(1760, 0.03, { decay: 0.006, amp: 0.8 }), 0], [noiseBurst(0.02, 0.0003, 0.003, 2000, 9000), 0, 0.25]),
  vp_draw: () => mix(0.04, [tone(1480, 0.03, { decay: 0.006, amp: 0.8 }), 0], [noiseBurst(0.02, 0.0003, 0.003, 2000, 9000), 0, 0.25]),
  vp_hold: () => tone(1046.5, 0.07, { decay: 0.04, amp: 0.7, glideTo: 1568 }),
  vp_unhold: () => tone(1568, 0.06, { decay: 0.03, amp: 0.55, glideTo: 1046.5 }),
  vp_credit_tick: () => tone(2349, 0.03, { wave: "triangle", decay: 0.008, amp: 0.8 }),
  vp_game_over: () => mix(0.32, [tone(NOTE(3), 0.14, { wave: "triangle", decay: 0.06 }), 0], [tone(NOTE(-2), 0.2, { wave: "triangle", decay: 0.09 }), 0.11]),
  // Original 5-note figure: G5 C6 E6 G6 (hold) C7
  vp_win: () => mix(0.8,
    ...[NOTE(10), C6, E6, G6].map((f, i) => [tone(f, 0.12, { decay: 0.06, amp: 0.6 }), i * 0.075]),
    [tone(C7, 0.45, { decay: 0.2, amp: 0.6 }), 0.3], [tone(C7 / 2, 0.45, { wave: "triangle", decay: 0.2, amp: 0.5 }), 0.3]),
  // Original longer fanfare: rising arpeggio run, trill, resolving chord.
  vp_win_big: () => {
    const run = [NOTE(3), NOTE(7), NOTE(10), C6, E6, G6, C7, G6, C7, E6 * 2];
    const parts = run.map((f, i) => [tone(f, 0.11, { decay: 0.06, amp: 0.55 }), i * 0.07]);
    for (let i = 0; i < 10; i++) parts.push([tone(i % 2 ? C7 : NOTE(29), 0.06, { decay: 0.04, amp: 0.45 }), 0.75 + i * 0.06]);
    for (const f of [C6, E6, G6, C7]) parts.push([tone(f, 0.9, { decay: 0.4, amp: 0.4 }), 1.4]);
    parts.push([tone(C6 / 4, 0.9, { wave: "triangle", decay: 0.4, amp: 0.6 }), 1.4]);
    return mix(2.4, ...parts);
  },
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const failures = [];
  let sfxPermission = !!KEY && !SFX_FALLBACK_ONLY;

  for (const [key, spec] of Object.entries(SFX)) {
    const have = existing(key);
    if (have?.endsWith(".mp3") && !FORCE) continue; // already an ElevenLabs render
    if (sfxPermission) {
      try {
        await eleven("/sound-generation?output_format=mp3_44100_128", {
          text: spec.prompt,
          duration_seconds: spec.seconds,
          prompt_influence: 0.6,
        }, `${key}.mp3`);
        if (existsSync(join(OUT, `${key}.wav`))) unlinkSync(join(OUT, `${key}.wav`));
        console.log(`sfx  ${key}.mp3  (ElevenLabs)`);
        continue;
      } catch (e) {
        if (e.status === 401 || e.status === 403) {
          console.warn(`sound-generation not permitted for this key — using procedural fallback. (${e.message})`);
          sfxPermission = false;
        } else {
          failures.push(`${key}: ${e.message}`);
        }
      }
    }
    if (!have || FORCE) {
      writeFileSync(join(OUT, `${key}.wav`), wav(FALLBACK[key]()));
      console.log(`sfx  ${key}.wav  (procedural fallback)`);
    }
  }

  for (const [key, synth] of Object.entries(CABINET)) {
    if (existing(key) && !FORCE) continue;
    writeFileSync(join(OUT, `${key}.wav`), wav(synth()));
    console.log(`cab  ${key}.wav`);
  }

  if (KEY && !SFX_FALLBACK_ONLY) {
    const lines = { ...VOICE };
    for (let n = 0; n <= 36; n++) lines[`vo_n${n}`] = numberLine(n);
    for (const [key, text] of Object.entries(lines)) {
      if (existing(key) && !FORCE) continue;
      try {
        await eleven(`/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
          text,
          model_id: VOICE_MODEL,
          voice_settings: VOICE_SETTINGS,
        }, `${key}.mp3`);
        console.log(`voice ${key}.mp3  "${text}"`);
      } catch (e) {
        failures.push(`${key}: ${e.message}`);
      }
    }
  }

  writeManifest();
  if (failures.length) {
    console.error("\nFailures:\n" + failures.join("\n"));
    process.exitCode = 1;
  }
}

function writeManifest() {
  const files = new Set(readdirSync(OUT));
  const pick = (base) => (files.has(`${base}.mp3`) ? `${base}.mp3` : files.has(`${base}.wav`) ? `${base}.wav` : null);
  const sfxLines = [...Object.keys(SFX), ...Object.keys(CABINET)].map((k) => {
    const f = pick(k);
    return f ? `  ${k}: require("./${f}") as number,` : null;
  }).filter(Boolean);
  const voiceLines = Object.keys(VOICE).map((k) => {
    const f = pick(k);
    return f ? `  ${k}: require("./${f}") as number,` : `  ${k}: undefined,`;
  });
  const numLines = Array.from({ length: 37 }, (_, n) => {
    const f = pick(`vo_n${n}`);
    return f ? `  require("./${f}") as number,` : "  undefined,";
  });
  const src = `// AUTO-GENERATED by scripts/gen-audio.mjs — do not edit by hand.
/* eslint-disable @typescript-eslint/no-require-imports */

export const SFX_ASSETS = {
${sfxLines.join("\n")}
} as const;

export const VOICE_ASSETS: Record<${Object.keys(VOICE).map((k) => `"${k}"`).join(" | ")}, number | undefined> = {
${voiceLines.join("\n")}
};

export const ROULETTE_NUMBER_ASSETS: (number | undefined)[] = [
${numLines.join("\n")}
];
`;
  writeFileSync(join(OUT, "manifest.ts"), src);
  console.log("wrote src/assets/sounds/manifest.ts");
}

main();
