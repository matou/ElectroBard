import { useEffect, useRef, useState, type MouseEvent } from 'react'
import './App.css'
import { ConfigurationView } from './configuration/ConfigurationView'
import { LibraryView } from './library/LibraryView'

type Page = 'library' | 'configuration'

function pageFromPath(): Page {
  return window.location.pathname === '/layers-sets' ? 'configuration' : 'library'
}

function App() {
  const [page, setPage] = useState<Page>(pageFromPath)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const onPopState = () => {
      setPage(pageFromPath())
      requestAnimationFrame(() => heading.current?.focus())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(event: MouseEvent<HTMLAnchorElement>, destination: Page) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const path = destination === 'library' ? '/' : '/layers-sets'
    if (window.location.pathname !== path) window.history.pushState(null, '', path)
    setPage(destination)
    requestAnimationFrame(() => heading.current?.focus())
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <span className="app-brand">ElectroBard</span>
          <nav aria-label="Main navigation" className="app-nav">
            <a href="/" aria-current={page === 'library' ? 'page' : undefined} onClick={(event) => navigate(event, 'library')}>Sound Library</a>
            <a href="/layers-sets" aria-current={page === 'configuration' ? 'page' : undefined} onClick={(event) => navigate(event, 'configuration')}>Layers &amp; Sets</a>
            <span aria-disabled="true" title="Coming in M3">Session <small>Coming soon</small></span>
          </nav>
        </div>
      </header>
      <main>
        <h1 ref={heading} tabIndex={-1}>{page === 'library' ? 'Sound Library' : 'Layers & Sets'}</h1>
        {page === 'library' ? <LibraryView /> : <ConfigurationView />}
      </main>
    </>
  )
}

export default App
