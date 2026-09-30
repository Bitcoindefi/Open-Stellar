// Procedurally synthesizes the city soundtrack assets as real WAV files.
// No external deps — plain PCM synthesis + a hand-rolled WAV header.
// Run with: node scripts/generate-audio-assets.mjs
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SAMPLE_RATE = 44100
const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_AUDIO = join(__dirname, "..", "public", "audio")

// -------- PRNG (deterministic so re-runs are reproducible) --------

function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// -------- low-level buffer helpers --------

function silence(seconds) {
  return new Float64Array(Math.round(seconds * SAMPLE_RATE))
}

function addSine(buf, freq, ampFn, opts = {}) {
  const phase = opts.phase ?? 0
  const startSample = Math.round((opts.startSec ?? 0) * SAMPLE_RATE)
  const lenSamples = Math.round((opts.durSec ?? buf.length / SAMPLE_RATE) * SAMPLE_RATE)
  const freqEnd = opts.freqEnd ?? freq
  for (let i = 0; i < lenSamples; i++) {
    const idx = startSample + i
    if (idx < 0 || idx >= buf.length) continue
    const t = i / SAMPLE_RATE
    const localDur = lenSamples / SAMPLE_RATE
    const f = freq + (freqEnd - freq) * (localDur > 0 ? t / localDur : 0)
    const amp = typeof ampFn === "function" ? ampFn(t, localDur) : ampFn
    buf[idx] += amp * Math.sin(2 * Math.PI * f * t + phase)
  }
}

function lowpassInPlace(arr, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz)
  const dt = 1 / SAMPLE_RATE
  const alpha = dt / (rc + dt)
  let prev = 0
  for (let i = 0; i < arr.length; i++) {
    prev = prev + alpha * (arr[i] - prev)
    arr[i] = prev
  }
}

function highpassInPlace(arr, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz)
  const dt = 1 / SAMPLE_RATE
  const alpha = rc / (rc + dt)
  let prevIn = 0
  let prevOut = 0
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i]
    const y = alpha * (prevOut + x - prevIn)
    prevOut = y
    prevIn = x
    arr[i] = y
  }
}

function addNoiseBand(buf, rng, ampFn, opts = {}) {
  const startSample = Math.round((opts.startSec ?? 0) * SAMPLE_RATE)
  const lenSamples = Math.round((opts.durSec ?? buf.length / SAMPLE_RATE) * SAMPLE_RATE)
  const band = new Float64Array(lenSamples)
  for (let i = 0; i < lenSamples; i++) band[i] = rng() * 2 - 1
  if (opts.lowpassHz) lowpassInPlace(band, opts.lowpassHz)
  if (opts.highpassHz) highpassInPlace(band, opts.highpassHz)
  for (let i = 0; i < lenSamples; i++) {
    const idx = startSample + i
    if (idx < 0 || idx >= buf.length) continue
    const t = i / SAMPLE_RATE
    const localDur = lenSamples / SAMPLE_RATE
    const amp = typeof ampFn === "function" ? ampFn(t, localDur) : ampFn
    buf[idx] += amp * band[i]
  }
}

