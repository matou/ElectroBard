import { useCallback, useEffect, useRef, useState } from 'react'
import { createLayer, deleteLayer, listLayers, listSets, updateLayer, type LayerCreate, type LayerRead, type SetRead } from '../api/generated'
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

  const saveLayer = useCallback(async (id: string | null, body: LayerCreate) => {
    const result = id
      ? await updateLayer({ path: { layer_id: id }, body })
      : await createLayer({ body })
    if (result.error || !result.data) {
      throw new Error(apiErrorMessage(result.error, 'Could not save Layer'))
    }
    const saved = result.data
    requestNumber.current++
    setLoading(false)
    setError(null)
    setConfiguration((previous) => {
      if (!previous) return previous
      return {
        layers: id
          ? previous.layers.map((layer) => layer.id === id ? saved : layer)
          : [...previous.layers, saved],
        setsByLayer: id ? previous.setsByLayer : { ...previous.setsByLayer, [saved.id]: [] },
      }
    })
    return saved
  }, [])

  const removeLayer = useCallback(async (id: string) => {
    const result = await deleteLayer({ path: { layer_id: id } })
    if (result.error) throw new Error(apiErrorMessage(result.error, 'Could not delete Layer'))
    requestNumber.current++
    setLoading(false)
    setError(null)
    setConfiguration((previous) => {
      if (!previous) return previous
      const { [id]: _removed, ...setsByLayer } = previous.setsByLayer
      void _removed
      return { layers: previous.layers.filter((layer) => layer.id !== id), setsByLayer }
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const sequence = requestNumber
    void Promise.resolve().then(() => { if (!cancelled) void refresh() })
    return () => { cancelled = true; sequence.current++ }
  }, [refresh])

  return { configuration, loading, error, refresh, saveLayer, removeLayer }
}
