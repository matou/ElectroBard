import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { listLayers, listSets, type LayerRead, type SetRead } from '../api/generated'
import { ConfigurationView } from './ConfigurationView'

vi.mock('../api/generated', () => ({ listLayers: vi.fn(), listSets: vi.fn() }))
const mockLayers = vi.mocked(listLayers)
const mockSets = vi.mocked(listSets)

const layer = (id: string, name: string): LayerRead => ({ id, name, position: 0, playback_mode: 'single', volume: 80, created_at: '' })
const set = (id: string, layerId: string, name: string): SetRead => ({ id, layer_id: layerId, name, position: 0, loop: false, shuffle: true, tags: [], created_at: '' })

beforeEach(() => {
  mockLayers.mockReset()
  mockSets.mockReset()
})

test('shows loading, then preserves server order and selects a Set', async () => {
  mockLayers.mockResolvedValue({ data: [layer('b', 'Music'), layer('a', 'Ambience')] } as never)
  mockSets.mockImplementation(({ path }) => Promise.resolve({ data: path.layer_id === 'b' ? [set('y', 'b', 'Finale'), set('x', 'b', 'Intro')] : [] }) as never)

  render(<ConfigurationView />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading Layers & Sets')
  const outline = await screen.findByRole('region', { name: 'Outline' })
  expect(within(outline).getAllByRole('button').map((button) => button.textContent)).toEqual(['Music', 'Finale', 'Intro', 'Ambience'])
  expect(screen.getByRole('region', { name: 'Music' })).toHaveTextContent('80%')
  expect(within(outline).getByRole('button', { name: 'Music' })).toHaveAttribute('aria-current', 'true')
  fireEvent.click(within(outline).getByRole('button', { name: 'Finale' }))
  expect(screen.getByRole('region', { name: 'Finale' })).toHaveTextContent('Music / Set')
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Finale' })).toHaveFocus())
  expect(screen.getByRole('region', { name: 'Finale' })).toHaveTextContent('No tags selected')
  expect(within(outline).getByRole('button', { name: 'Finale' })).toHaveAttribute('aria-current', 'true')
})

test('keeps selection after refresh and falls back when its Set disappears', async () => {
  mockLayers.mockResolvedValue({ data: [layer('a', 'Ambience')] } as never)
  mockSets.mockResolvedValueOnce({ data: [set('x', 'a', 'Rain')] } as never)
  mockSets.mockResolvedValueOnce({ data: [set('x', 'a', 'Rain updated')] } as never)
  mockSets.mockResolvedValueOnce({ data: [] } as never)
  render(<ConfigurationView />)
  fireEvent.click(await screen.findByRole('button', { name: 'Rain' }))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByRole('region', { name: 'Rain updated' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByRole('region', { name: 'Ambience' })).toHaveTextContent('80%')
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ambience' })).toHaveFocus())
  expect(screen.getByText('No Sets in this Layer')).toBeInTheDocument()
})

test('shows retry on failure and a first-Layer placeholder for an empty account', async () => {
  mockLayers.mockResolvedValueOnce({ error: { detail: 'Unavailable' } } as never)
  mockLayers.mockResolvedValueOnce({ data: [] } as never)
  render(<ConfigurationView />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: 'No Layers yet' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Create first Layer/ })).toBeDisabled()
  expect(screen.queryByRole('region', { name: /settings/i })).not.toBeInTheDocument()
})

test('reports a Set fetch error without showing a partial outline', async () => {
  mockLayers.mockResolvedValue({ data: [layer('a', 'Ambience')] } as never)
  mockSets.mockResolvedValue({ error: { detail: 'Set request failed' } } as never)
  render(<ConfigurationView />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Set request failed')
  expect(screen.queryByRole('region', { name: 'Outline' })).not.toBeInTheDocument()
})
