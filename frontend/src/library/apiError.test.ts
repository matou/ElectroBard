import { expect, test } from 'vitest'
import { apiErrorMessage } from './apiError'

test('extracts a plain string detail (404/409 shape)', () => {
  expect(apiErrorMessage({ detail: 'Sound not found' })).toBe('Sound not found')
})

test('joins validation-error messages (422 shape)', () => {
  expect(
    apiErrorMessage({
      detail: [
        { loc: ['body', 'name'], msg: 'field required', type: 'missing' },
        { loc: ['body', 'tag_ids'], msg: 'unknown tag id', type: 'value_error' },
      ],
    }),
  ).toBe('field required; unknown tag id')
})

test('falls back on an unrecognised shape', () => {
  expect(apiErrorMessage(new Error('network down'))).toBe('Request failed')
})

test('accepts a custom fallback message', () => {
  expect(apiErrorMessage(undefined, 'Could not add sound')).toBe('Could not add sound')
})
