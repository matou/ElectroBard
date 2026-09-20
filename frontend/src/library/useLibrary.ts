import { useCallback, useEffect, useState } from 'react'
import {
  addYoutubeSound,
  createTag as createTagRequest,
  deleteSound as deleteSoundRequest,
  listSounds,
  listTags,
  updateSound,
  uploadSound,
  type SoundRead,
  type TagRead,
} from '../api/generated'
import { apiErrorMessage } from './apiError'

export interface UseLibraryResult {
  /** `null` while the initial fetch is in flight. */
  sounds: SoundRead[] | null
  /** Every tag the GM has defined, A-Z — not just ones currently assigned to a sound. */
  tags: TagRead[]
  /** Set only if the *initial* fetch failed; mutations report errors via rejected promises. */
  loadError: string | null
  // Property (arrow-function) syntax, not method shorthand: these values are plain
  // `useCallback` closures with no `this`, and method shorthand here would make
  // eslint's `unbound-method` rule flag every destructured use as this-losing.
  addFile: (file: File) => Promise<SoundRead>
  addYoutube: (url: string) => Promise<{ sound: SoundRead; embedWarning: string | null }>
  renameSound: (id: string, name: string) => Promise<SoundRead>
  setSoundTags: (id: string, tagIds: string[]) => Promise<SoundRead>
  deleteSound: (id: string) => Promise<void>
  createTag: (name: string) => Promise<TagRead>
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name)
}

function insertSorted(sounds: SoundRead[] | null, sound: SoundRead): SoundRead[] {
  return [...(sounds ?? []), sound].sort(byName)
}

// The GM's Sound Library, wired to the typed client (api/README.md — components mock
// this module's exports, never HTTP directly). One hook owns the fetch + every
// mutation so `PATCH`'s full-replace contract (SoundPatchRequest: name + tag_ids
// together, always) has exactly one place that merges in whichever half the caller
// didn't change — components never have to remember to do that themselves.
export function useLibrary(): UseLibraryResult {
  const [sounds, setSounds] = useState<SoundRead[] | null>(null)
  const [tags, setTags] = useState<TagRead[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([listSounds(), listTags()]).then(([soundsResult, tagsResult]) => {
      if (cancelled) return
      if (soundsResult.error || tagsResult.error) {
        setLoadError(
          apiErrorMessage(soundsResult.error ?? tagsResult.error, 'Could not load your library'),
        )
        setSounds([])
        setTags([])
        return
      }
      // `listTags`'s generated type doesn't carry a typed error union (unlike
      // `listSounds`), so `.data` stays optional to TS even after the error check
      // above rules it out at runtime; the `?? []` just satisfies the type.
      setSounds([...(soundsResult.data ?? [])].sort(byName))
      setTags([...(tagsResult.data ?? [])].sort(byName))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const addFile = useCallback(async (file: File) => {
    const result = await uploadSound({ body: { file } })
    if (result.error || !result.data) {
      throw new Error(apiErrorMessage(result.error, 'Could not upload sound'))
    }
    const sound = result.data
    setSounds((prev) => insertSorted(prev, sound))
    return sound
  }, [])

  const addYoutube = useCallback(async (url: string) => {
    const result = await addYoutubeSound({ body: { url } })
    if (result.error || !result.data) {
      throw new Error(apiErrorMessage(result.error, 'Could not add YouTube sound'))
    }
    const { embed_warning: embedWarning, ...sound } = result.data
    setSounds((prev) => insertSorted(prev, sound))
    return { sound, embedWarning: embedWarning ?? null }
  }, [])

  const patchSound = useCallback(
    async (id: string, body: { name: string; tag_ids: string[] }) => {
      const result = await updateSound({ path: { sound_id: id }, body })
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, 'Could not update sound'))
      }
      const updated = result.data
      setSounds((prev) => (prev ?? []).map((s) => (s.id === id ? updated : s)).sort(byName))
      return updated
    },
    [],
  )

  const renameSound = useCallback(
    (id: string, name: string) => {
      const current = sounds?.find((s) => s.id === id)
      if (!current) {
        return Promise.reject(new Error('Sound not found'))
      }
      return patchSound(id, { name, tag_ids: current.tags.map((t) => t.id) })
    },
    [sounds, patchSound],
  )

  const setSoundTags = useCallback(
    (id: string, tagIds: string[]) => {
      const current = sounds?.find((s) => s.id === id)
      if (!current) {
        return Promise.reject(new Error('Sound not found'))
      }
      return patchSound(id, { name: current.name, tag_ids: tagIds })
    },
    [sounds, patchSound],
  )

  const deleteSound = useCallback(async (id: string) => {
    const result = await deleteSoundRequest({ path: { sound_id: id } })
    if (result.error) {
      throw new Error(apiErrorMessage(result.error, 'Could not delete sound'))
    }
    setSounds((prev) => (prev ?? []).filter((s) => s.id !== id))
  }, [])

  const createTag = useCallback(async (name: string) => {
    const result = await createTagRequest({ body: { name } })
    if (result.error || !result.data) {
      throw new Error(apiErrorMessage(result.error, 'Could not create tag'))
    }
    const tag = result.data
    setTags((prev) => [...prev, tag].sort(byName))
    return tag
  }, [])

  return {
    sounds,
    tags,
    loadError,
    addFile,
    addYoutube,
    renameSound,
    setSoundTags,
    deleteSound,
    createTag,
  }
}
