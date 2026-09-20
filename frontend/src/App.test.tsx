import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from './App'
import { listSounds, listTags } from './api/generated'

// App is just the page shell around LibraryView; LibraryView's own tests cover the
// loading/empty/populated states and every mutation flow (api/README.md: mock the
// generated client, not HTTP). This is a smoke test that the shell renders and wires
// LibraryView in.
vi.mock('./api/generated', () => ({
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

test('renders the app shell and the library it hosts', async () => {
  mockListSounds.mockResolvedValue({ data: [] } as never)
  mockListTags.mockResolvedValue({ data: [] } as never)

  render(<App />)

  expect(screen.getByRole('heading', { name: 'ElectroBard' })).toBeInTheDocument()
  expect(
    await screen.findByText(/your library is empty/i),
  ).toBeInTheDocument()
})
