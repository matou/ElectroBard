import { useEffect, useState } from 'react'
import './App.css'
import { listSounds, type SoundRead } from './api/generated'

// M0 walking skeleton: fetch the GM's library through the generated client and
// render it. The library is empty until uploads land in M1, so the visible payoff
// is the empty-library placeholder — proving browser → FastAPI → Postgres end-to-end.
// The full session view (PRD-01..04) replaces this shell in later milestones.
function App() {
  // null while the request is in flight; an array once it resolves.
  const [sounds, setSounds] = useState<SoundRead[] | null>(null)

  useEffect(() => {
    // Fetch once on mount. A dedicated error state (retry, message) is a later
    // milestone; for the M0 skeleton a failed fetch falls back to the empty library.
    listSounds()
      .then((response) => setSounds(response.data ?? []))
      .catch(() => setSounds([]))
  }, [])

  return (
    <main>
      <h1>ElectroBard</h1>
      <p>A sound board and music tool for tabletop RPG game masters.</p>
      <Library sounds={sounds} />
    </main>
  )
}

// Renders the three library states: loading, empty, and populated. Kept a small
// pure-ish component so each state is easy to test in isolation.
function Library({ sounds }: { sounds: SoundRead[] | null }) {
  if (sounds === null) {
    return <p>Loading your library…</p>
  }
  if (sounds.length === 0) {
    return <p>Your library is empty. Upload a sound to get started.</p>
  }
  return (
    <ul>
      {sounds.map((sound) => (
        <li key={sound.id}>{sound.name}</li>
      ))}
    </ul>
  )
}

export default App
