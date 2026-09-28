import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { HowlerPlayer } from './HowlerPlayer'

// Mocks Howler at the driver boundary (dev-setup.md: "Howler ... mocked at the player
// interface") — one fake Howl instance per `new Howl(...)` call, capturing the config
// so tests can fire its callbacks and assert on volume/seek calls.
interface FakeHowlConfig {
  src: string[]
  format: string[]
  volume: number
  onplay?: () => void
  onend?: () => void
  onstop?: () => void
  onloaderror?: () => void
  onplayerror?: (id: number, error: unknown) => void
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

test('play() supplies the format for the extensionless audio URL and starts it', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')

  player.play()

  expect(lastHowl!.config.src).toEqual(['/api/sounds/s1/audio'])
  expect(lastHowl!.config.format).toEqual(['mp3'])
  expect(lastHowl!.play).toHaveBeenCalledOnce()
  expect(player.status.state).toBe('loading')
})

test("Howler's onplay callback moves status to playing", () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  player.play()

  lastHowl!.config.onplay!()

  expect(player.status.state).toBe('playing')
})

test('a loaderror is transient and never persists is_errored', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  player.play()

  lastHowl!.config.onloaderror!()

  expect(player.status.state).toBe('error')
  expect(player.status.errorClass).toBe('transient')
})

test('a rejected start is blocked and retry attempts the same file again', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  player.play()
  lastHowl!.config.onplayerror!(1, 'Playback was unable to start. This is most commonly an issue on mobile devices and Chrome where playback was not within a user interaction.')

  expect(player.status.state).toBe('blocked')
  expect(player.status.errorClass).toBeUndefined()
  player.play()
  expect(lastHowl!.play).toHaveBeenCalledTimes(2)
  lastHowl!.config.onplay!()
  expect(player.status.state).toBe('playing')
})

test('a suppressed file start becomes blocked, and stop prevents a late play callback', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  player.play()
  vi.advanceTimersByTime(5000)
  expect(player.status.state).toBe('blocked')
  lastHowl!.config.onplayerror!(1, 'Playback was unable to start. This is most commonly an issue on mobile devices and Chrome where playback was not within a user interaction.')
  expect(player.status.state).toBe('blocked')

  player.stop()
  lastHowl!.config.onplay!()
  expect(player.status.state).toBe('stopped')
})

test('a late file play callback after Blocked is stopped until Retry audio', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  player.play()
  vi.advanceTimersByTime(5000)
  lastHowl!.config.onplay!()
  expect(lastHowl!.stop).toHaveBeenCalledOnce()
  expect(player.status.state).toBe('blocked')
})

test('a non-gesture file play failure stays transient', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  player.play()
  lastHowl!.config.onplayerror!(1, new Error('Output device failed'))
  expect(player.status.state).toBe('error')
  expect(player.status.errorClass).toBe('transient')
})

test('a synchronous play callback stays playing and advances progress', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  // Simulate a driver reporting playback before play() returns.
  player.play()
  lastHowl!.play.mockImplementation(() => lastHowl!.config.onplay!())
  player.stop()
  player.play()
  lastHowl!.seek.mockReturnValue(2)
  vi.advanceTimersByTime(250)
  expect(player.status.state).toBe('playing')
  expect(player.progressSeconds).toBe(2)
})

test('stop() calls howl.stop() once playing', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  player.play()
  lastHowl!.config.onplay!()

  player.stop()

  expect(lastHowl!.stop).toHaveBeenCalledOnce()
  expect(player.status.state).toBe('stopped')
})

test('progress polls howl.seek() while playing and stops polling once stopped', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
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
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  player.play() // constructs the Howl

  player.setVolume(40)

  expect(lastHowl!.volume).toHaveBeenCalledWith(0.4)
})

test('dispose() unloads the Howl', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  player.play()

  player.dispose()

  expect(lastHowl!.unload).toHaveBeenCalledOnce()
})

test('subscribers are notified on state changes', () => {
  const player = new HowlerPlayer('/api/sounds/s1/audio', 'mp3')
  const listener = vi.fn()
  player.subscribe(listener)

  player.play()

  expect(listener).toHaveBeenCalled()
})
