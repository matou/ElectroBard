import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { useLibrary } from './useLibrary'
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

// The hook is the seam between the typed API client and every Library component
// (api/README.md: mock the generated client, not HTTP). Tests here lock its state
// machine — sorting, error surfacing, and the PATCH full-replace merge — so the UI
// components can stay dumb and simply call these functions.
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
    id: '1',
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

test('starts loading (null sounds) then resolves sounds and tags sorted A-Z', async () => {
  mockListSounds.mockResolvedValue({
    data: [sound({ id: '2', name: 'Zephyr' }), sound({ id: '1', name: 'Anvil' })],
  } as never)
  mockListTags.mockResolvedValue({
    data: [tag({ id: 't2', name: 'night' }), tag({ id: 't1', name: 'ambience' })],
  } as never)

  const { result } = renderHook(() => useLibrary())

  expect(result.current.sounds).toBeNull()

  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  expect(result.current.sounds?.map((s) => s.name)).toEqual(['Anvil', 'Zephyr'])
  expect(result.current.tags.map((t) => t.name)).toEqual(['ambience', 'night'])
  expect(result.current.loadError).toBeNull()
})

test('surfaces a load error and falls back to an empty library', async () => {
  mockListSounds.mockResolvedValue({ error: { detail: 'boom' } } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)

  const { result } = renderHook(() => useLibrary())

  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  expect(result.current.sounds).toEqual([])
  expect(result.current.loadError).toBe('boom')
})

test('addFile inserts the uploaded sound in sorted position', async () => {
  mockListSounds.mockResolvedValue({ data: [sound({ id: '1', name: 'Anvil' })] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  const { result } = renderHook(() => useLibrary())
  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  mockUploadSound.mockResolvedValue({ data: sound({ id: '2', name: 'Bell' }) } as never)
  const file = new File(['x'], 'bell.mp3')

  await act(async () => {
    await result.current.addFile(file)
  })

  expect(mockUploadSound).toHaveBeenCalledWith({ body: { file } })
  expect(result.current.sounds?.map((s) => s.name)).toEqual(['Anvil', 'Bell'])
})

test('addFile rejects with a readable message on failure', async () => {
  mockListSounds.mockResolvedValue({ data: [] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  const { result } = renderHook(() => useLibrary())
  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  mockUploadSound.mockResolvedValue({ error: { detail: 'Unsupported format' } } as never)

  await expect(
    act(async () => {
      await result.current.addFile(new File(['x'], 'bad.exe'))
    }),
  ).rejects.toThrow('Unsupported format')
  expect(result.current.sounds).toEqual([])
})

test('addYoutube adds the sound and surfaces the embed warning', async () => {
  mockListSounds.mockResolvedValue({ data: [] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  const { result } = renderHook(() => useLibrary())
  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  mockAddYoutubeSound.mockResolvedValue({
    data: { ...sound({ id: '3', name: 'Boss Theme', kind: 'youtube' }), embed_warning: 'blocked' },
  } as never)

  let outcome: { sound: SoundRead; embedWarning: string | null } | undefined
  await act(async () => {
    outcome = await result.current.addYoutube('https://youtu.be/abc123')
  })

  expect(mockAddYoutubeSound).toHaveBeenCalledWith({ body: { url: 'https://youtu.be/abc123' } })
  expect(outcome?.embedWarning).toBe('blocked')
  expect(result.current.sounds?.map((s) => s.name)).toEqual(['Boss Theme'])
})

test('addYoutube reports no warning when none is returned', async () => {
  mockListSounds.mockResolvedValue({ data: [] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  const { result } = renderHook(() => useLibrary())
  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  mockAddYoutubeSound.mockResolvedValue({ data: sound({ id: '4', kind: 'youtube' }) } as never)

  let outcome: { sound: SoundRead; embedWarning: string | null } | undefined
  await act(async () => {
    outcome = await result.current.addYoutube('https://youtu.be/abc123')
  })

  expect(outcome?.embedWarning).toBeNull()
})

test('renameSound sends the current tag_ids alongside the new name (full-replace PATCH)', async () => {
  const existing = sound({ id: '1', name: 'Old Name', tags: [tag({ id: 't1' }), tag({ id: 't2' })] })
  mockListSounds.mockResolvedValue({ data: [existing] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  const { result } = renderHook(() => useLibrary())
  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  mockUpdateSound.mockResolvedValue({ data: { ...existing, name: 'New Name' } } as never)

  await act(async () => {
    await result.current.renameSound('1', 'New Name')
  })

  expect(mockUpdateSound).toHaveBeenCalledWith({
    path: { sound_id: '1' },
    body: { name: 'New Name', tag_ids: ['t1', 't2'] },
  })
  expect(result.current.sounds?.[0].name).toBe('New Name')
})

test('setSoundTags sends the current name alongside the new tag_ids', async () => {
  const existing = sound({ id: '1', name: 'Tavern Brawl', tags: [] })
  mockListSounds.mockResolvedValue({ data: [existing] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  const { result } = renderHook(() => useLibrary())
  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  const newTag = tag({ id: 't9', name: 'combat' })
  mockUpdateSound.mockResolvedValue({ data: { ...existing, tags: [newTag] } } as never)

  await act(async () => {
    await result.current.setSoundTags('1', ['t9'])
  })

  expect(mockUpdateSound).toHaveBeenCalledWith({
    path: { sound_id: '1' },
    body: { name: 'Tavern Brawl', tag_ids: ['t9'] },
  })
  expect(result.current.sounds?.[0].tags).toEqual([newTag])
})

test('deleteSound removes the sound from state', async () => {
  mockListSounds.mockResolvedValue({
    data: [sound({ id: '1', name: 'Anvil' }), sound({ id: '2', name: 'Bell' })],
  } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  const { result } = renderHook(() => useLibrary())
  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  mockDeleteSound.mockResolvedValue({ data: undefined } as never)

  await act(async () => {
    await result.current.deleteSound('1')
  })

  expect(mockDeleteSound).toHaveBeenCalledWith({ path: { sound_id: '1' } })
  expect(result.current.sounds?.map((s) => s.id)).toEqual(['2'])
})

test('createTag adds the tag to state sorted A-Z and returns it', async () => {
  mockListSounds.mockResolvedValue({ data: [] } as never)
  mockListTags.mockResolvedValue({ data: [tag({ id: 't1', name: 'ambience' })] } as never)
  const { result } = renderHook(() => useLibrary())
  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  const created = tag({ id: 't2', name: 'aardvark' })
  mockCreateTag.mockResolvedValue({ data: created } as never)

  let returned: TagRead | undefined
  await act(async () => {
    returned = await result.current.createTag('aardvark')
  })

  expect(returned).toEqual(created)
  expect(result.current.tags.map((t) => t.name)).toEqual(['aardvark', 'ambience'])
})

test('createTag rejects with a readable message on a duplicate-name conflict', async () => {
  mockListSounds.mockResolvedValue({ data: [] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)
  const { result } = renderHook(() => useLibrary())
  await waitFor(() => expect(result.current.sounds).not.toBeNull())

  mockCreateTag.mockResolvedValue({ error: { detail: 'Tag already exists' } } as never)

  await expect(
    act(async () => {
      await result.current.createTag('ambience')
    }),
  ).rejects.toThrow('Tag already exists')
})
