import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

// Trivial component test: proves the harness (Vitest + jsdom + Testing Library)
// runs and the app shell mounts. Asserts visible text, so it survives refactors
// of App's internals.
test('renders the ElectroBard app shell', () => {
  render(<App />)
  expect(
    screen.getByRole('heading', { name: /electrobard/i }),
  ).toBeInTheDocument()
})
