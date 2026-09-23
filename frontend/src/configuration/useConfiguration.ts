import { useCallback, useEffect, useRef, useState } from 'react'
import { createLayer, createSet, deleteLayer, deleteSet, listLayers, listSets, listTags, updateLayer, updateSet, type LayerCreate, type LayerRead, type SetCreate, type SetRead, type SetUpdate, type TagRead } from '../api/generated'
import { apiErrorMessage } from '../library/apiError'

export type Configuration = {
  layers: LayerRead[]
  setsByLayer: Record<string, SetRead[]>
  tags: TagRead[]
}

// Keep transport and refresh handling here so the view consumes canonical,
// ordered collections from the server.
export function useConfiguration() {
  const [configuration, setConfiguration] = useState<Configuration | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
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
      const [setResults, tagResult] = await Promise.all([
        Promise.all(layers.map((layer) => listSets({ path: { layer_id: layer.id } }))),
        listTags(),
      ])
      if (tagResult.error || !tagResult.data) throw new Error(apiErrorMessage(tagResult.error, 'Could not load Tags'))
      const setsByLayer: Record<string, SetRead[]> = {}
      for (let index = 0; index < layers.length; index++) {
        const result = setResults[index]
        if (result.error || !result.data) {
          throw new Error(apiErrorMessage(result.error, 'Could not load Layers & Sets'))
        }
        setsByLayer[layers[index].id] = result.data
      }
      if (request === requestNumber.current) {
        setConfiguration({ layers, setsByLayer, tags: tagResult.data })
        setRefreshRevision((revision) => revision + 1)
      }
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
        tags: previous.tags,
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
      return { layers: previous.layers.filter((layer) => layer.id !== id), setsByLayer, tags: previous.tags }
    })
  }, [])

  const saveSet = useCallback(async (layerId: string, id: string | null, body: SetCreate | SetUpdate) => {
    const result = id
      ? await updateSet({ path: { set_id: id }, body })
      : await createSet({ path: { layer_id: layerId }, body: body as SetCreate })
    if (result.error || !result.data) throw new Error(apiErrorMessage(result.error, 'Could not save Set'))
    const saved = result.data
    requestNumber.current++
    setConfiguration((previous) => previous ? {
      ...previous,
      setsByLayer: {
        ...previous.setsByLayer,
        [layerId]: id
          ? previous.setsByLayer[layerId].map((item) => item.id === id ? saved : item)
          : [...previous.setsByLayer[layerId], saved],
      },
    } : previous)
    return saved
  }, [])

  const removeSet = useCallback(async (setId: string, layerId: string) => {
    const result = await deleteSet({ path: { set_id: setId } })
    if (result.error) throw new Error(apiErrorMessage(result.error, 'Could not delete Set'))
    requestNumber.current++
    setConfiguration((previous) => previous ? {
      ...previous,
      setsByLayer: {
        ...previous.setsByLayer,
        [layerId]: previous.setsByLayer[layerId].filter((item) => item.id !== setId),
      },
    } : previous)
  }, [])

  useEffect(() => {
    let cancelled = false
    const sequence = requestNumber
    void Promise.resolve().then(() => { if (!cancelled) void refresh() })
    return () => { cancelled = true; sequence.current++ }
  }, [refresh])

  return { configuration, loading, error, refresh, refreshRevision, saveLayer, removeLayer, saveSet, removeSet }
}
