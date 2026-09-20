import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { SoundRow } from './SoundRow'
import type { SoundRead, TagRead } from '../api/generated'
import type { PlayerStatus } from '../audio/playerStatus'

function tag(id: string, name: string): TagRead {
  return { id, name, created_at: '2026-01-01T00:00:00Z' }
}

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
    tags: [tag('t1', 'ambience')],
    ...overrides,
  }
}

function renderRow(overrides: Partial<SoundRead> = {}, props: Partial<Parameters<typeof SoundRow>[0]> = {}) {
  const onRename = vi.fn()
  const onTagsChange = vi.fn()
  const onCreateTag = vi.fn()
  const onDelete = vi.fn()
  const onPreviewPlay = vi.fn()
  const onPreviewStop = vi.fn()
  render(
    <table>
      <tbody>
        <SoundRow
          sound={sound(overrides)}
          allTags={[tag('t1', 'ambience'), tag('t2', 'combat')]}
          previewStatus={null}
          previewProgressSeconds={0}
          onPreviewPlay={onPreviewPlay}
          onPreviewStop={onPreviewStop}
          onRename={onRename}
          onTagsChange={onTagsChange}
          onCreateTag={onCreateTag}
          onDelete={onDelete}
          {...props}
        />
      </tbody>
    </table>,
  )
  return { onRename, onTagsChange, onCreateTag, onDelete, onPreviewPlay, onPreviewStop }
}

test('renders title, duration, and its tags', () => {
  renderRow()

  expect(screen.getByText('Tavern Brawl')).toBeInTheDocument()
  expect(screen.getByText('2:41')).toBeInTheDocument()
  expect(screen.getByText('ambience')).toBeInTheDocument()
})

test('shows an em dash when duration is unknown', () => {
  renderRow({ duration_seconds: null })

  expect(screen.getByText('—')).toBeInTheDocument()
})

test('clicking Play calls onPreviewPlay', () => {
  const { onPreviewPlay } = renderRow()

  fireEvent.click(screen.getByRole('button', { name: /play/i }))

  expect(onPreviewPlay).toHaveBeenCalledOnce()
})

test('while this row is the active preview and loading, shows Stop instead of Play', () => {
  const status: PlayerStatus = { kind: 'file', state: 'loading', volume: 100 }
  renderRow({}, { previewStatus: status })

  expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
})

test('while playing, shows elapsed / total progress and clicking Stop calls onPreviewStop', () => {
  const status: PlayerStatus = { kind: 'file', state: 'playing', volume: 100 }
  const { onPreviewStop } = renderRow({ duration_seconds: 161 }, { previewStatus: status, previewProgressSeconds: 5 })

  expect(screen.getByText('0:05 / 2:41')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /stop/i }))
  expect(onPreviewStop).toHaveBeenCalledOnce()
})

test('a transient preview error surfaces inline without touching sound.is_errored', () => {
  const status: PlayerStatus = {
    kind: 'youtube',
    state: 'error',
    volume: 100,
    errorClass: 'transient',
    errorDetail: 'Player error (HTML5)',
  }
  renderRow({ kind: 'youtube' }, { previewStatus: status })

  expect(screen.getByText(/Player error \(HTML5\)/)).toBeInTheDocument()
  // Back to a retryable Play control, not the persisted-errored treatment.
  expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()
  expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()
})

test('renders the inline errored treatment: desaturated row, Unavailable pill, reason, Recheck', () => {
  renderRow({ is_errored: true, error_detail: 'Video is no longer available.' })

  const row = screen.getByRole('row')
  expect(row.className).toMatch(/errored/)
  expect(screen.getByText('Unavailable')).toBeInTheDocument()
  expect(screen.getByText('Video is no longer available.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /recheck/i })).toBeInTheDocument()
  // Errored sounds have no play control — a distinct "can't preview" indicator instead.
  expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument()
})

test('rename: editing and saving a new name calls onRename', () => {
  const { onRename } = renderRow()

  fireEvent.click(screen.getByRole('button', { name: /rename/i }))
  const input = screen.getByDisplayValue('Tavern Brawl')
  fireEvent.change(input, { target: { value: 'Tavern Brawl (Remastered)' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  expect(onRename).toHaveBeenCalledWith('Tavern Brawl (Remastered)')
})

test('rename: pressing Escape cancels without calling onRename', () => {
  const { onRename } = renderRow()

  fireEvent.click(screen.getByRole('button', { name: /rename/i }))
  const input = screen.getByDisplayValue('Tavern Brawl')
  fireEvent.change(input, { target: { value: 'Something else' } })
  fireEvent.keyDown(input, { key: 'Escape' })

  expect(onRename).not.toHaveBeenCalled()
  expect(screen.getByText('Tavern Brawl')).toBeInTheDocument()
})

test('tag removal in the row tag editor calls onTagsChange', () => {
  const { onTagsChange } = renderRow()

  fireEvent.click(screen.getByRole('button', { name: 'Remove ambience' }))

  expect(onTagsChange).toHaveBeenCalledWith([])
})

test('delete: confirming the dialog calls onDelete', () => {
  const { onDelete } = renderRow()

  fireEvent.click(screen.getByRole('button', { name: /delete/i }))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

  expect(onDelete).toHaveBeenCalledOnce()
})

test('delete: cancelling the dialog does not call onDelete', () => {
  const { onDelete } = renderRow()

  fireEvent.click(screen.getByRole('button', { name: /delete/i }))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

  expect(onDelete).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
