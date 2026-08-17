import { expect, test } from 'vitest'
import { createAudioSourcePlayer } from './createAudioSourcePlayer'
import { HowlerPlayer } from './HowlerPlayer'
import { YoutubePlayer } from './YoutubePlayer'

test('a file sound gets a HowlerPlayer', () => {
  const player = createAudioSourcePlayer({ id: 's1', kind: 'file', youtube_video_id: null })

  expect(player).toBeInstanceOf(HowlerPlayer)
})

test('a youtube sound gets a YoutubePlayer', () => {
  const player = createAudioSourcePlayer({ id: 's2', kind: 'youtube', youtube_video_id: 'abc123' })

  expect(player).toBeInstanceOf(YoutubePlayer)
})

test('a youtube sound with no video id throws rather than building an unplayable player', () => {
  expect(() => createAudioSourcePlayer({ id: 's3', kind: 'youtube', youtube_video_id: null })).toThrow()
})
