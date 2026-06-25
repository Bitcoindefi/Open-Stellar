import type { DistrictId } from "@/lib/types"

export type AudioEvent =
  | "task_complete"
  | "payment_received"
  | "level_up"
  | "badge_unlock"
  | "district_win"
  | "agent_error"

const DAY_NIGHT_CROSSFADE_SEC = 2.5
const FOCUS_RAMP_SEC = 0.6
const MASTER_RAMP_SEC = 0.15
const DAY_NIGHT_CHECK_MS = 30_000
const NIGHT_START_HOUR = 19
const NIGHT_END_HOUR = 6

const DISTRICT_TRACKS: Record<DistrictId, { day: string; night: string }> = {
  "data-center": { day: "/audio/districts/data-center-day.wav", night: "/audio/districts/data-center-night.wav" },
  "comm-hub": { day: "/audio/districts/comm-hub-day.wav", night: "/audio/districts/comm-hub-night.wav" },
  processing: { day: "/audio/districts/processing-day.wav", night: "/audio/districts/processing-night.wav" },
  defense: { day: "/audio/districts/defense-day.wav", night: "/audio/districts/defense-night.wav" },
  research: { day: "/audio/districts/research-day.wav", night: "/audio/districts/research-night.wav" },
}

const EVENT_FILES: Record<AudioEvent, string> = {
  task_complete: "/audio/events/task-complete.wav",
  payment_received: "/audio/events/payment-received.wav",
  level_up: "/audio/events/level-up.wav",
  badge_unlock: "/audio/events/badge-unlock.wav",
  district_win: "/audio/events/district-win.wav",
  agent_error: "/audio/events/agent-error.wav",
}

interface DistrictNodes {
  focusGain: GainNode
  dayGain: GainNode
  nightGain: GainNode
  daySource: AudioBufferSourceNode | null
  nightSource: AudioBufferSourceNode | null
}

function isNightNow(): boolean {
  const hour = new Date().getHours()
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR
}

/**
 * Drives the city's ambient soundtrack: a looping day/night ambient bed per
 * district, mixed by viewport focus, plus one-shot event stings. Pure Web
 * Audio API — no external dependencies.
 */
export class CityAudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private districts = new Map<DistrictId, DistrictNodes>()
  private bufferCache = new Map<string, Promise<AudioBuffer>>()
  private muted = false
  private volume = 1
  private night = isNightNow()
  private dayNightTimer: ReturnType<typeof setInterval> | null = null
  private initPromise: Promise<void> | null = null

  /** Unlocks the AudioContext (must be called from a user gesture) and starts all ambient loops. */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit()
    }
    return this.initPromise
  }

  private async doInit(): Promise<void> {
    if (typeof window === "undefined") return
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return

    this.ctx = new AudioContextCtor()
    if (this.ctx.state === "suspended") {
      await this.ctx.resume().catch(() => {})
    }

    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this.muted ? 0 : this.volume
    this.masterGain.connect(this.ctx.destination)

    const ids = Object.keys(DISTRICT_TRACKS) as DistrictId[]
    await Promise.all(ids.map((id) => this.setupDistrict(id)))

    this.applyDayNightMix(true)
    this.dayNightTimer = setInterval(() => this.refreshDayNight(), DAY_NIGHT_CHECK_MS)
  }

  private loadBuffer(url: string): Promise<AudioBuffer> {
    const ctx = this.ctx
    if (!ctx) return Promise.reject(new Error("AudioContext not initialized"))
    const cached = this.bufferCache.get(url)
    if (cached) return cached
    const promise = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
    this.bufferCache.set(url, promise)
    return promise
  }

  private async setupDistrict(id: DistrictId): Promise<void> {
    const ctx = this.ctx
    const master = this.masterGain
    if (!ctx || !master) return
    const paths = DISTRICT_TRACKS[id]

    const focusGain = ctx.createGain()
    focusGain.gain.value = 0
    focusGain.connect(master)

    const dayGain = ctx.createGain()
    dayGain.gain.value = 0
    dayGain.connect(focusGain)

    const nightGain = ctx.createGain()
    nightGain.gain.value = 0
    nightGain.connect(focusGain)

    const node: DistrictNodes = { focusGain, dayGain, nightGain, daySource: null, nightSource: null }
    this.districts.set(id, node)

    try {
      const [dayBuffer, nightBuffer] = await Promise.all([this.loadBuffer(paths.day), this.loadBuffer(paths.night)])
      if (!this.ctx) return // disposed mid-flight

      const daySource = this.ctx.createBufferSource()
      daySource.buffer = dayBuffer
      daySource.loop = true
      daySource.connect(dayGain)
      daySource.start()
      node.daySource = daySource

      const nightSource = this.ctx.createBufferSource()
      nightSource.buffer = nightBuffer
      nightSource.loop = true
      nightSource.connect(nightGain)
      nightSource.start()
      node.nightSource = nightSource
    } catch {
      // Missing/undecodable asset — leave this district silent rather than failing the whole engine.
    }
  }

  private refreshDayNight(): void {
    const nowNight = isNightNow()
    if (nowNight === this.night) return
    this.night = nowNight
    this.applyDayNightMix(false)
  }

  private applyDayNightMix(immediate: boolean): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const ramp = immediate ? 0.05 : DAY_NIGHT_CROSSFADE_SEC

    for (const node of this.districts.values()) {
      node.dayGain.gain.cancelScheduledValues(now)
      node.nightGain.gain.cancelScheduledValues(now)
      node.dayGain.gain.linearRampToValueAtTime(this.night ? 0 : 1, now + ramp)
      node.nightGain.gain.linearRampToValueAtTime(this.night ? 1 : 0, now + ramp)
    }
  }

  /** Sets a district's mix volume (0-1), e.g. based on how much of it is visible in the viewport. */
  setDistrictFocus(id: DistrictId, volume: number): void {
    const node = this.districts.get(id)
    const ctx = this.ctx
    if (!node || !ctx) return
    const clamped = Math.max(0, Math.min(1, volume))
    const now = ctx.currentTime
    node.focusGain.gain.cancelScheduledValues(now)
    node.focusGain.gain.linearRampToValueAtTime(clamped, now + FOCUS_RAMP_SEC)
  }

  /** Plays a one-shot event sting layered over the ambient mix. */
  playEvent(type: AudioEvent): void {
    const ctx = this.ctx
    const master = this.masterGain
    if (!ctx || !master) return
    this.loadBuffer(EVENT_FILES[type])
      .then((buffer) => {
        if (!this.ctx || !this.masterGain) return
        const source = this.ctx.createBufferSource()
        source.buffer = buffer
        source.connect(this.masterGain)
        source.start()
      })
      .catch(() => {})
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyMasterGain()
  }

  /** 0-1 */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    this.applyMasterGain()
  }

  private applyMasterGain(): void {
    const ctx = this.ctx
    const master = this.masterGain
    if (!ctx || !master) return
    const now = ctx.currentTime
    const target = this.muted ? 0 : this.volume
    master.gain.cancelScheduledValues(now)
    master.gain.linearRampToValueAtTime(target, now + MASTER_RAMP_SEC)
  }

  dispose(): void {
    if (this.dayNightTimer) clearInterval(this.dayNightTimer)
    this.dayNightTimer = null
    for (const node of this.districts.values()) {
      node.daySource?.stop()
      node.nightSource?.stop()
    }
    this.districts.clear()
    this.ctx?.close().catch(() => {})
    this.ctx = null
    this.masterGain = null
    this.initPromise = null
  }
}
