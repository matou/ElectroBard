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

test('plays every Sound in server order without overlapping players', async () => {
  const sounds = [sound, { ...sound, id: 'b', name: 'Flute' }, { ...sound, id: 'c', name: 'Wind' }]
  const players = sounds.map(() => fakePlayer())
  const makePlayer = vi.fn((item: SoundRead) => { void item; return players[makePlayer.mock.calls.length - 1].player })
  const program = new Program(() => Promise.resolve(sounds), makePlayer)
  program.applySavedConfiguration([layer], [set])
  program.triggerSet('l', 's')
  await flush()
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['a'])
  players[0].change('playing')
  players[0].change('ended')
  expect(players[0].player.dispose).toHaveBeenCalledOnce()
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b'])
  players[1].change('playing')
  players[1].change('ended')
  players[2].change('playing')
  players[2].change('ended')
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b', 'c'])
  expect(program.getSnapshot().tiles.s.status).toBe('Stopped')
})

test('a loop fetches new membership and shuffle at the boundary while keeping queued slots', async () => {
  const b = { ...sound, id: 'b', name: 'Flute' }
  const c = { ...sound, id: 'c', name: 'Wind' }
  const load = vi.fn().mockResolvedValueOnce([sound, b]).mockResolvedValueOnce([b, c])
  const players = Array.from({ length: 4 }, () => fakePlayer())
  const makePlayer = vi.fn((item: SoundRead) => { void item; return players[makePlayer.mock.calls.length - 1].player })
  const program = new Program(load, makePlayer)
  program.applySavedConfiguration([layer], [{ ...set, loop: true }])
  program.triggerSet('l', 's')
  await flush()
  program.applySavedConfiguration([layer], [{ ...set, loop: true, shuffle: true }])
  players[0].change('playing')
  players[0].change('ended')
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b'])
  vi.spyOn(Math, 'random').mockReturnValue(0)
  players[1].change('playing')
  players[1].change('ended')
  await flush()
  expect(load).toHaveBeenCalledTimes(2)
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b', 'c'])
  program.applySavedConfiguration([layer], [{ ...set, loop: false, shuffle: true }])
  players[2].change('playing')
  players[2].change('ended')
  players[3].change('playing')
  players[3].change('ended')
  expect(program.getSnapshot().tiles.s.status).toBe('Stopped')
  expect(load).toHaveBeenCalledTimes(2)
  vi.restoreAllMocks()
})

test('failed and errored slots advance, and a pass with no completed Sounds stops despite Loop', async () => {
  const b = { ...sound, id: 'b', name: 'Flute', is_errored: true }
  const c = { ...sound, id: 'c', name: 'Wind' }
  const load = vi.fn().mockResolvedValue([sound, b, c])
  const audio = fakePlayer()
  const makePlayer = vi.fn((item: SoundRead) => {
    if (item.id === 'c') throw new Error('source unavailable')
    return audio.player
  })
  const program = new Program(load, makePlayer)
  program.applySavedConfiguration([layer], [{ ...set, loop: true }])
  program.triggerSet('l', 's')
  await flush()
  audio.change('error')
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['a', 'c'])
  expect(program.getSnapshot().tiles.s.status).toBe('Stopped')
  expect(load).toHaveBeenCalledOnce()
})

test('stop cancels a pending loop fetch and later edits do not revive the Set', async () => {
  let resolveNext!: (sounds: SoundRead[]) => void
  const load = vi.fn().mockResolvedValueOnce([sound]).mockImplementationOnce(() => new Promise<SoundRead[]>((resolve) => { resolveNext = resolve }))
  const audio = fakePlayer()
  const makePlayer = vi.fn(() => audio.player)
  const program = new Program(load, makePlayer)
  program.applySavedConfiguration([layer], [{ ...set, loop: true }])
  program.triggerSet('l', 's')
  await flush()
  audio.change('playing')
  audio.change('ended')
  program.stopSet('l', 's')
  resolveNext([sound])
  await flush()
  program.applySavedConfiguration([layer], [{ ...set, loop: true, shuffle: true }])
  expect(makePlayer).toHaveBeenCalledOnce()
  expect(program.getSnapshot().tiles.s.status).toBe('Stopped')
})

