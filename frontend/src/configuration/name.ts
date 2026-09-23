// Match Python's str.strip() and the server's 1–100 code point, no-Cc rule.
export function canonicalName(name: string) {
  function edgeWhitespace(character: string) {
    const code = character.codePointAt(0) ?? -1
    return (code >= 9 && code <= 13) || (code >= 28 && code <= 32)
      || code === 133 || code === 160 || code === 5760
      || (code >= 8192 && code <= 8202) || code === 8232 || code === 8233
      || code === 8239 || code === 8287 || code === 12288
  }
  const characters = [...name]
  while (characters.length && edgeWhitespace(characters[0])) characters.shift()
  while (characters.length && edgeWhitespace(characters[characters.length - 1])) characters.pop()
  return characters.join('')
}

export function nameError(name: string, kind: 'Layer' | 'Set') {
  const canonical = canonicalName(name)
  if (!canonical) return `Enter a ${kind} name.`
  if ([...canonical].length > 100) return `${kind} name must be 100 characters or fewer.`
  if ([...canonical].some((character) => {
    const code = character.codePointAt(0) ?? -1
    return code <= 31 || (code >= 127 && code <= 159)
  })) return `${kind} name must not contain control characters.`
  return null
}
