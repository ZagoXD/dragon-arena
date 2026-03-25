import { useEffect, useRef } from 'react'

type UpdateFn = (deltaMs: number) => void

/**
 * useGameLoop: Robust 60fps loop that survives background throttling.
 * Uses a Web Worker as a heartbeat to ensure the logic continues even when minimized.
 */
export function useGameLoop(update: UpdateFn): void {
  const callbackRef = useRef<UpdateFn>(update)
  callbackRef.current = update

  useEffect(() => {
    let lastTime = performance.now()
    let worker: Worker | null = null

    try {
      // Use Vite's worker constructor
      worker = new Worker(new URL('./timer.worker.ts', import.meta.url), { type: 'module' })
      
      worker.onmessage = () => {
        const now = performance.now()
        const deltaMs = Math.min(now - lastTime, 100)
        lastTime = now
        callbackRef.current(deltaMs)
      }

      worker.postMessage('start')
    } catch (e) {
      console.warn('GameLoop: Worker failed, falling back to requestAnimationFrame', e)
      
      let rafId: number
      const rafLoop = (timestamp: number) => {
        const deltaMs = Math.min(timestamp - lastTime, 100)
        lastTime = timestamp
        callbackRef.current(deltaMs)
        rafId = requestAnimationFrame(rafLoop)
      }
      rafId = requestAnimationFrame(rafLoop)
      return () => cancelAnimationFrame(rafId)
    }

    return () => {
      if (worker) {
        worker.postMessage('stop')
        worker.terminate()
      }
    }
  }, [])
}
