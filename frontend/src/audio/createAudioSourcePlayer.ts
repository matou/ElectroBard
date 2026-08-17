// Picks the right AudioSourcePlayer backend for a Sound, so callers (LibraryView)
// never branch on Howler-vs-IFrame internals (ADR-0007). The only seam entry point
// component tests need to mock (dev-setup.md).
import type { AudioSourcePlayer } from './AudioSourcePlayer'
import { HowlerPlayer } from './HowlerPlayer'
import { YoutubePlayer } from './YoutubePlayer'

export interface PlayableSound {
  id: string
  kind: 'file' | 'youtube'
  youtube_video_id: string | null
}

export function createAudioSourcePlayer(sound: PlayableSound): AudioSourcePlayer {
  if (sound.kind === 'youtube') {
    if (!sound.youtube_video_id) {
      throw new Error(`youtube sound ${sound.id} has no youtube_video_id`)
    }
    return new YoutubePlayer(sound.youtube_video_id)
  }
  return new HowlerPlayer(`/api/sounds/${sound.id}/audio`)
}