// A short transient: blend of a (possibly pitch-sweeping) tone and noise, with
// an exponential decay envelope. Used for clicks, pings, kicks, snares.
function addTransient(buf, atSec, durSec, amp, opts = {}) {
  const startIdx = Math.round(atSec * SAMPLE_RATE)
  const lenSamples = Math.round(durSec * SAMPLE_RATE)
  const freq = opts.freq
  const freqEnd = opts.freqEnd ?? freq
  const noiseAmt = opts.noiseAmt ?? 0
  const rng = opts.rng ?? Math.random
  const decay = opts.decayFactor ?? 0.3
  const lowpassHz = opts.lowpassHz
  const highpassHz = opts.highpassHz

  const noiseBuf = noiseAmt > 0 ? new Float64Array(lenSamples) : null
  if (noiseBuf) {
    for (let i = 0; i < lenSamples; i++) noiseBuf[i] = rng() * 2 - 1
    if (lowpassHz) lowpassInPlace(noiseBuf, lowpassHz)
    if (highpassHz) highpassInPlace(noiseBuf, highpassHz)
  }

  for (let i = 0; i < lenSamples; i++) {
    const idx = startIdx + i
    if (idx < 0 || idx >= buf.length) continue
    const t = i / SAMPLE_RATE
    const env = Math.exp(-t / (durSec * decay))
    const f = freq != null ? freq + (freqEnd - freq) * (t / durSec) : 0
    const tone = freq != null ? Math.sin(2 * Math.PI * f * t) : 0
    const noiseV = noiseBuf ? noiseBuf[i] : 0
    buf[idx] += amp * env * (tone * (1 - noiseAmt) + noiseV * noiseAmt)
  }
}

function addPulseTrain(buf, periodSec, totalSec, amp, makeOpts) {
  const count = Math.round(totalSec / periodSec)
  for (let n = 0; n < count; n++) {
    const at = n * periodSec
    const opts = typeof makeOpts === "function" ? makeOpts(n) : makeOpts
    addTransient(buf, at, opts.durSec ?? 0.05, amp, opts)
  }
}

function normalize(buf, targetPeak = 0.9) {
  let peak = 0
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]))
  if (peak <= targetPeak || peak === 0) return
  const scale = targetPeak / peak
  for (let i = 0; i < buf.length; i++) buf[i] *= scale
}

function fadeInOut(buf, fadeSec) {
  const fadeSamples = Math.min(Math.round(fadeSec * SAMPLE_RATE), Math.floor(buf.length / 2))
  for (let i = 0; i < fadeSamples; i++) {
    const g = i / fadeSamples
    buf[i] *= g
    buf[buf.length - 1 - i] *= g
  }
}

// Builds a buffer that is `duration + crossfadeSec` long via `build`, then
// overlap-blends the trailing crossfade window into the head so the clip
// loops seamlessly when played with AudioBufferSourceNode.loop = true.
function buildLoopable(duration, crossfadeSec, build) {
  const total = duration + crossfadeSec
  const raw = silence(total)
  build(raw, total)
  normalize(raw)

  const durSamples = Math.round(duration * SAMPLE_RATE)
  const fadeSamples = Math.round(crossfadeSec * SAMPLE_RATE)
  const out = raw.slice(0, durSamples)
  for (let i = 0; i < fadeSamples; i++) {
    const ratio = i / fadeSamples
    const tailIdx = durSamples + i
    const tailVal = tailIdx < raw.length ? raw[tailIdx] : 0
    out[i] = out[i] * ratio + tailVal * (1 - ratio)
  }
  return out
}

function buildOneShot(duration, build) {
  const buf = silence(duration)
  build(buf, duration)
  normalize(buf)
  fadeInOut(buf, Math.min(0.005, duration / 6))
  return buf
}

// -------- WAV encoding --------

function encodeWav(samples) {
  const numChannels = 1
  const bitsPerSample = 16
  const blockAlign = (numChannels * bitsPerSample) / 8
  const byteRate = SAMPLE_RATE * blockAlign
  const dataSize = samples.length * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write("RIFF", 0, "ascii")
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write("WAVE", 8, "ascii")
  buffer.write("fmt ", 12, "ascii")
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write("data", 36, "ascii")
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }
  return buffer
}

function writeTrack(relativePath, buf) {
  const filePath = join(PUBLIC_AUDIO, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, encodeWav(buf))
  console.log(`wrote ${relativePath} (${(buf.length / SAMPLE_RATE).toFixed(2)}s)`)
}

// ==================== District ambient loops ====================

const LOOP_DURATION = 6
const CROSSFADE = 0.45

