// AudioSourcePlayer backend for `file` sounds: wraps a Howler `Howl` (Web Audio,
// ADR-0001 — "fully controllable Web Audio nodes") over `GET /api/sounds/{id}/audio`.
// Translates Howler's native callbacks into the reducer's FileEvent vocabulary
// (playerStatus.ts) — see BaseAudioSourcePlayer for the shared dispatch/progress plumbing.
import { Howl } from 'howler'
import { BaseAudioSourcePlayer } from './BaseAudioSourcePlayer'

export class HowlerPlayer extends BaseAudioSourcePlayer {
  private readonly audioUrl: string
  private readonly format: string
  private howl: Howl | null = null

  constructor(audioUrl: string, format: string) {
    super('file')
    this.audioUrl = audioUrl
    this.format = format
  }

  protected driverLoad(): void {
    if (this.howl) {
      return
    }
    this.howl = new Howl({
      src: [this.audioUrl],
      // The API route ends in `/audio`, so Howler cannot infer the codec from a
      // filename extension. Without this it rejects the source before making an
      // HTTP request ("No codec support for selected audio sources").
      format: [this.format],
      volume: this.status.volume / 100,
      onplay: () => this.dispatch({ t: 'FILE_PLAY' }),
      onend: () => this.dispatch({ t: 'FILE_END' }),
      onstop: () => this.dispatch({ t: 'FILE_STOP' }),
      onloaderror: () => this.dispatch({ t: 'FILE_LOADERROR' }),
      onplayerror: () => this.dispatch({ t: 'FILE_PLAYERROR' }),
    })
  }

  protected driverPlay(): void {
    // Safe to call before the Howl finishes loading — Howler queues the play and
    // fires 'play' once decoding completes.
    this.howl?.play()
  }

  protected driverStop(): void {
    this.howl?.stop()
  }

  protected driverSetVolume(volume: number): void {
    this.howl?.volume(volume / 100)
  }

  protected readPositionSeconds(): number {
    const position = this.howl?.seek()
    return typeof position === 'number' ? position : 0
  }

  protected disposeDriver(): void {
    this.howl?.unload()
    this.howl = null
  }
}
