import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { createLayer, deleteLayer, listLayers, listSets, updateLayer, type LayerRead, type SetRead } from '../api/generated'
import { ConfigurationView } from './ConfigurationView'

vi.mock('../api/generated', () => ({ listLayers: vi.fn(), listSets: vi.fn(), createLayer: vi.fn(), updateLayer: vi.fn(), deleteLayer: vi.fn() }))
const mockLayers = vi.mocked(listLayers)
const mockSets = vi.mocked(listSets)
const mockCreate = vi.mocked(createLayer)
const mockUpdate = vi.mocked(updateLayer)
const mockDelete = vi.mocked(deleteLayer)

const layer = (id: string, name: string): LayerRead => ({ id, name, position: 0, playback_mode: 'single', volume: 80, created_at: '' })
const set = (id: string, layerId: string, name: string): SetRead => ({ id, layer_id: layerId, name, position: 0, loop: false, shuffle: true, tags: [], created_at: '' })

beforeEach(() => {
  mockLayers.mockReset()
  mockSets.mockReset()
  mockCreate.mockReset()
  mockUpdate.mockReset()
  mockDelete.mockReset()
})

test('Add Layer is an unsaved draft and Save creates it with defaults', async () => {
  mockLayers.mockResolvedValue({ data: [layer('a', 'Music')] } as never)
  mockSets.mockResolvedValue({ data: [] } as never)
  mockCreate.mockResolvedValue({ data: layer('b', 'Rain') } as never)
  render(<ConfigurationView />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add Layer' }))
  expect(mockCreate).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Rain' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ body: { name: 'Rain', playback_mode: 'single', volume: 80 } }))
  expect(await screen.findByRole('region', { name: 'Rain' })).toBeInTheDocument()
})

test('shows loading, then preserves server order and selects a Set', async () => {
  mockLayers.mockResolvedValue({ data: [layer('b', 'Music'), layer('a', 'Ambience')] } as never)
  mockSets.mockImplementation(({ path }) => Promise.resolve({ data: path.layer_id === 'b' ? [set('y', 'b', 'Finale'), set('x', 'b', 'Intro')] : [] }) as never)

  render(<ConfigurationView />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading Layers & Sets')
  const outline = await screen.findByRole('region', { name: 'Outline' })
  expect(within(outline).getAllByRole('button').map((button) => button.textContent)).toEqual(['Music', 'Finale', 'Intro', 'Ambience', 'Add Layer'])
  expect(within(screen.getByRole('region', { name: 'Music' })).getByRole('textbox', { name: 'Volume' })).toHaveValue('80')
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
  expect(within(await screen.findByRole('region', { name: 'Ambience' })).getByRole('textbox', { name: 'Volume' })).toHaveValue('80')
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Ambience' })).toHaveFocus())
  expect(screen.getByText('No Sets in this Layer')).toBeInTheDocument()
})

test('shows retry on failure and a first-Layer action for an empty account', async () => {
  mockLayers.mockResolvedValueOnce({ error: { detail: 'Unavailable' } } as never)
  mockLayers.mockResolvedValueOnce({ data: [] } as never)
  render(<ConfigurationView />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: 'No Layers yet' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Create first Layer' })).toBeEnabled()
  expect(screen.queryByRole('region', { name: /settings/i })).not.toBeInTheDocument()
})

test('reports a Set fetch error without showing a partial outline', async () => {
  mockLayers.mockResolvedValue({ data: [layer('a', 'Ambience')] } as never)
  mockSets.mockResolvedValue({ error: { detail: 'Set request failed' } } as never)
  render(<ConfigurationView />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Set request failed')
  expect(screen.queryByRole('region', { name: 'Outline' })).not.toBeInTheDocument()
})

const load = (layers: LayerRead[], setsByLayer: Record<string, SetRead[]> = {}) => {
  mockLayers.mockResolvedValue({ data: layers } as never)
  mockSets.mockImplementation(({ path }) => Promise.resolve({ data: setsByLayer[path.layer_id] ?? [] }) as never)
  render(<ConfigurationView />)
}

test('first Layer starts with server defaults and is created only on Save', async () => {
  load([])
  fireEvent.click(await screen.findByRole('button', { name: 'Create first Layer' }))
  expect(mockCreate).not.toHaveBeenCalled()
  expect(screen.getByRole('combobox', { name: 'Playback mode' })).toHaveValue('single')
  expect(screen.getByRole('textbox', { name: 'Volume' })).toHaveValue('80')
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(screen.getByText('Enter a Layer name.')).toBeInTheDocument()
  expect(mockCreate).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Music' } })
  mockCreate.mockResolvedValue({ data: layer('a', 'Music') } as never)
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(await screen.findByRole('region', { name: 'Music' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'No Layers yet' })).not.toBeInTheDocument()
})

test.each([
  ['whitespace', ' \u2003 ', 'Enter a Layer name.'],
  ['too long', 'a'.repeat(101), 'Layer name must be 100 characters or fewer.'],
  ['control character', 'Bad\u0000name', 'Layer name must not contain control characters.'],
])('keeps %s name drafts and does not submit them', async (_case, value, message) => {
  load([layer('a', 'Music')])
  fireEvent.click(await screen.findByRole('button', { name: 'Add Layer' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value } })
  expect(screen.getByText(message)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(mockCreate).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(value)
})

test.each(['', '-1', '101', '1.5', '1e2'])('rejects invalid volume draft %s', async (value) => {
  load([layer('a', 'Music')])
  await screen.findByRole('region', { name: 'Music' })
  fireEvent.change(screen.getByRole('textbox', { name: 'Volume' }), { target: { value } })
  expect(screen.getByText('Volume must be a whole number from 0 to 100.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(mockUpdate).not.toHaveBeenCalled()
})

test('edit is staged, Cancel resets, and successful save uses canonical server values', async () => {
  load([layer('a', 'Music')])
  await screen.findByRole('region', { name: 'Music' })
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: '  Rain  ' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Playback mode' }), { target: { value: 'multiset' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Volume' }), { target: { value: '0' } })
  expect(mockUpdate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel changes' }))
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Music')
  expect(screen.getByRole('textbox', { name: 'Volume' })).toHaveValue('80')
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: '  Rain  ' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Playback mode' }), { target: { value: 'self_stacking' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Volume' }), { target: { value: '100' } })
  mockUpdate.mockResolvedValue({ data: { ...layer('a', 'Rain'), playback_mode: 'self_stacking', volume: 100 } } as never)
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ path: { layer_id: 'a' }, body: { name: 'Rain', playback_mode: 'self_stacking', volume: 100 } }))
  expect(await screen.findByRole('region', { name: 'Rain' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Rain')
})

test('server 422 and general save failures retain the editable draft', async () => {
  load([layer('a', 'Music')])
  await screen.findByRole('region', { name: 'Music' })
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Rain' } })
  mockUpdate.mockResolvedValueOnce({ error: { detail: [{ msg: 'Server rejected name' }] } } as never)
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Server rejected name')
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Rain')
  expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument()
  mockUpdate.mockRejectedValueOnce(new Error('Network failed'))
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Network failed')
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Rain')
})

test('duplicate Layer names are allowed and canonical create response drives the outline', async () => {
  load([layer('a', 'Music')])
  fireEvent.click(await screen.findByRole('button', { name: 'Add Layer' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: ' Music ' } })
  mockCreate.mockResolvedValue({ data: layer('b', 'Music') } as never)
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ body: { name: 'Music', playback_mode: 'single', volume: 80 } }))
  expect(within(screen.getByRole('region', { name: 'Outline' })).getAllByRole('button', { name: 'Music' })).toHaveLength(2)
})

