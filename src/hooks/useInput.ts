import { useEffect, useRef } from 'react'

/**
 * Tracks which keyboard keys are currently held down.
 * Returns a stable React ref (not state) so reads inside rAF callbacks
 * are always up-to-date without causing re-renders.
 */
export function useInput(): React.RefObject<Set<string>> {
  const keys = useRef<Set<string>>(new Set())

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return keys
}
