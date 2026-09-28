import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { getSetSounds, listLayers, listSets, type LayerRead, type SetRead } from '../api/generated'
import { createAudioSourcePlayer } from '../audio/createAudioSourcePlayer'
import type { AudioSourcePlayer } from '../audio/AudioSourcePlayer'
import { Program } from './Program'
import { SessionView } from './SessionView'

/* eslint-disable @typescript-eslint/unbound-method */

vi.mock('../api/generated', () => ({ listLayers: vi.fn(), listSets: vi.fn(), getSetSounds: vi.fn() }))
vi.mock('../audio/createAudioSourcePlayer', () => ({ createAudioSourcePlayer: vi.fn() }))

const layer = (id: string, name: string, position: number): LayerRead => ({ id, name, position, playback_mode: 'single', volume: 70, created_at: '' })
const set = (id: string, layerId: string, name: string, position: number): SetRead => ({ id, layer_id: layerId, name, position, loop: false, shuffle: false, tags: [], created_at: '' })

beforeEach(() => {
  vi.mocked(listLayers).mockReset()
  vi.mocked(listSets).mockReset()
  vi.mocked(getSetSounds).mockReset()
  vi.mocked(createAudioSourcePlayer).mockReset()
})

test('shows saved Layer and Set order, then trigger, retry and stop controls', async () => {
  vi.mocked(listLayers).mockResolvedValue({ data: [layer('b', 'Ambience', 2), layer('a', 'Music', 1)] } as never)
  vi.mocked(listSets).mockImplementation(({ path }) => Promise.resolve({ data: path.layer_id === 'a'
    ? [set('second', 'a', 'Finale', 2), set('first', 'a', 'Opening', 1)] : [set('rain', 'b', 'Rain', 1)] }) as never)
  vi.mocked(getSetSounds).mockResolvedValue({ data: [{ id: 'sound', name: 'Theme', kind: 'file', content_type: 'audio/mpeg', is_errored: false }] } as never)
  let notify = () => {}
  const player: AudioSourcePlayer = {
    status: { kind: 'file', state: 'idle', volume: 100 }, progressSeconds: 0,
    play: vi.fn(() => { player.status.state = 'loading'; notify() }),
    stop: vi.fn(), setVolume: vi.fn(), dispose: vi.fn(),
    subscribe: vi.fn((listener: () => void) => { notify = listener; return () => { notify = () => {} } }),
  }
  vi.mocked(createAudioSourcePlayer).mockReturnValue(player)
  const program = new Program()
  const { container } = render(<SessionView program={program} />)
  await screen.findByRole('button', { name: 'Trigger Opening in Music' })
  expect([...container.querySelectorAll('.session-rack h2')].map((node) => node.textContent)).toEqual(['Music', 'Ambience'])
  expect([...within(screen.getByRole('region', { name: 'Music Layer' })).getAllByRole('button')].map((node) => node.textContent)).toEqual(['OpeningStopped', 'FinaleStopped'])
  fireEvent.click(screen.getByRole('button', { name: 'Trigger Opening in Music' }))
  await waitFor(() => expect(player.play).toHaveBeenCalledOnce())
  expect(screen.getByRole('button', { name: 'Stop Opening in Music' })).toHaveTextContent('Starting')
  act(() => { player.status.state = 'blocked'; notify() })
  expect(screen.getByRole('button', { name: 'Retry audio for Opening in Music' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry audio for Opening in Music' }))
  expect(player.play).toHaveBeenCalledTimes(2)
  act(() => { player.status.state = 'playing'; notify() })
  expect(screen.getByRole('button', { name: 'Stop Opening in Music' })).toHaveTextContent('Playing')
  fireEvent.click(screen.getByRole('button', { name: 'Stop Opening in Music' }))
  expect(screen.getByRole('button', { name: 'Trigger Opening in Music' })).toHaveTextContent('Stopped')
})

test('a slow membership request still shows the Set and lets the GM stop its start', async () => {
  vi.mocked(listLayers).mockResolvedValue({ data: [layer('a', 'Music', 0)] } as never)
  vi.mocked(listSets).mockResolvedValue({ data: [set('s', 'a', 'Opening', 0)] } as never)
  let resolve!: (value: never) => void
  vi.mocked(getSetSounds).mockImplementation(() => new Promise<never>((done) => { resolve = done }))
  const program = new Program()
  render(<SessionView program={program} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Trigger Opening in Music' }))
  expect(screen.getByRole('button', { name: 'Stop Opening in Music' })).toHaveTextContent('Starting')
  fireEvent.click(screen.getByRole('button', { name: 'Stop Opening in Music' }))
  resolve({ data: [] } as never)
  expect(screen.getByRole('button', { name: 'Trigger Opening in Music' })).toHaveTextContent('Stopped')
})
