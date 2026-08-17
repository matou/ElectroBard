import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { HowlerPlayer } from './HowlerPlayer'

// Mocks Howler at the driver boundary (dev-setup.md: "Howler ... mocked at the player
// interface") — one fake Howl instance per `new Howl(...)` call, capturing the config
// so tests can fire its callbacks and assert on volume/seek calls.
interface FakeHowlConfig {
  src: string[]
  volume: number
  onplay?: () => void
  onend?: () => void
  onstop?: () => void
  onloaderror?: () => void
  onplayerror?: () => void
}

let lastHowl: {
  config: FakeHowlConfig
  play: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  volume: ReturnType<typeof vi.fn>
  seek: ReturnType<typeof vi.fn>
  unload: ReturnType<typeof vi.fn>
} | null = null

vi.mock('howler', () => ({
  Howl: vi.fn(function (this: unknown, config: FakeHowlConfig) {
    lastHowl = {
      config,
      play: vi.fn(),
      stop: vi.fn(),
      volume: vi.fn(),
      seek: vi.fn().mockReturnValue(0),
      unload: vi.fn(),
    }
    return lastHowl
  }),
}))

beforeEach(() => {
  lastHowl = null
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('play() constructs a Howl for the audio URL and starts it', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio')

  player.play()

  expect(lastHowl!.config.src).toEqual(['/api/sounds/s1/audio'])
  expect(lastHowl!.play).toHaveBeenCalledOnce()
  expect(player.status.state).toBe('loading')
})

test("Howler's onplay callback moves status to playing", () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio')
  player.play()

  lastHowl!.config.onplay!()

  expect(player.status.state).toBe('playing')
})

test('a loaderror is transient and never persists is_errored', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio')
  player.play()

  lastHowl!.config.onloaderror!()

  expect(player.status.state).toBe('error')
  expect(player.status.errorClass).toBe('transient')
})

test('stop() calls howl.stop() once playing', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio')
  player.play()
  lastHowl!.config.onplay!()

  player.stop()

  expect(lastHowl!.stop).toHaveBeenCalledOnce()
  expect(player.status.state).toBe('stopped')
})

test('progress polls howl.seek() while playing and stops polling once stopped', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio')
  player.play()
  lastHowl!.config.onplay!()
  lastHowl!.seek.mockReturnValue(3.5)

  vi.advanceTimersByTime(250)
  expect(player.progressSeconds).toBe(3.5)

  player.stop()
  lastHowl!.seek.mockReturnValue(9)
  vi.advanceTimersByTime(1000)
  expect(player.progressSeconds).toBe(0) // reset on leaving `playing`
})

test('setVolume converts the model 0-100 percent to Howler 0-1', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio')
  player.play() // constructs the Howl

  player.setVolume(40)

  expect(lastHowl!.volume).toHaveBeenCalledWith(0.4)
})

test('dispose() unloads the Howl', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio')
  player.play()

  player.dispose()

  expect(lastHowl!.unload).toHaveBeenCalledOnce()
})

test('subscribers are notified on state changes', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio')
  const listener = vi.fn()
  player.subscribe(listener)

  player.play()

  expect(listener).toHaveBeenCalled()
})