test('delete confirms cascading Set count, selects a neighbor, then offers first-Layer creation', async () => {
  load([layer('a', 'Music'), layer('b', 'Rain')], { a: [set('x', 'a', 'Storm'), set('y', 'a', 'Wind')] })
  await screen.findByRole('region', { name: 'Music' })
  fireEvent.click(screen.getByRole('button', { name: 'Delete Layer' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete Layer Music?' })
  expect(dialog).toHaveTextContent('2 Sets')
  expect(dialog).toHaveTextContent('Library Sounds are unaffected')
  expect(mockDelete).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(mockDelete).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete Layer' }))
  mockDelete.mockResolvedValue({} as never)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Layer' }))
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith({ path: { layer_id: 'a' } }))
  expect(await screen.findByRole('region', { name: 'Rain' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Delete Layer' }))
  mockDelete.mockResolvedValue({} as never)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Layer' }))
  expect(await screen.findByRole('heading', { name: 'No Layers yet' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Create first Layer' })).toBeEnabled()
})

test('100 Unicode code points and Unicode edge whitespace are valid', async () => {
  load([layer('a', 'Music')])
  fireEvent.click(await screen.findByRole('button', { name: 'Add Layer' }))
  const name = '🎵'.repeat(100)
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: `\u2003${name}\u2003` } })
  mockCreate.mockResolvedValue({ data: layer('b', name) } as never)
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ body: { name, playback_mode: 'single', volume: 80 } }))
})

test('a one-code-point name is valid at the lower boundary', async () => {
  load([layer('a', 'Music')])
  fireEvent.click(await screen.findByRole('button', { name: 'Add Layer' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: '🎵' } })
  mockCreate.mockResolvedValue({ data: layer('b', '🎵') } as never)
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ body: { name: '🎵', playback_mode: 'single', volume: 80 } }))
})

test('a Unicode Cc character inside a name is rejected', async () => {
  load([layer('a', 'Music')])
  fireEvent.click(await screen.findByRole('button', { name: 'Add Layer' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Bad\u0085name' } })
  expect(screen.getByText('Layer name must not contain control characters.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(mockCreate).not.toHaveBeenCalled()
})

test('pending save and delete cannot submit twice', async () => {
  load([layer('a', 'Music')])
  await screen.findByRole('region', { name: 'Music' })
  let finishSave: (result: unknown) => void = () => { throw new Error('missing resolver') }
  mockUpdate.mockImplementation(() => new Promise((resolve) => { finishSave = resolve }) as never)
  fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  expect(mockUpdate).toHaveBeenCalledTimes(1)
  finishSave({ data: layer('a', 'Music') })
  await screen.findByRole('status')
  fireEvent.click(screen.getByRole('button', { name: 'Delete Layer' }))
  let finishDelete: (result: unknown) => void = () => { throw new Error('missing resolver') }
  mockDelete.mockImplementation(() => new Promise((resolve) => { finishDelete = resolve }) as never)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Layer' }))
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deleting…' })).toBeDisabled()
  expect(mockDelete).toHaveBeenCalledTimes(1)
  finishDelete({})
  expect(await screen.findByRole('heading', { name: 'No Layers yet' })).toBeInTheDocument()
})

test('failed delete reports the error and preserves the Layer', async () => {
  load([layer('a', 'Music')])
  await screen.findByRole('region', { name: 'Music' })
  fireEvent.click(screen.getByRole('button', { name: 'Delete Layer' }))
  mockDelete.mockResolvedValue({ error: { detail: 'Delete failed' } } as never)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Layer' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Delete failed')
  expect(screen.getByRole('region', { name: 'Music' })).toBeInTheDocument()
})
