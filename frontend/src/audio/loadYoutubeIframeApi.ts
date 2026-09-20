// Lazily injects the YouTube IFrame Player API script (once — shared across every
// YoutubePlayer instance) and resolves once `window.YT.Player` is ready to construct.
// Memoized at module scope so a second preview never injects the script twice.
let apiPromise: Promise<YTGlobal> | null = null

export function loadYoutubeIframeApi(): Promise<YTGlobal> {
  apiPromise ??= new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }

    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      resolve(window.YT!)
    }

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })

  return apiPromise
}

/** Test-only: clears the memoized promise so each test can install a fresh fake `window.YT`. */
export function resetYoutubeIframeApiForTests(): void {
  apiPromise = null
}
