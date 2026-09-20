import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { TagEditor } from './TagEditor'
import type { TagRead } from '../api/generated'

function tag(id: string, name: string): TagRead {
  return { id, name, created_at: '2026-01-01T00:00:00Z' }
}

test('renders a chip per assigned tag', () => {
  render(
    <TagEditor
      tags={[tag('t1', 'ambience'), tag('t2', 'combat')]}
      allTags={[tag('t1', 'ambience'), tag('t2', 'combat')]}
      onTagsChange={vi.fn()}
      onCreateTag={vi.fn()}
    />,
  )

  expect(screen.getByText('ambience')).toBeInTheDocument()
  expect(screen.getByText('combat')).toBeInTheDocument()
})

test('removing a chip calls onTagsChange with that tag dropped', () => {
  const onTagsChange = vi.fn()
  render(
    <TagEditor
      tags={[tag('t1', 'ambience'), tag('t2', 'combat')]}
      allTags={[tag('t1', 'ambience'), tag('t2', 'combat')]}
      onTagsChange={onTagsChange}
      onCreateTag={vi.fn()}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Remove ambience' }))

  expect(onTagsChange).toHaveBeenCalledWith(['t2'])
})

test('adding an existing tag by name calls onTagsChange with it appended', () => {
  const onTagsChange = vi.fn()
  render(
    <TagEditor
      tags={[tag('t1', 'ambience')]}
      allTags={[tag('t1', 'ambience'), tag('t2', 'combat')]}
      onTagsChange={onTagsChange}
      onCreateTag={vi.fn()}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: '+ tag' }))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'combat' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))

  expect(onTagsChange).toHaveBeenCalledWith(['t1', 't2'])
})

test('adding a name that matches no tag creates it, then assigns it', async () => {
  const onTagsChange = vi.fn()
  const onCreateTag = vi.fn().mockResolvedValue(tag('t9', 'night'))
  render(
    <TagEditor
      tags={[tag('t1', 'ambience')]}
      allTags={[tag('t1', 'ambience')]}
      onTagsChange={onTagsChange}
      onCreateTag={onCreateTag}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: '+ tag' }))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'night' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))

  // TagEditor is controlled by its `tags` prop (the parent applies the change once
  // the PATCH resolves), so this only asserts the calls it makes, not a re-render.
  await vi.waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('night'))
  expect(onTagsChange).toHaveBeenCalledWith(['t1', 't9'])
})

test('matches an existing tag name case-insensitively instead of creating a duplicate', () => {
  const onTagsChange = vi.fn()
  const onCreateTag = vi.fn()
  render(
    <TagEditor
      tags={[]}
      allTags={[tag('t1', 'ambience')]}
      onTagsChange={onTagsChange}
      onCreateTag={onCreateTag}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: '+ tag' }))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AMBIENCE' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))

  expect(onCreateTag).not.toHaveBeenCalled()
  expect(onTagsChange).toHaveBeenCalledWith(['t1'])
})

test('blank input does nothing', () => {
  const onTagsChange = vi.fn()
  render(
    <TagEditor tags={[]} allTags={[]} onTagsChange={onTagsChange} onCreateTag={vi.fn()} />,
  )

  fireEvent.click(screen.getByRole('button', { name: '+ tag' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))

  expect(onTagsChange).not.toHaveBeenCalled()
})

test('shows an inline error if creating the tag fails, without calling onTagsChange', async () => {
  const onTagsChange = vi.fn()
  const onCreateTag = vi.fn().mockRejectedValue(new Error('Tag already exists'))
  render(
    <TagEditor tags={[]} allTags={[]} onTagsChange={onTagsChange} onCreateTag={onCreateTag} />,
  )

  fireEvent.click(screen.getByRole('button', { name: '+ tag' }))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ambience' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))

  expect(await screen.findByText('Tag already exists')).toBeInTheDocument()
  expect(onTagsChange).not.toHaveBeenCalled()
})
