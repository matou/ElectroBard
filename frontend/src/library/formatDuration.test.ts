import { expect, test } from 'vitest'
import { formatDuration } from './formatDuration'

test('renders an em dash for unknown duration', () => {
  expect(formatDuration(null)).toBe('—')
})

test('renders sub-minute durations as 0:ss', () => {
  expect(formatDuration(6)).toBe('0:06')
})

test('renders minutes:seconds, zero-padded', () => {
  expect(formatDuration(161)).toBe('2:41')
})

test('renders hours:minutes:seconds past an hour', () => {
  expect(formatDuration(3792)).toBe('1:03:12')
})

test('rounds fractional seconds', () => {
  expect(formatDuration(59.6)).toBe('1:00')
})
