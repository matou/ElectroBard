import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

test('renders nothing when closed', () => {
  render(
    <ConfirmDialog
      open={false}
      title="Delete sound?"
      message="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  )

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('renders the title and message when open', () => {
  render(
    <ConfirmDialog
      open
      title="Delete sound?"
      message="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  )

  expect(screen.getByRole('dialog', { name: 'Delete sound?' })).toBeInTheDocument()
  expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
})

test('calls onConfirm when the confirm button is clicked', () => {
  const onConfirm = vi.fn()

  render(
    <ConfirmDialog
      open
      title="Delete sound?"
      message="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  expect(onConfirm).toHaveBeenCalledOnce()
})

test('calls onCancel when the cancel button is clicked', () => {
  const onCancel = vi.fn()

  render(
    <ConfirmDialog
      open
      title="Delete sound?"
      message="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={vi.fn()}
      onCancel={onCancel}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onCancel).toHaveBeenCalledOnce()
})
