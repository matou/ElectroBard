// Minimal ambient types for the subset of the YouTube IFrame Player API this app uses
// (https://developers.google.com/youtube/iframe_api_reference). Not published on npm
// for this API version, so hand-declared rather than pulled from @types.
export {}

declare global {
  namespace YT {
    interface OnStateChangeEvent {
      data: number
    }

    interface OnErrorEvent {
      data: number
    }

    interface PlayerVars {
      autoplay?: 0 | 1
      controls?: 0 | 1
      disablekb?: 0 | 1
    }

    interface PlayerEvents {
      onReady?: (event: { target: Player }) => void
      onStateChange?: (event: OnStateChangeEvent) => void
      onError?: (event: OnErrorEvent) => void
    }

    interface PlayerOptions {
      videoId: string
      height?: string | number
      width?: string | number
      playerVars?: PlayerVars
      events?: PlayerEvents
    }

    // An interface, not a class: a namespace member with a runtime value (e.g. `class
    // Player`) makes TS treat the namespace's own name as an implicit ambient global
    // variable too, which then collides with — and corrupts — the `Window.YT` property
    // declared below (`window.YT = undefined` fails to typecheck with an unrelated-looking
    // "type 'YTGlobal & typeof YT'" error). Keeping YT purely a type-only namespace avoids
    // the collision; `YTGlobal.Player` below supplies the constructor signature instead.
    interface Player {
      playVideo(): void
      stopVideo(): void
      setVolume(volume: number): void
      getCurrentTime(): number
      destroy(): void
    }
  }

  interface YTGlobal {
    Player: new (element: HTMLElement | string, options: YT.PlayerOptions) => YT.Player
  }

  interface Window {
    YT?: YTGlobal
    onYouTubeIframeAPIReady?: () => void
  }
}
