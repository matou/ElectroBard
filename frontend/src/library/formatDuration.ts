// Renders `SoundRead.duration_seconds` as `m:ss` (or `h:mm:ss` past an hour). `null`
// means "no duration known" (unparseable upload, or a YouTube sound — oEmbed never
// reports one, api-contract.md) and is a distinct case from the errored "Unavailable"
// pill callers render instead, so this never needs to produce that text itself.
export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return '—'
  }

  const total = Math.round(seconds)
  const hrs = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60

  const paddedSecs = secs.toString().padStart(2, '0')
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${paddedSecs}`
  }
  return `${mins}:${paddedSecs}`
}
