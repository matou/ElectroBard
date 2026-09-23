import { useCallback, useEffect, useRef, useState } from 'react'
import { listLayers, listSets, type LayerRead, type SetRead } from '../api/generated'
import { apiErrorMessage } from '../library/apiError'

export type Configuration = {
  layers: LayerRead[]
  setsByLayer: Record<string, SetRead[]>
}

// Keep transport and refresh handling here so the view consumes canonical,
// ordered collections from the server.
export function useConfiguration() {
  const [configuration, setConfiguration] = useState<Configuration | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestNumber = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++requestNumber.current
    setLoading(true)
    setError(null)
    try {
      const layerResult = await listLayers()
      if (layerResult.error || !layerResult.data) {
        throw new Error(apiErrorMessage(layerResult.error, 'Could not load Layers & Sets'))
      }
      const layers = layerResult.data
      const setResults = await Promise.all(layers.map((layer) => listSets({ path: { layer_id: layer.id } })))
      const setsByLayer: Record<string, SetRead[]> = {}
      for (let index = 0; index < layers.length; index++) {
        const result = setResults[index]
        if (result.error || !result.data) {
          throw new Error(apiErrorMessage(result.error, 'Could not load Layers & Sets'))
        }
        setsByLayer[layers[index].id] = result.data
      }
      if (request === requestNumber.current) setConfiguration({ layers, setsByLayer })
    } catch (cause) {
      if (request === requestNumber.current) {
        setError(cause instanceof Error ? cause.message : 'Could not load Layers & Sets')
      }
    } finally {
      if (request === requestNumber.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const sequence = requestNumber
    void Promise.resolve().then(() => { if (!cancelled) void refresh() })
    return () => { cancelled = true; sequence.current++ }
  }, [refresh])

  return { configuration, loading, error, refresh }
}
