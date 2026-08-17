import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AddSoundBar } from './AddSoundBar'
import type { SoundRead } from '../api/generated'

function sound(overrides: Partial<SoundRead> = {}): SoundRead {
  return {
    id: 's1',
    name: 'Boss Theme',
    kind: 'youtube',
    duration_seconds: null,
    is_errored: false,
    error_detail: null,
    youtube_video_id: 'abc123',
    content_type: null,
    created_at: '2026-01-01T00:00:00Z',
    tags: [],
    ...overrides,
  }
}

test('selecting a file calls onAddFile with it', () => {
  const onAddFile = vi.fn().mockResolvedValue(sound({ kind: 'file' }))
  render(<AddSoundBar onAddFile={onAddFile} onAddYoutube={vi.fn()} />)

  const file = new File(['bytes'], 'rain.mp3', { type: 'audio/mpeg' })
  fireEvent.change(screen.getByLabelText(/add file/i), { target: { files: [file] } })

  expect(onAddFile).toHaveBeenCalledWith(file)
})

test('shows an inline error when the file upload fails', async () => {
  const onAddFile = vi.fn().mockRejectedValue(new Error('Unsupported format'))
  render(<AddSoundBar onAddFile={onAddFile} onAddYoutube={vi.fn()} />)

  const file = new File(['bytes'], 'rain.exe')
  fireEvent.change(screen.getByLabelText(/add file/i), { target: { files: [file] } })

  expect(await screen.findByText('Unsupported format')).toBeInTheDocument()
})

test('submitting a YouTube URL calls onAddYoutube and clears the input', async () => {
  const onAddYoutube = vi.fn().mockResolvedValue({ sound: sound(), embedWarning: null })
  render(<AddSoundBar onAddFile={vi.fn()} onAddYoutube={onAddYoutube} />)

  const input = screen.getByPlaceholderText(/youtube/i)
  fireEvent.change(input, { target: { value: 'https://youtu.be/abc123' } })
  fireEvent.click(screen.getByRole('button', { name: /add youtube/i }))

  expect(onAddYoutube).toHaveBeenCalledWith('https://youtu.be/abc123')
  await vi.waitFor(() => expect(input).toHaveValue(''))
})

test('blank YouTube URL does not submit', () => {
  const onAddYoutube = vi.fn()
  render(<AddSoundBar onAddFile={vi.fn()} onAddYoutube={onAddYoutube} />)

  fireEvent.click(screen.getByRole('button', { name: /add youtube/i }))

  expect(onAddYoutube).not.toHaveBeenCalled()
})

test('shows an inline error when adding a YouTube sound fails', async () => {
  const onAddYoutube = vi.fn().mockRejectedValue(new Error('Video not found or unavailable'))
  render(<AddSoundBar onAddFile={vi.fn()} onAddYoutube={onAddYoutube} />)

  fireEvent.change(screen.getByPlaceholderText(/youtube/i), {
    target: { value: 'https://youtu.be/gone' },
  })
  fireEvent.click(screen.getByRole('button', { name: /add youtube/i }))

  expect(await screen.findByText('Video not found or unavailable')).toBeInTheDocument()
})

test('shows a dismissable warning banner when the add succeeds with an embed warning', async () => {
  const onAddYoutube = vi
    .fn()
    .mockResolvedValue({ sound: sound(), embedWarning: 'This video blocks embedding.' })
  render(<AddSoundBar onAddFile={vi.fn()} onAddYoutube={onAddYoutube} />)

  fireEvent.change(screen.getByPlaceholderText(/youtube/i), {
    target: { value: 'https://youtu.be/blocked' },
  })
  fireEvent.click(screen.getByRole('button', { name: /add youtube/i }))

  expect(await screen.findByText('This video blocks embedding.')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))
  expect(screen.queryByText('This video blocks embedding.')).not.toBeInTheDocument()
})

test('does not show a warning banner when the add succeeds without one', async () => {
  const onAddYoutube = vi.fn().mockResolvedValue({ sound: sound(), embedWarning: null })
  render(<AddSoundBar onAddFile={vi.fn()} onAddYoutube={onAddYoutube} />)

  fireEvent.change(screen.getByPlaceholderText(/youtube/i), {
    target: { value: 'https://youtu.be/fine' },
  })
  fireEvent.click(screen.getByRole('button', { name: /add youtube/i }))

  await vi.waitFor(() => expect(onAddYoutube).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: /add anyway/i })).not.toBeInTheDocument()
})