test('turning Loop on during a pass extends it, and a retrigger fetches current membership', async () => {
  const b = { ...sound, id: 'b', name: 'Flute' }
  const load = vi.fn().mockResolvedValueOnce([sound]).mockResolvedValueOnce([b]).mockResolvedValueOnce([sound])
  const players = Array.from({ length: 3 }, () => fakePlayer())
  const makePlayer = vi.fn((item: SoundRead) => { void item; return players[makePlayer.mock.calls.length - 1].player })
  const program = new Program(load, makePlayer)
  program.applySavedConfiguration([layer], [set])
  program.triggerSet('l', 's')
  await flush()
  program.applySavedConfiguration([layer], [{ ...set, loop: true }])
  players[0].change('playing')
  players[0].change('ended')
  await flush()
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b'])
  program.stopSet('l', 's')
  program.triggerSet('l', 's')
  await flush()
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b', 'a'])
  expect(load).toHaveBeenCalledTimes(3)
})

test('each shuffled pass draws a new permutation', async () => {
  const b = { ...sound, id: 'b' }
  const load = vi.fn().mockResolvedValue([sound, b])
  const players = Array.from({ length: 4 }, () => fakePlayer())
  const makePlayer = vi.fn((item: SoundRead) => { void item; return players[makePlayer.mock.calls.length - 1].player })
  const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99)
  const program = new Program(load, makePlayer)
  program.applySavedConfiguration([layer], [{ ...set, loop: true, shuffle: true }])
  program.triggerSet('l', 's')
  await flush()
  players[0].change('playing')
  players[0].change('ended')
  players[1].change('playing')
  players[1].change('ended')
  await flush()
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['b', 'a', 'a'])
  expect(random).toHaveBeenCalledTimes(2)
  program.stopAll()
  random.mockRestore()
})

test('a deleted queued Sound is attempted from the pass snapshot', async () => {
  const b = { ...sound, id: 'b', name: 'Flute' }
  const c = { ...sound, id: 'c', name: 'Wind' }
  const load = vi.fn().mockResolvedValueOnce([sound, b]).mockResolvedValueOnce([c])
  const audio = fakePlayer()
  const makePlayer = vi.fn((item: SoundRead) => {
    if (item.id === 'b') throw new Error('deleted source')
    return audio.player
  })
  const program = new Program(load, makePlayer)
  program.applySavedConfiguration([layer], [set])
  program.triggerSet('l', 's')
  await flush()
  audio.change('playing')
  audio.change('ended')
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b'])
  expect(program.getSnapshot().tiles.s.status).toBe('Stopped')
  program.triggerSet('l', 's')
  await flush()
  expect(makePlayer.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b', 'c'])
})

test('refreshing Session discards prefetched membership and ignores late older responses', async () => {
  const b = { ...sound, id: 'b', name: 'Flute' }
  let resolveOld!: (sounds: SoundRead[]) => void
  let resolveNew!: (sounds: SoundRead[]) => void
  const load = vi.fn()
    .mockImplementationOnce(() => new Promise<SoundRead[]>((resolve) => { resolveOld = resolve }))
    .mockImplementationOnce(() => new Promise<SoundRead[]>((resolve) => { resolveNew = resolve }))
    .mockResolvedValueOnce([b])
  const makePlayer = vi.fn((item: SoundRead) => { void item; return fakePlayer().player })
  const program = new Program(load, makePlayer)
  program.applySavedConfiguration([layer], [set])
  const oldPreparation = program.prepareSets([set])
  const newPreparation = program.prepareSets([set])
  resolveNew([b])
  await newPreparation
  resolveOld([sound])
  await oldPreparation
  program.triggerSet('l', 's')
  expect(makePlayer.mock.calls[0][0].id).toBe('b')
  program.stopSet('l', 's')
  program.triggerSet('l', 's')
  await flush()
  expect(makePlayer.mock.calls[1][0].id).toBe('b')
  expect(load).toHaveBeenCalledTimes(3)
})