function dataCenterDay(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    addSine(buf, 58, (t) => 0.075 + Math.sin((2 * Math.PI * t) / total) * 0.012)
    addSine(buf, 116, 0.026)
    addSine(buf, 174, 0.009)
    addNoiseBand(buf, rng, 0.012, { lowpassHz: 850, highpassHz: 180 })
    // Soft, uneven terminal ticks sit behind the low server-room bed.
    let t = 0
    while (t < buf.length / SAMPLE_RATE) {
      t += 0.32 + rng() * 0.46
      addTransient(buf, t, 0.045, 0.045, { noiseAmt: 0.8, rng, freq: 1450 + rng() * 450, lowpassHz: 2600, highpassHz: 900, decayFactor: 0.42 })
    }
  })
}

function dataCenterNight(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    addSine(buf, 41.2, (t) => 0.08 + 0.012 * Math.sin((2 * Math.PI * t) / total))
    addSine(buf, 82.4, 0.022)
    addSine(buf, 123.5, 0.008)
    let t = 0
    while (t < total) {
      t += 0.75 + rng() * 1.2
      addTransient(buf, t, 0.12, 0.035, { freq: 980 + rng() * 260, noiseAmt: 0.12, rng, highpassHz: 1600, decayFactor: 0.5 })
    }
  })
}

function commHubDay(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    addNoiseBand(buf, rng, 0.012, { lowpassHz: 3200, highpassHz: 420 })
    addSine(buf, 110, 0.018)
    for (let n = 0, at = 0.25; at < total; n++, at += 1.28 + (n % 2) * 0.12) {
      const freq = n % 3 === 0 ? 659.25 : n % 3 === 1 ? 987.77 : 783.99
      addTransient(buf, at, 0.22, 0.085, { freq, freqEnd: freq * 1.015, decayFactor: 0.72 })
      if (n % 2 === 0) addTransient(buf, at + 0.16, 0.16, 0.035, { freq: freq * 1.5, decayFactor: 0.8 })
    }
  })
}

function commHubNight(_rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    addSine(buf, 55, 0.035)
    const chords = [[146.83, 174.61, 220], [130.81, 164.81, 196]]
    for (let chordIndex = 0; chordIndex < chords.length; chordIndex++) {
      const start = chordIndex * (total / 2)
      for (const freq of chords[chordIndex]) {
        addSine(buf, freq, (t, d) => 0.038 * Math.min(1, t / 0.5) * (0.88 + 0.12 * Math.sin(2 * Math.PI * t / d)), { startSec: start, durSec: total / 2 })
        addSine(buf, freq * 2, (t) => 0.008 * Math.min(1, t / 0.7), { startSec: start, durSec: total / 2 })
      }
    }
  })
}

function processingDay(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    const pitches = [261.63, 329.63, 392, 523.25, 392, 329.63]
    let t = 0
    let i = 0
    while (t < total) {
      const freq = pitches[i % pitches.length]
      addSine(buf, freq, (lt, ld) => 0.075 * Math.sin(Math.PI * Math.min(1, lt / Math.min(0.035, ld * 0.2))) * Math.exp(-lt / (ld * 0.58)), {
        startSec: t,
        durSec: 0.26,
      })
      addSine(buf, freq * 2.01, (lt, ld) => 0.014 * Math.exp(-lt / (ld * 0.24)), { startSec: t, durSec: 0.12 })
      t += 0.34
      i++
    }
    addPulseTrain(buf, 0.68, total, 0.022, { durSec: 0.035, noiseAmt: 0.45, freq: 1200, rng, decayFactor: 0.3, highpassHz: 1200 })
  })
}

function processingNight(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    addSine(buf, 49, 0.04)
    addPulseTrain(buf, 0.75, total, 0.085, { durSec: 0.18, freq: 88, freqEnd: 48, decayFactor: 0.34 })
    addPulseTrain(buf, 1.5, total, 0.035, { durSec: 0.22, freq: 55, decayFactor: 0.48 })
    addPulseTrain(buf, 0.375, total, 0.018, { durSec: 0.045, noiseAmt: 0.8, rng, highpassHz: 4300, decayFactor: 0.28 })
  })
}

