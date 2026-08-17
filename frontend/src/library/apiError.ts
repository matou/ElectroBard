// The generated client resolves to `{ data, error }` rather than throwing
// (api/README.md), and only 422 bodies are typed (`HttpValidationError`) — 404/409
// responses share FastAPI's plain `{ detail: string }` shape but aren't represented
// in the generated error types. This normalises whichever shape came back into one
// message a caller can show the GM.
function messageOf(item: unknown): string | null {
  if (item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string') {
    return item.msg
  }
  return null
}

export function apiErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (error && typeof error === 'object' && 'detail' in error) {
    const detail: unknown = error.detail
    if (typeof detail === 'string') {
      return detail
    }
    if (Array.isArray(detail)) {
      const messages = (detail as unknown[]).map(messageOf).filter((msg): msg is string => msg !== null)
      if (messages.length > 0) {
        return messages.join('; ')
      }
    }
  }
  return fallback
}
