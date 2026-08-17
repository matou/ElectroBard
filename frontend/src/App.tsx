import './App.css'
import { LibraryView } from './library/LibraryView'

// The Sound Library (PRD-01) is ElectroBard's main screen through M1. The M0 walking
// skeleton this replaced (fetch + empty-library placeholder) is now LibraryView's
// loading/empty states, exercised end-to-end via its own tests.
function App() {
  return (
    <main>
      <h1>ElectroBard</h1>
      <p>A sound board and music tool for tabletop RPG game masters.</p>
      <LibraryView />
    </main>
  )
}

export default App