function defenseDay(_rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    addSine(buf, 55, 0.032)
    addPulseTrain(buf, 1.5, total, 0.075, { durSec: 0.16, freq: 74, freqEnd: 42, decayFactor: 0.4 })
    for (const at of [0.35, 2.1, 3.65, 5.1]) {
      addTransient(buf, at, 0.28, 0.06, { freq: 740, freqEnd: 510, decayFactor: 0.75 })
      addTransient(buf, at + 0.2, 0.18, 0.025, { freq: 1110, decayFactor: 0.7 })
    }
  })
}

function defenseNight(_rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, _total) => {
    addSine(buf, 55, 0.045)
    addSine(buf, 82.41, 0.018)
    for (const at of [0.45, 2.4, 4.35]) {
      addTransient(buf, at, 0.2, 0.06, { freq: 980, freqEnd: 720, decayFactor: 0.62 })
      addTransient(buf, at + 0.22, 0.16, 0.025, { freq: 740, decayFactor: 0.72 })
    }
  })
}

function researchDay(_rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, _total) => {
    for (const freq of [220, 277.18, 329.63]) addSine(buf, freq, 0.025)
    for (const [index, at] of [0.35, 1.4, 2.45, 3.5, 4.55, 5.55].entries()) {
      const freq = [659.25, 783.99, 987.77, 783.99, 659.25, 523.25][index]
      addTransient(buf, at, 0.46, 0.07, { freq, freqEnd: freq * 0.997, decayFactor: 0.86 })
      addTransient(buf, at + 0.09, 0.35, 0.018, { freq: freq * 2, decayFactor: 0.9 })
    }
  })
}

function researchNight(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    for (const freq of [261.63, 329.63, 392, 493.88]) {
      addSine(buf, freq, (t) => 0.025 + 0.008 * Math.sin(2 * Math.PI * 0.25 * t + freq), { freqEnd: freq * 1.002 })
    }
    addNoiseBand(buf, rng, (t) => 0.009 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / total)), {
      lowpassHz: 2400,
      highpassHz: 500,
    })
    for (const at of [0.8, 3.8]) addTransient(buf, at, 0.6, 0.045, { freq: at < 2 ? 880 : 1046.5, freqEnd: at < 2 ? 880 : 1046.5, decayFactor: 0.9 })
  })
}

// ==================== Event stings ====================

function taskComplete() {
  return buildOneShot(0.42, (buf) => {
    addTransient(buf, 0, 0.34, 0.24, { freq: 784, freqEnd: 1046.5, decayFactor: 0.85 })
    addTransient(buf, 0.09, 0.28, 0.12, { freq: 1174.66, decayFactor: 0.8 })
    addTransient(buf, 0.18, 0.2, 0.055, { freq: 1568, decayFactor: 0.72 })
  })
}

function paymentReceived() {
  return buildOneShot(0.58, (buf) => {
    const notes = [659.25, 830.61, 987.77, 1318.5]
    let t = 0
    for (const freq of notes) {
      addTransient(buf, t, 0.32, 0.18, { freq, freqEnd: freq * 1.006, decayFactor: 0.82 })
      t += 0.085
    }
    addNoiseBand(buf, makeRng(7), (t) => 0.012 * Math.exp(-t / 0.16), { highpassHz: 5200, durSec: 0.4 })
  })
}

function levelUp() {
  return buildOneShot(1.05, (buf) => {
    const notes = [392, 493.88, 587.33, 783.99, 1046.5]
    let t = 0
    for (const freq of notes) {
      addTransient(buf, t, 0.48, 0.19, { freq, freqEnd: freq * 1.004, decayFactor: 0.9 })
      addTransient(buf, t, 0.36, 0.035, { freq: freq * 2, decayFactor: 0.8 })
      t += 0.15
    }
  })
}

