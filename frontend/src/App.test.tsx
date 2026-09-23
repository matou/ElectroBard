import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { listLayers, listSounds, listTags } from './api/generated'

vi.mock('./api/generated', () => ({
  listLayers: vi.fn(),
  listSets: vi.fn(),
  listSounds: vi.fn(),
  listTags: vi.fn(),
  uploadSound: vi.fn(),
  addYoutubeSound: vi.fn(),
  updateSound: vi.fn(),
  deleteSound: vi.fn(),
  createTag: vi.fn(),
}))

const mockListSounds = vi.mocked(listSounds)
const mockListTags = vi.mocked(listTags)
const mockListLayers = vi.mocked(listLayers)

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  mockListSounds.mockReset()
  mockListTags.mockReset()
  mockListLayers.mockReset()
  mockListSounds.mockResolvedValue({ data: [] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  mockListLayers.mockResolvedValue({ data: [] } as never)
})

test('navigates to configuration and back while Library remains usable', async () => {

  render(<App />)

  expect(screen.getByRole('heading', { name: 'Sound Library' })).toBeInTheDocument()
  expect(await screen.findByText(/your library is empty/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Layers & Sets' }))
  expect(await screen.findByRole('heading', { name: 'No Layers yet' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Layers & Sets' })).toHaveFocus())
  expect(window.location.pathname).toBe('/layers-sets')
  expect(screen.queryByRole('link', { name: /Session/ })).not.toBeInTheDocument()
  expect(screen.getByTitle('Coming in M3')).toHaveAttribute('aria-disabled', 'true')
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
