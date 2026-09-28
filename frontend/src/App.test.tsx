import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { getSetSounds, listLayers, listSets, listSounds, listTags } from './api/generated'
import { createAudioSourcePlayer } from './audio/createAudioSourcePlayer'

vi.mock('./audio/createAudioSourcePlayer', () => ({ createAudioSourcePlayer: vi.fn() }))

vi.mock('./api/generated', () => ({
  listLayers: vi.fn(),
  listSets: vi.fn(),
  listSounds: vi.fn(),
  listTags: vi.fn(),
  getSetSounds: vi.fn(),
  uploadSound: vi.fn(),
  addYoutubeSound: vi.fn(),
  updateSound: vi.fn(),
  deleteSound: vi.fn(),
  createTag: vi.fn(),
}))

const mockListSounds = vi.mocked(listSounds)
const mockListTags = vi.mocked(listTags)
const mockListLayers = vi.mocked(listLayers)
const mockListSets = vi.mocked(listSets)

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  mockListSounds.mockReset()
  mockListTags.mockReset()
  mockListLayers.mockReset()
  mockListSets.mockReset()
  vi.mocked(getSetSounds).mockReset()
  vi.mocked(createAudioSourcePlayer).mockReset()
  mockListSounds.mockResolvedValue({ data: [] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  mockListLayers.mockResolvedValue({ data: [] } as never)
  mockListSets.mockResolvedValue({ data: [] } as never)
})

test('navigates to configuration and back while Library remains usable', async () => {

  render(<App />)

  expect(screen.getByRole('heading', { name: 'Sound Library' })).toBeInTheDocument()
  expect(await screen.findByText(/your library is empty/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Layers & Sets' }))
  expect(await screen.findByRole('heading', { name: 'No Layers yet' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Layers & Sets' })).toHaveFocus())
  expect(window.location.pathname).toBe('/layers-sets')
  expect(screen.getByRole('link', { name: 'Session' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Sound Library' }))
  expect(await screen.findByText(/your library is empty/i)).toBeInTheDocument()
  expect(mockListSounds).toHaveBeenCalledTimes(2)
})

test('opens the configuration route directly and responds to browser history', async () => {
  window.history.replaceState(null, '', '/layers-sets')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'No Layers yet' })).toBeInTheDocument()
  window.history.replaceState(null, '', '/')
  fireEvent.popState(window)
  expect(await screen.findByText(/your library is empty/i)).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Sound Library' })).toHaveFocus())
})

test('Session playback remains active through in-app navigation and Stop all works away from Session', async () => {
  mockListLayers.mockResolvedValue({ data: [{ id: 'l', name: 'Music', position: 0, playback_mode: 'single', volume: 80 }] } as never)
  mockListSets.mockResolvedValue({ data: [{ id: 's', layer_id: 'l', name: 'Battle', position: 0, loop: false, shuffle: false, tags: [] }] } as never)
  vi.mocked(getSetSounds).mockResolvedValue({ data: [{ id: 'a', name: 'Drums', kind: 'file', content_type: 'audio/mpeg', is_errored: false }] } as never)
  const player = { status: { kind: 'file', state: 'playing', volume: 80 }, progressSeconds: 0,
    play: vi.fn(), stop: vi.fn(), setVolume: vi.fn(), subscribe: vi.fn(() => () => {}), dispose: vi.fn() }
  vi.mocked(createAudioSourcePlayer).mockReturnValue(player as never)
  render(<App />)
  fireEvent.click(screen.getByRole('link', { name: 'Session' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Trigger Battle in Music' }))
  await waitFor(() => expect(player.play).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('link', { name: 'Sound Library' }))
  expect(player.dispose).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Stop all' }))
  expect(player.dispose).toHaveBeenCalledOnce()
})
