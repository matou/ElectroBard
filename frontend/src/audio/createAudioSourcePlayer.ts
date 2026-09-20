// Picks the right AudioSourcePlayer backend for a Sound, so callers (LibraryView)
// never branch on Howler-vs-IFrame internals (ADR-0007). The only seam entry point
// component tests need to mock (dev-setup.md).
import type { AudioSourcePlayer } from './AudioSourcePlayer'
import { HowlerPlayer } from './HowlerPlayer'
import { YoutubePlayer } from './YoutubePlayer'

export interface PlayableSound {
  id: string
  kind: 'file' | 'youtube'
  content_type: string | null
  youtube_video_id: string | null
}

const HOWLER_FORMAT_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/flac': 'flac',
}

export function createAudioSourcePlayer(sound: PlayableSound): AudioSourcePlayer {
  if (sound.kind === 'youtube') {
    if (!sound.youtube_video_id) {
      throw new Error(`youtube sound ${sound.id} has no youtube_video_id`)
    }
    return new YoutubePlayer(sound.youtube_video_id)
  }
  const format = sound.content_type ? HOWLER_FORMAT_BY_CONTENT_TYPE[sound.content_type] : undefined
  if (!format) {
    throw new Error(`file sound ${sound.id} has unsupported content_type ${sound.content_type ?? 'null'}`)
  }
  return new HowlerPlayer(`/api/sounds/${sound.id}/audio`, format)
}
