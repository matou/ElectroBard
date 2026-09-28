import { expect, test, vi } from 'vitest'
import type { LayerRead, SetRead, SoundRead } from '../api/generated'
import type { AudioSourcePlayer } from '../audio/AudioSourcePlayer'
import type { PlayerStatus } from '../audio/playerStatus'
import { Program } from './Program'

/* eslint-disable @typescript-eslint/unbound-method */

const layer = { id: 'l', name: 'Music', playback_mode: 'single', volume: 80, position: 0, created_at: '' } as LayerRead
const set = { id: 's', layer_id: 'l', name: 'Battle', position: 0, loop: false, shuffle: false, tags: [], created_at: '' } as SetRead
const sound = { id: 'a', name: 'Drums', kind: 'file', content_type: 'audio/mpeg', youtube_video_id: null, is_errored: false } as SoundRead

function fakePlayer() {
  let notify = () => {}
  const player: AudioSourcePlayer = {
    status: { kind: 'file', state: 'idle', volume: 100 },
    progressSeconds: 0,
    play: vi.fn(() => { player.status.state = 'loading'; notify() }),
    stop: vi.fn(() => { player.status.state = 'stopped'; notify() }),
    setVolume: vi.fn(),
    subscribe: vi.fn((listener: () => void) => { notify = listener; return () => { notify = () => {} } }),
    dispose: vi.fn(),
  }
  return { player, change: (state: PlayerStatus['state']) => { player.status.state = state; notify() } }
}

const flush = async () => { await Promise.resolve(); await Promise.resolve() }

test('loads resolved membership, follows player status, retries blocked sound and toggles stop', async () => {
  const audio = fakePlayer()
  const load = vi.fn().mockResolvedValue([sound])
  const program = new Program(load, () => audio.player)
  program.applySavedConfiguration([layer], [set])
  program.triggerSet('l', 's')
  expect(program.getSnapshot().tiles.s.status).toBe('Starting')
  await flush()
  expect(load).toHaveBeenCalledWith('s')
  expect(audio.player.play).toHaveBeenCalledTimes(1)
  expect(audio.player.setVolume).toHaveBeenCalledWith(80)
  audio.change('blocked')
  expect(program.getSnapshot().tiles.s.status).toBe('Blocked')
  program.retryBlockedSet('l', 's')
  expect(audio.player.play).toHaveBeenCalledTimes(2)
  audio.change('playing')
  expect(program.getSnapshot().tiles.s.status).toBe('Playing')
  program.triggerSet('l', 's')
  expect(program.getSnapshot().tiles.s.status).toBe('Stopped')
  expect(audio.player.dispose).toHaveBeenCalledTimes(1)
})

test('stop during membership loading prevents a late response from creating audio', async () => {
  let resolve!: (sounds: SoundRead[]) => void
  const load = () => new Promise<SoundRead[]>((done) => { resolve = done })
  const makePlayer = vi.fn(() => fakePlayer().player)
  const program = new Program(load, makePlayer)
  program.applySavedConfiguration([layer], [set])
  program.triggerSet('l', 's')
  program.stopAll()
  resolve([sound])
  await flush()
  expect(makePlayer).not.toHaveBeenCalled()
  expect(program.getSnapshot().tiles.s.status).toBe('Stopped')
})

test('a late player callback cannot revive stopped audio', async () => {
  const audio = fakePlayer()
  const program = new Program(() => Promise.resolve([sound]), () => audio.player)
  program.applySavedConfiguration([layer], [set])
  program.triggerSet('l', 's')
  await flush()
  program.stopSet('l', 's')
  audio.change('playing')
  expect(program.getSnapshot().tiles.s.status).toBe('Stopped')
  expect(audio.player.dispose).toHaveBeenCalledOnce()
})

test('empty membership stays stopped with actionable feedback', async () => {
  const program = new Program(() => Promise.resolve([]), () => fakePlayer().player)
  program.applySavedConfiguration([layer], [set])
  program.triggerSet('l', 's')
  await flush()
  expect(program.getSnapshot().tiles.s).toMatchObject({ status: 'Stopped', count: 0 })
  expect(program.getSnapshot().tiles.s.feedback).toMatch(/Add a Sound/)
})

test('prepared membership starts its Sound in the trigger tap', async () => {
  const audio = fakePlayer()
  const load = vi.fn(() => Promise.resolve([sound]))
  const program = new Program(load, () => audio.player)
  program.applySavedConfiguration([layer], [set])
  await program.prepareSets([set])
  program.triggerSet('l', 's')
  expect(audio.player.play).toHaveBeenCalledOnce()
  expect(load).toHaveBeenCalledOnce()
})

test('saved single mode retains the oldest active Set and cuts the other', async () => {
  const second = { ...set, id: 's2' }
  const players = [fakePlayer(), fakePlayer()]
  const program = new Program(() => Promise.resolve([sound]), () => players.shift()!.player)
  program.applySavedConfiguration([{ ...layer, playback_mode: 'multiset' }], [set, second])
  program.triggerSet('l', 's')
  await flush()
  program.triggerSet('l', 's2')
  await flush()
  expect(program.getSnapshot().tiles.s2.count).toBe(1)
  program.applySavedConfiguration([layer], [set, second])
  expect(program.getSnapshot().tiles.s.count).toBe(1)
  expect(program.getSnapshot().tiles.s2.count).toBe(0)
})
