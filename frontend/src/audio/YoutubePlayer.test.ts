import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { resetYoutubeIframeApiForTests } from './loadYoutubeIframeApi'
import { YoutubePlayer } from './YoutubePlayer'

// Mocks the YouTube IFrame API at the driver boundary (dev-setup.md), the same way
// HowlerPlayer.test.ts mocks Howler. `window.YT` is set up before each test so
// loadYoutubeIframeApi resolves immediately (its "already present" fast path) instead
// of injecting a real <script> tag.
let lastPlayer: {
  options: YT.PlayerOptions
  playVideo: ReturnType<typeof vi.fn>
  stopVideo: ReturnType<typeof vi.fn>
  setVolume: ReturnType<typeof vi.fn>
  getCurrentTime: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
} | null = null

let playerConstructor: ReturnType<typeof vi.fn>

function installFakeYT() {
  const FakePlayer = vi.fn(function (this: unknown, _element: HTMLElement | string, options: YT.PlayerOptions) {
    lastPlayer = {
      options,
      playVideo: vi.fn(),
      stopVideo: vi.fn(),
      setVolume: vi.fn(),
      getCurrentTime: vi.fn().mockReturnValue(0),
      destroy: vi.fn(),
    }
    return lastPlayer
  })
  playerConstructor = FakePlayer

  window.YT = { Player: FakePlayer as unknown as YTGlobal['Player'] }
}

async function readyPlayer(player: YoutubePlayer) {
  player.play()
  await vi.waitFor(() => expect(lastPlayer).not.toBeNull())
  lastPlayer!.options.events!.onReady!({ target: lastPlayer as unknown as YT.Player })
}

beforeEach(() => {
  lastPlayer = null
  resetYoutubeIframeApiForTests()
  installFakeYT()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  window.YT = undefined
  window.onYouTubeIframeAPIReady = undefined
})

test('play() creates a YT.Player for the video id', async () => {
  const player = new YoutubePlayer('abc123')

  player.play()

  await vi.waitFor(() => expect(lastPlayer).not.toBeNull())
  expect(lastPlayer!.options.videoId).toBe('abc123')
})

test('play() constructs exactly one YT.Player, not two', async () => {
  // Regression: PLAY's DRIVER_LOAD and DRIVER_PLAY effects both run synchronously,
  // before the async IFrame API load resolves — driverPlay() must not re-trigger
  // driverLoad(), or a second `.then()` lands on the pending promise and builds a
  // second player once it resolves.
  const player = new YoutubePlayer('abc123')

  player.play()
  await vi.waitFor(() => expect(lastPlayer).not.toBeNull())

  expect(playerConstructor).toHaveBeenCalledOnce()
})

test('play() before onReady is honored once the player becomes ready', async () => {
  const player = new YoutubePlayer('abc123')

  player.play()
  await vi.waitFor(() => expect(lastPlayer).not.toBeNull())
  expect(lastPlayer!.playVideo).not.toHaveBeenCalled()

  lastPlayer!.options.events!.onReady!({ target: lastPlayer as unknown as YT.Player })

  expect(lastPlayer!.playVideo).toHaveBeenCalledOnce()
})

test('onStateChange PLAYING (1) moves status to playing', async () => {
  const player = new YoutubePlayer('abc123')
  await readyPlayer(player)

  lastPlayer!.options.events!.onStateChange!({ data: 1 })

  expect(player.status.state).toBe('playing')
})

test('onError 101 (embed disabled) is persistent', async () => {
  const player = new YoutubePlayer('abc123')
  await readyPlayer(player)

  lastPlayer!.options.events!.onError!({ data: 101 })

  expect(player.status.state).toBe('error')
  expect(player.status.errorClass).toBe('persistent')
})

test('onError 5 (html5 error) is transient', async () => {
  const player = new YoutubePlayer('abc123')
  await readyPlayer(player)

  lastPlayer!.options.events!.onError!({ data: 5 })

  expect(player.status.errorClass).toBe('transient')
})

test('an unknown onError code defaults to transient, never persists', async () => {
  const player = new YoutubePlayer('abc123')
  await readyPlayer(player)

  lastPlayer!.options.events!.onError!({ data: 999 })

  expect(player.status.errorClass).toBe('transient')
})

test('stop() calls stopVideo once ready', async () => {
  const player = new YoutubePlayer('abc123')
  await readyPlayer(player)

  player.stop()

  expect(lastPlayer!.stopVideo).toHaveBeenCalledOnce()
})

test('progress polls getCurrentTime() while playing', async () => {
  const player = new YoutubePlayer('abc123')
  await readyPlayer(player)
  lastPlayer!.options.events!.onStateChange!({ data: 1 }) // PLAYING
  lastPlayer!.getCurrentTime.mockReturnValue(12)

  vi.advanceTimersByTime(250)

  expect(player.progressSeconds).toBe(12)
})

test('dispose() destroys the YT.Player and removes its container', async () => {
  const player = new YoutubePlayer('abc123')
  await readyPlayer(player)

  player.dispose()

  expect(lastPlayer!.destroy).toHaveBeenCalledOnce()
})
