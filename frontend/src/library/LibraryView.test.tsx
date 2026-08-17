import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { LibraryView } from './LibraryView'
import {
  addYoutubeSound,
  createTag,
  deleteSound,
  listSounds,
  listTags,
  updateSound,
  uploadSound,
} from '../api/generated'
import type { SoundRead, TagRead } from '../api/generated'

// Integration-level: exercises the real useLibrary + AddSoundBar + SoundRow wiring,
// mocking only the generated client (api/README.md), the way App.test.tsx already does.
vi.mock('../api/generated', () => ({
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
const mockUploadSound = vi.mocked(uploadSound)
const mockAddYoutubeSound = vi.mocked(addYoutubeSound)
const mockUpdateSound = vi.mocked(updateSound)
const mockDeleteSound = vi.mocked(deleteSound)
const mockCreateTag = vi.mocked(createTag)

function sound(overrides: Partial<SoundRead> = {}): SoundRead {
  return {
    id: 's1',
    name: 'Tavern Brawl',
    kind: 'file',
    duration_seconds: 161,
    is_errored: false,
    error_detail: null,
    youtube_video_id: null,
    content_type: 'audio/mpeg',
    created_at: '2026-01-01T00:00:00Z',
    tags: [],
    ...overrides,
  }
}

function tag(overrides: Partial<TagRead> = {}): TagRead {
  return { id: 't1', name: 'ambience', created_at: '2026-01-01T00:00:00Z', ...overrides }
}

beforeEach(() => {
  mockListSounds.mockReset()
  mockListTags.mockReset()
  mockUploadSound.mockReset()
  mockAddYoutubeSound.mockReset()
  mockUpdateSound.mockReset()
  mockDeleteSound.mockReset()
  mockCreateTag.mockReset()
})

test('shows a loading state, then the empty-library placeholder', async () => {
  mockListSounds.mockResolvedValue({ data: [] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)

  render(<LibraryView />)

  expect(screen.getByText(/loading your library/i)).toBeInTheDocument()
  expect(await screen.findByText(/your library is empty/i)).toBeInTheDocument()
})

test('renders a catalog row per sound', async () => {
  mockListSounds.mockResolvedValue({ data: [sound()] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)

  render(<LibraryView />)

  expect(await screen.findByText('Tavern Brawl')).toBeInTheDocument()
  expect(screen.getByText('2:41')).toBeInTheDocument()
})

test('adding a file appends a new row without a refetch', async () => {
  mockListSounds.mockResolvedValue({ data: [] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  mockUploadSound.mockResolvedValue({ data: sound({ id: 's2', name: 'Rain Loop' }) } as never)

  render(<LibraryView />)
  await screen.findByText(/your library is empty/i)

  const file = new File(['bytes'], 'rain.mp3', { type: 'audio/mpeg' })
  fireEvent.change(screen.getByLabelText(/add file/i), { target: { files: [file] } })

  expect(await screen.findByText('Rain Loop')).toBeInTheDocument()
  expect(mockListSounds).toHaveBeenCalledTimes(1)
})

test('renaming a row calls PATCH with the existing tags preserved, and updates the row', async () => {
  const existing = sound({ tags: [tag({ id: 't1', name: 'ambience' })] })
  mockListSounds.mockResolvedValue({ data: [existing] } as never)
  mockListTags.mockResolvedValue({ data: [tag({ id: 't1', name: 'ambience' })] } as never)
  mockUpdateSound.mockResolvedValue({ data: { ...existing, name: 'Tavern Brawl (Live)' } } as never)

  render(<LibraryView />)
  await screen.findByText('Tavern Brawl')

  fireEvent.click(screen.getByRole('button', { name: /rename/i }))
  const input = screen.getByDisplayValue('Tavern Brawl')
  fireEvent.change(input, { target: { value: 'Tavern Brawl (Live)' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  expect(await screen.findByText('Tavern Brawl (Live)')).toBeInTheDocument()
  expect(mockUpdateSound).toHaveBeenCalledWith({
    path: { sound_id: 's1' },
    body: { name: 'Tavern Brawl (Live)', tag_ids: ['t1'] },
  })
})

test('a failed rename surfaces its error message on the page', async () => {
  mockListSounds.mockResolvedValue({ data: [sound()] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  mockUpdateSound.mockResolvedValue({ error: { detail: 'Name cannot be blank' } } as never)

  render(<LibraryView />)
  await screen.findByText('Tavern Brawl')

  fireEvent.click(screen.getByRole('button', { name: /rename/i }))
  const input = screen.getByDisplayValue('Tavern Brawl')
  fireEvent.change(input, { target: { value: 'Something New' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  expect(await screen.findByText('Name cannot be blank')).toBeInTheDocument()
})

test('deleting a row removes it after confirmation', async () => {
  mockListSounds.mockResolvedValue({ data: [sound()] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  mockDeleteSound.mockResolvedValue({ data: undefined } as never)

  render(<LibraryView />)
  await screen.findByText('Tavern Brawl')

  fireEvent.click(screen.getByRole('button', { name: /delete/i }))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

  expect(mockDeleteSound).toHaveBeenCalledWith({ path: { sound_id: 's1' } })
  await vi.waitFor(() => expect(screen.queryByText('Tavern Brawl')).not.toBeInTheDocument())
  expect(screen.getByText(/your library is empty/i)).toBeInTheDocument()
})
