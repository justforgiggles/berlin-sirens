import { useEffect, useRef } from 'react'
import type { Interval } from './annotations'

const colors = { approaching: '#22c55e', receding: '#f97316', unknown: '#eab308', no_siren: '#64748b' }

export function Waveform({ peaks, duration, currentTime, intervals, selection, onSeek }: {
  peaks: number[]; duration: number; currentTime: number; intervals: Interval[];
  selection: [number, number]; onSeek: (time: number) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const ratio = devicePixelRatio || 1
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(ratio, ratio)
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, width, height)
      if (duration > 0) {
        for (const item of intervals) {
          ctx.fillStyle = colors[item.siren_detected ? item.direction! : 'no_siren'] + '55'
          ctx.fillRect(item.start_s / duration * width, 0, (item.end_s - item.start_s) / duration * width, height)
        }
        ctx.fillStyle = '#ffffff18'
        ctx.fillRect(selection[0] / duration * width, 0, (selection[1] - selection[0]) / duration * width, height)
      }
      ctx.fillStyle = '#cbd5e1'
      for (let x = 0; x < width; x++) {
        const index = Math.floor(x / width * peaks.length)
        const amplitude = peaks[index] ?? 0
        const bar = Math.max(1, amplitude * (height - 12))
        ctx.fillRect(x, (height - bar) / 2, 1, bar)
      }
      if (duration > 0) {
        ctx.fillStyle = '#f8fafc'
        ctx.fillRect(currentTime / duration * width - 1, 0, 2, height)
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [peaks, duration, currentTime, intervals, selection])

  return <canvas ref={ref} className="h-36 w-full cursor-crosshair rounded-md" role="slider" tabIndex={0}
    aria-label="Audio waveform seek position" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={currentTime}
    onClick={event => onSeek(Math.min(duration, Math.max(0, event.nativeEvent.offsetX / event.currentTarget.clientWidth * duration)))}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        onSeek(Math.min(duration, Math.max(0, currentTime + (event.key === 'ArrowRight' ? 0.25 : -0.25))))
      }
    }} />
}
