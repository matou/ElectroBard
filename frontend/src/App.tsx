import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import './App.css'
import { listLayers, listSets } from './api/generated'
import { ConfigurationView } from './configuration/ConfigurationView'
import { LibraryView } from './library/LibraryView'
import { Program } from './session/Program'
import { SessionView } from './session/SessionView'

type Page = 'library' | 'configuration' | 'session'

function pageFromPath(): Page {
  return window.location.pathname === '/session' ? 'session' : window.location.pathname === '/layers-sets' ? 'configuration' : 'library'
}

function App() {
  const [page, setPage] = useState<Page>(pageFromPath)
  const heading = useRef<HTMLHeadingElement>(null)
  const configurationRequest = useRef(0)
  const [program] = useState(() => new Program())

  const applySavedConfiguration = useCallback(() => {
    const request = ++configurationRequest.current
    void (async () => {
      const layers = (await listLayers()).data
      if (!layers) return
      const results = await Promise.all(layers.map((layer) => listSets({ path: { layer_id: layer.id } })))
      if (results.some((result) => !result.data)) return
      if (request === configurationRequest.current) program.applySavedConfiguration(layers, results.flatMap((result) => result.data ?? []))
    })().catch(() => { /* Session refresh can retry if the API is unavailable. */ })
  }, [program])

  useEffect(() => {
    const dispose = () => program.dispose()
    window.addEventListener('pagehide', dispose)
    return () => window.removeEventListener('pagehide', dispose)
  }, [program])

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
    const path = destination === 'library' ? '/' : destination === 'configuration' ? '/layers-sets' : '/session'
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
            <a href="/session" aria-current={page === 'session' ? 'page' : undefined} onClick={(event) => navigate(event, 'session')}>Session</a>
            <button className="session-stop-all" onClick={() => program.stopAll()}>Stop all</button>
          </nav>
        </div>
      </header>
      <main className={page === 'session' ? 'session-main' : undefined}>
        <h1 ref={heading} tabIndex={-1}>{page === 'library' ? 'Sound Library' : page === 'configuration' ? 'Layers & Sets' : 'Session'}</h1>
        {page === 'library' ? <LibraryView /> : page === 'configuration' ? <ConfigurationView onSaved={applySavedConfiguration} /> : <SessionView program={program} />}
      </main>
    </>
  )
}

export default App
