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

function addSquare(buf, freq, ampFn, opts = {}) {
  const startSample = Math.round((opts.startSec ?? 0) * SAMPLE_RATE)
  const lenSamples = Math.round((opts.durSec ?? buf.length / SAMPLE_RATE) * SAMPLE_RATE)
  for (let i = 0; i < lenSamples; i++) {
    const idx = startSample + i
    if (idx < 0 || idx >= buf.length) continue
    const t = i / SAMPLE_RATE
    const localDur = lenSamples / SAMPLE_RATE
    const amp = typeof ampFn === "function" ? ampFn(t, localDur) : ampFn
    const s = Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1
    buf[idx] += amp * s
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

const LOOP_DURATION = 4
const CROSSFADE = 0.3

function dataCenterDay(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf) => {
    addSine(buf, 90, 0.16) // server hum fundamental
    addSine(buf, 180, 0.05) // harmonic
    addSine(buf, 45, 0.08) // sub hum
    // keystroke rhythms: irregular short ticks
    let t = 0
    while (t < buf.length / SAMPLE_RATE) {
      t += 0.1 + rng() * 0.18
      addTransient(buf, t, 0.03, 0.14, { noiseAmt: 1, rng, lowpassHz: 2600, highpassHz: 900, decayFactor: 0.25 })
    }
  })
}

function dataCenterNight(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    addSine(buf, 42, (t) => 0.28 + 0.06 * Math.sin((2 * Math.PI * t) / total)) // deep bass drone w/ slow swell
    addSine(buf, 84, 0.04)
    let t = 0
    while (t < total) {
      t += 0.4 + rng() * 0.9
      addTransient(buf, t, 0.02, 0.15, { noiseAmt: 1, rng, highpassHz: 2200, decayFactor: 0.2 })
    }
  })
}

function commHubDay(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    addNoiseBand(buf, rng, 0.07, { lowpassHz: 6000, highpassHz: 1400 }) // radio static
    addPulseTrain(buf, 1.0, total, 0.16, (n) => ({
      durSec: 0.08,
      freq: n % 2 === 0 ? 1200 : 950,
      decayFactor: 0.18,
    }))
  })
}

function commHubNight(_rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    addSine(buf, 110, 0.05) // soft pad drone
    const notes = [220, 261.63, 329.63, 440]
    const noteDur = total / notes.length / 2
    let t = 0
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const freq of notes) {
        addSine(buf, freq, (lt, ld) => 0.18 * Math.exp(-lt / (ld * 0.6)), { startSec: t, durSec: noteDur })
        t += noteDur
      }
    }
  })
}

function processingDay(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    const pitches = [220, 330, 440, 330]
    let t = 0
    let i = 0
    while (t < total) {
      addSquare(buf, pitches[i % pitches.length], (lt, ld) => 0.1 * Math.exp(-lt / (ld * 0.5)), {
        startSec: t,
        durSec: 0.18,
      })
      t += 0.25
      i++
    }
    addPulseTrain(buf, 0.25, total, 0.07, { durSec: 0.02, noiseAmt: 0.3, freq: 600, rng, decayFactor: 0.2 })
  })
}

function processingNight(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    // 120bpm techno: beat = 0.5s
    addPulseTrain(buf, 0.5, total, 0.32, { durSec: 0.15, freq: 110, freqEnd: 45, decayFactor: 0.18 })
    addPulseTrain(buf, 1.0, total, 0.18, { durSec: 0.3, freq: 55, decayFactor: 0.4 })
    addPulseTrain(buf, 0.25, total, 0.06, { durSec: 0.03, noiseAmt: 1, rng, highpassHz: 5000, decayFactor: 0.15 })
  })
}

function defenseDay(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    addPulseTrain(buf, 1.0, total, 0.26, { durSec: 0.1, freq: 95, decayFactor: 0.25 }) // marching kick
    addPulseTrain(buf, 1.0, total, 0.28, { durSec: 0.12, noiseAmt: 1, rng, lowpassHz: 4000, highpassHz: 250, decayFactor: 0.22 }) // snare
  })
}

function defenseNight(_rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, _total) => {
    addSine(buf, 73, 0.14) // tension drone (dissonant pair)
    addSine(buf, 78, 0.1)
    // radar pings with a couple of decaying echoes, twice per loop
    for (const at of [0.6, 2.6]) {
      addTransient(buf, at, 0.06, 0.22, { freq: 1800, decayFactor: 0.2 })
      addTransient(buf, at + 0.12, 0.05, 0.11, { freq: 1800, decayFactor: 0.2 })
      addTransient(buf, at + 0.24, 0.05, 0.05, { freq: 1800, decayFactor: 0.2 })
    }
  })
}

