import { expect, test } from 'vitest'
import { initialStatus, reduce } from './playerStatus'

test('PLAY from idle loads then plays', () => {
  const { status, effects } = reduce(initialStatus('file'), { t: 'PLAY' })

  expect(status.state).toBe('loading')
  expect(effects).toEqual([{ type: 'DRIVER_LOAD' }, { type: 'DRIVER_PLAY' }])
})

test('PLAY while already playing is a no-op', () => {
  const playing = { kind: 'file' as const, state: 'playing' as const, volume: 100 }

  const { status, effects } = reduce(playing, { t: 'PLAY' })

  expect(status).toBe(playing)
  expect(effects).toEqual([])
})

test('PLAY clears a prior error', () => {
  const errored = {
    kind: 'file' as const,
    state: 'error' as const,
    volume: 100,
    errorClass: 'transient' as const,
    errorDetail: 'Could not load file',
  }

  const { status } = reduce(errored, { t: 'PLAY' })

  expect(status.state).toBe('loading')
  expect(status.errorClass).toBeUndefined()
  expect(status.errorDetail).toBeUndefined()
})

test('STOP while playing stops the driver', () => {
  const playing = { kind: 'youtube' as const, state: 'playing' as const, volume: 100 }

  const { status, effects } = reduce(playing, { t: 'STOP' })

  expect(status.state).toBe('stopped')
  expect(effects).toEqual([{ type: 'DRIVER_STOP' }])
})

test('STOP from idle is a no-op (nothing to stop)', () => {
  const idle = initialStatus('file')

  const { status, effects } = reduce(idle, { t: 'STOP' })

  expect(status).toBe(idle)
  expect(effects).toEqual([])
})

test('SET_VOLUME clamps to 0-100', () => {
  const status = initialStatus('file')

  expect(reduce(status, { t: 'SET_VOLUME', volume: 150 }).status.volume).toBe(100)
  expect(reduce(status, { t: 'SET_VOLUME', volume: -10 }).status.volume).toBe(0)
  expect(reduce(status, { t: 'SET_VOLUME', volume: 42 }).status.volume).toBe(42)
})

test('FILE_PLAY moves loading to playing', () => {
  const loading = { kind: 'file' as const, state: 'loading' as const, volume: 100 }

  const { status } = reduce(loading, { t: 'FILE_PLAY' })

  expect(status.state).toBe('playing')
})

test('FILE_END reaches the ended state', () => {
  const playing = { kind: 'file' as const, state: 'playing' as const, volume: 100 }

  const { status } = reduce(playing, { t: 'FILE_END' })

  expect(status.state).toBe('ended')
})

test.each([
  ['FILE_LOADERROR', 'Could not load file'],
] as const)('%s is always transient — file sounds never persist is_errored (#25)', (eventType, detail) => {
  const loading = { kind: 'file' as const, state: 'loading' as const, volume: 100 }

  const { status, effects } = reduce(loading, { t: eventType })

  expect(status.state).toBe('error')
  expect(status.errorClass).toBe('transient')
  expect(status.errorDetail).toBe(detail)
  expect(effects).toEqual([]) // no PERSIST_ERRORED
})

test('FILE_PLAYERROR during an attempted start is blocked, with no Sound error', () => {
  const loading = reduce(initialStatus('file'), { t: 'PLAY' }).status
  const { status, effects } = reduce(loading, { t: 'FILE_PLAYERROR', blocked: true })
  expect(status.state).toBe('blocked')
  expect(status.errorClass).toBeUndefined()
  expect(effects).toEqual([])
  expect(reduce(status, { t: 'PLAY' }).status.state).toBe('loading')
})

test.each([
  [101, 'persistent', 'Embedding disabled by owner'],
  [150, 'persistent', 'Embedding disabled by owner'],
  [100, 'persistent', 'Video removed or private'],
  [2, 'persistent', 'Invalid video id'],
  [5, 'transient', 'Player error (HTML5)'],
] as const)('YT_ERROR code %i classifies as %s (ADR-0007)', (code, errorClass, detail) => {
  const playing = { kind: 'youtube' as const, state: 'playing' as const, volume: 100 }

  const { status, effects } = reduce(playing, { t: 'YT_ERROR', code })

  expect(status.state).toBe('error')
  expect(status.errorClass).toBe(errorClass)
  expect(status.errorDetail).toBe(detail)
  if (errorClass === 'persistent') {
    expect(effects).toEqual([{ type: 'PERSIST_ERRORED', detail }])
  } else {
    expect(effects).toEqual([])
  }
})

test('YT_BUFFERING/PLAYING/PAUSED/ENDED map onto the unified vocabulary', () => {
  const playing = { kind: 'youtube' as const, state: 'idle' as const, volume: 100 }

  expect(reduce(playing, { t: 'YT_BUFFERING' }).status.state).toBe('loading')
  expect(reduce(playing, { t: 'YT_PLAYING' }).status.state).toBe('playing')
  // No pause affordance in the no-seek preview slice — a pause reads as stopped.
  const active = { ...playing, state: 'playing' as const }
  expect(reduce(active, { t: 'YT_PAUSED' }).status.state).toBe('stopped')
  expect(reduce(active, { t: 'YT_ENDED' }).status.state).toBe('ended')
})

test('callbacks from a previous attempt do not stop a retry that is loading', () => {
  const loading = reduce({ kind: 'youtube' as const, state: 'blocked' as const, volume: 100 }, { t: 'PLAY' }).status
  expect(reduce(loading, { t: 'YT_PAUSED' }).status.state).toBe('loading')
  expect(reduce({ ...loading, kind: 'file' }, { t: 'FILE_STOP' }).status.state).toBe('loading')
})

test('kind is preserved across every transition', () => {
  const status = initialStatus('youtube')

  const { status: afterPlay } = reduce(status, { t: 'PLAY' })
  const { status: afterError } = reduce(afterPlay, { t: 'YT_ERROR', code: 100 })

  expect(afterError.kind).toBe('youtube')
})