function badgeUnlock() {
  return buildOneShot(1.45, (buf) => {
    const chord = [392, 493.88, 587.33]
    for (const freq of chord) {
      addSine(buf, freq, (t, d) => 0.12 * Math.sin(Math.PI * Math.min(1, t / 0.06)) * Math.exp(-t / (d * 1.2)), { durSec: 1.12 })
      addSine(buf, freq * 1.003, (t, d) => 0.035 * Math.sin(Math.PI * Math.min(1, t / 0.07)) * Math.exp(-t / (d * 1.15)), { durSec: 1.12 })
    }
    const flourish = [1046.5, 1318.5, 1568]
    let t = 0.65
    for (const freq of flourish) {
      addTransient(buf, t, 0.36, 0.13, { freq, decayFactor: 0.9 })
      t += 0.1
    }
  })
}

function districtWin() {
  return buildOneShot(2.1, (buf) => {
    const pad = [196, 246.94, 293.66, 392]
    for (const freq of pad) addSine(buf, freq, (t, d) => 0.045 * Math.sin(Math.PI * Math.min(1, t / 0.12)) * Math.exp(-t / (d * 1.3)), { durSec: 2.1 })

    const melody = [
      { freq: 392, at: 0.0, dur: 0.24 },
      { freq: 493.88, at: 0.22, dur: 0.24 },
      { freq: 587.33, at: 0.44, dur: 0.24 },
      { freq: 783.99, at: 0.66, dur: 0.34 },
      { freq: 587.33, at: 1.02, dur: 0.24 },
      { freq: 783.99, at: 1.24, dur: 0.24 },
      { freq: 1046.5, at: 1.46, dur: 0.55 },
    ]
    for (const note of melody) {
      addTransient(buf, note.at, note.dur, 0.18, { freq: note.freq, freqEnd: note.freq * 1.002, decayFactor: 1.0 })
      addTransient(buf, note.at, note.dur * 0.8, 0.028, { freq: note.freq * 2, decayFactor: 0.9 })
    }
  })
}

function agentError() {
  return buildOneShot(0.48, (buf) => {
    addTransient(buf, 0.02, 0.28, 0.18, { freq: 392, freqEnd: 310, decayFactor: 0.9 })
    addTransient(buf, 0.2, 0.24, 0.14, { freq: 293.66, freqEnd: 246.94, decayFactor: 0.95 })
    addNoiseBand(buf, makeRng(19), (t) => 0.012 * Math.exp(-t / 0.14), { startSec: 0.02, durSec: 0.4, lowpassHz: 1300, highpassHz: 280 })
  })
}

// ==================== Run ====================

const districtRng = (seed) => makeRng(seed)

const districts = [
  ["data-center-day", dataCenterDay(districtRng(1))],
  ["data-center-night", dataCenterNight(districtRng(2))],
  ["comm-hub-day", commHubDay(districtRng(3))],
  ["comm-hub-night", commHubNight(districtRng(4))],
  ["processing-day", processingDay(districtRng(5))],
  ["processing-night", processingNight(districtRng(6))],
  ["defense-day", defenseDay(districtRng(7))],
  ["defense-night", defenseNight(districtRng(8))],
  ["research-day", researchDay(districtRng(9))],
  ["research-night", researchNight(districtRng(10))],
]

for (const [name, buf] of districts) {
  writeTrack(`districts/${name}.wav`, buf)
}

const events = [
  ["task-complete", taskComplete()],
  ["payment-received", paymentReceived()],
  ["level-up", levelUp()],
  ["badge-unlock", badgeUnlock()],
  ["district-win", districtWin()],
  ["agent-error", agentError()],
]

for (const [name, buf] of events) {
  writeTrack(`events/${name}.wav`, buf)
}

console.log("done")
