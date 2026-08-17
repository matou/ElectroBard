// AudioSourcePlayer backend for `youtube` sounds: wraps the YouTube IFrame Player API
// in a hidden element (ADR-0001 — "a coarse iframe that can only start/stop/setVolume").
// Translates the IFrame API's onStateChange/onError callbacks into the reducer's
// YouTubeEvent vocabulary (playerStatus.ts) — see BaseAudioSourcePlayer for the shared
// dispatch/progress plumbing.
import { BaseAudioSourcePlayer } from './BaseAudioSourcePlayer'
import { loadYoutubeIframeApi } from './loadYoutubeIframeApi'
import type { YouTubeErrorCode } from './playerStatus'

// onStateChange data codes (IFrame API reference).
const YT_STATE_ENDED = 0
const YT_STATE_PLAYING = 1
const YT_STATE_PAUSED = 2
const YT_STATE_BUFFERING = 3

const KNOWN_ERROR_CODES: readonly YouTubeErrorCode[] = [2, 5, 100, 101, 150]

function isKnownErrorCode(code: number): code is YouTubeErrorCode {
  return (KNOWN_ERROR_CODES as readonly number[]).includes(code)
}

export class YoutubePlayer extends BaseAudioSourcePlayer {
  private readonly videoId: string
  private readonly container: HTMLElement
  private player: YT.Player | null = null
  private playerReady = false
  private playRequested = false

  constructor(videoId: string) {
    super('youtube')
    this.videoId = videoId
    // Off-screen rather than display:none — some browsers suspend playback in
    // iframes that never lay out. Audio-only use, so visibility doesn't matter.
    this.container = document.createElement('div')
    this.container.style.position = 'fixed'
    this.container.style.left = '-9999px'
    this.container.style.width = '1px'
    this.container.style.height = '1px'
  }

  protected driverLoad(): void {
    if (this.player) {
      return
    }
    document.body.appendChild(this.container)
    void loadYoutubeIframeApi().then((YTNamespace) => {
      this.player = new YTNamespace.Player(this.container, {
        videoId: this.videoId,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1 },
        events: {
          onReady: () => {
            this.playerReady = true
            this.player!.setVolume(this.status.volume)
            if (this.playRequested) {
              this.player!.playVideo()
            }
          },
          onStateChange: (event) => this.handleStateChange(event.data),
          onError: (event) => {
            const code = isKnownErrorCode(event.data) ? event.data : 5 // unknown → transient, never persist
            this.dispatch({ t: 'YT_ERROR', code })
          },
        },
      })
    })
  }

  protected driverPlay(): void {
    // No driverLoad() call here: the reducer's PLAY command always emits DRIVER_LOAD
    // immediately before DRIVER_PLAY in the same synchronous effect loop (playerStatus.ts),
    // so the player is already loading. Calling driverLoad() again here would attach a
    // second `.then()` to the still-pending API promise (this.player is null until it
    // resolves) and construct a second YT.Player once it does.
    this.playRequested = true
    if (this.playerReady) {
      this.player!.playVideo()
    }
  }

  protected driverStop(): void {
    this.playRequested = false
    if (this.playerReady) {
      this.player!.stopVideo()
    }
  }

  protected driverSetVolume(volume: number): void {
    if (this.playerReady) {
      this.player!.setVolume(volume)
    }
  }

  protected readPositionSeconds(): number {
    return this.playerReady ? this.player!.getCurrentTime() : 0
  }

  protected disposeDriver(): void {
    this.player?.destroy()
    this.player = null
    this.playerReady = false
    this.container.remove()
  }

  private handleStateChange(data: number): void {
    switch (data) {
      case YT_STATE_BUFFERING:
        this.dispatch({ t: 'YT_BUFFERING' })
        break
      case YT_STATE_PLAYING:
        this.dispatch({ t: 'YT_PLAYING' })
        break
      case YT_STATE_PAUSED:
        this.dispatch({ t: 'YT_PAUSED' })
        break
      case YT_STATE_ENDED:
        this.dispatch({ t: 'YT_ENDED' })
        break
      default:
        // UNSTARTED (-1) / CUED (5) — no mapped event in the M1 status vocabulary.
        break
    }
  }
}
