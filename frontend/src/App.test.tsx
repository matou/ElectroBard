import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { listSounds } from './api/generated'

// The generated client is mocked at its interface (api/README.md): component tests
// target our UI/state logic, not the HTTP transport. Each test sets what the API
// returns, so we assert how App renders that result.
vi.mock('./api/generated', () => ({
  listSounds: vi.fn(),
}))

const mockListSounds = vi.mocked(listSounds)

beforeEach(() => {
  mockListSounds.mockReset()
})

// M0 exit criterion: the library is empty (no uploads yet), so fetching it yields
// [] and the GM sees the empty-library placeholder — the walking skeleton's payoff.
test('shows the empty-library placeholder when the API returns no sounds', async () => {
  mockListSounds.mockResolvedValue({ data: [] } as never)

  render(<App />)

  expect(
    await screen.findByText(/your library is empty/i),
  ).toBeInTheDocument()
})

// The populated branch: once uploads exist (M1+), the same fetch renders each
// Sound by name. Locks the list rendering the empty state alone can't exercise.
test('lists each sound by name when the API returns sounds', async () => {
  mockListSounds.mockResolvedValue({
    data: [
      { id: '1', name: 'Tavern ambience' },
      { id: '2', name: 'Boss battle' },
    ],
  } as never)

  render(<App />)

  expect(await screen.findByText('Tavern ambience')).toBeInTheDocument()
  expect(screen.getByText('Boss battle')).toBeInTheDocument()
})