function researchDay(_rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, _total) => {
    for (const freq of [220, 277.18, 329.63]) addSine(buf, freq, 0.05)
    for (const at of [0.4, 2.3]) {
      addTransient(buf, at, 0.7, 0.16, { freq: at === 0.4 ? 660 : 880, decayFactor: 0.35 })
      addTransient(buf, at, 0.7, 0.06, { freq: (at === 0.4 ? 660 : 880) * 2, decayFactor: 0.3 })
    }
  })
}

function researchNight(rng) {
  return buildLoopable(LOOP_DURATION, CROSSFADE, (buf, total) => {
    for (const freq of [440, 554.37, 659.25]) {
      addSine(buf, freq, (t) => 0.045 + 0.015 * Math.sin(2 * Math.PI * 0.5 * t + freq), { freqEnd: freq * 1.004 })
    }
    addNoiseBand(buf, rng, (t) => 0.03 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / total)), {
      lowpassHz: 3500,
      highpassHz: 1200,
    })
  })
}

// ==================== Event stings ====================

function taskComplete() {
  return buildOneShot(0.05, (buf) => {
    addSine(buf, 880, (t, d) => 0.55 * Math.exp(-t / (d * 0.35)), { freqEnd: 1320 })
  })
}

function paymentReceived() {
  return buildOneShot(0.3, (buf) => {
    const notes = [1318.5, 1568, 1975.5, 2349.3]
    let t = 0
    for (const freq of notes) {
      addSine(buf, freq, (lt, ld) => 0.32 * Math.exp(-lt / (ld * 0.5)), { startSec: t, durSec: 0.13 })
      t += 0.05
    }
    addNoiseBand(buf, makeRng(7), (t) => 0.05 * Math.exp(-t / 0.1), { highpassHz: 7000, durSec: 0.3 })
  })
}

function levelUp() {
  return buildOneShot(0.8, (buf) => {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    let t = 0
    for (const freq of notes) {
      addSine(buf, freq, (lt, ld) => 0.45 * Math.exp(-lt / (ld * 0.7)), { startSec: t, durSec: 0.22 })
      addSine(buf, freq * 2, (lt, ld) => 0.08 * Math.exp(-lt / (ld * 0.5)), { startSec: t, durSec: 0.22 })
      t += 0.19
    }
  })
}

function badgeUnlock() {
  return buildOneShot(1.2, (buf) => {
    const chord = [523.25, 659.25, 783.99]
    for (const freq of chord) {
      addSine(buf, freq, (t, d) => 0.22 * Math.exp(-t / (d * 0.9)), { durSec: 0.9 })
      addSine(buf, freq * 1.003, (t, d) => 0.14 * Math.exp(-t / (d * 0.9)), { durSec: 0.9 }) // light chorus detune
    }
    const flourish = [1046.5, 1318.5, 1568]
    let t = 0.85
    for (const freq of flourish) {
      addSine(buf, freq, (lt, ld) => 0.3 * Math.exp(-lt / (ld * 0.6)), { startSec: t, durSec: 0.16 })
      t += 0.1
    }
  })
}

function districtWin() {
  return buildOneShot(2.0, (buf) => {
    const pad = [220, 277.18, 329.63]
    for (const freq of pad) addSine(buf, freq, (t, d) => 0.08 * Math.exp(-t / (d * 0.8)), { durSec: 2.0 })

    const melody = [
      { freq: 523.25, at: 0.0, dur: 0.2 },
      { freq: 659.25, at: 0.2, dur: 0.2 },
      { freq: 783.99, at: 0.4, dur: 0.2 },
      { freq: 1046.5, at: 0.6, dur: 0.35 },
      { freq: 783.99, at: 1.0, dur: 0.2 },
      { freq: 1046.5, at: 1.2, dur: 0.2 },
      { freq: 1318.5, at: 1.4, dur: 0.55 },
    ]
    for (const note of melody) {
      addSine(buf, note.freq, (lt, ld) => 0.38 * Math.exp(-lt / (ld * 0.6)), { startSec: note.at, durSec: note.dur })
      addSine(buf, note.freq * 2, (lt, ld) => 0.07 * Math.exp(-lt / (ld * 0.5)), { startSec: note.at, durSec: note.dur })
    }
  })
}

function agentError() {
  return buildOneShot(0.2, (buf) => {
    addSquare(buf, 320, (t, d) => 0.32 * Math.exp(-t / (d * 0.5)), { durSec: 0.09, freqEnd: 320 })
    addSquare(buf, 220, (t, d) => 0.32 * Math.exp(-t / (d * 0.5)), { startSec: 0.1, durSec: 0.09 })
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
