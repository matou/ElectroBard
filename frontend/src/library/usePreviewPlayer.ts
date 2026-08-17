import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioSourcePlayer } from '../audio/AudioSourcePlayer'
import { createAudioSourcePlayer, type PlayableSound } from '../audio/createAudioSourcePlayer'
import type { PlayerStatus } from '../audio/playerStatus'

export interface PreviewSnapshot {
  soundId: string
  status: PlayerStatus
  progressSeconds: number
}

export interface UsePreviewPlayerResult {
  /** Non-null only while a preview is active — which Sound, and its live status. */
  preview: PreviewSnapshot | null
  play: (sound: PlayableSound) => void
  stop: () => void
}

// Owns the Sound Library's one active preview player (#43, PRD-01 "GM can play/stop
// any individual Sound"). Only one Sound previews at a time: starting a new preview
// disposes whatever was playing first, so two rows never sound at once. Components
// (LibraryView, SoundRow) never touch Howler/YouTube directly — only this hook talks
// to the AudioSourcePlayer seam (ADR-0007).
export function usePreviewPlayer(): UsePreviewPlayerResult {
  const activeRef = useRef<{ soundId: string; player: AudioSourcePlayer } | null>(null)
  const [preview, setPreview] = useState<PreviewSnapshot | null>(null)

  const dispose = useCallback(() => {
    activeRef.current?.player.dispose()
    activeRef.current = null
  }, [])

  useEffect(() => dispose, [dispose])

  const play = useCallback(
    (sound: PlayableSound) => {
      if (activeRef.current && activeRef.current.soundId !== sound.id) {
        dispose()
      }
      if (!activeRef.current) {
        const player = createAudioSourcePlayer(sound)
        activeRef.current = { soundId: sound.id, player }
        player.subscribe(() => {
          setPreview({ soundId: sound.id, status: player.status, progressSeconds: player.progressSeconds })
        })
      }
      activeRef.current.player.play()
      setPreview({
        soundId: sound.id,
        status: activeRef.current.player.status,
        progressSeconds: activeRef.current.player.progressSeconds,
      })
    },
    [dispose],
  )

  const stop = useCallback(() => {
    activeRef.current?.player.stop()
  }, [])

  return { preview, play, stop }
}
