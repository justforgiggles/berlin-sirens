export type Direction = 'approaching' | 'receding' | 'unknown' | null
export type Interval = { start_s: number; end_s: number; siren_detected: boolean; direction: Direction }
export type Recording = { name: string; original_name?: string; size: number; lastModified: number; duration_s: number; intervals: Interval[] }
export type AnnotationFile = { version: 1; files: Recording[] }

export const recordingKey = (file: Pick<Recording, 'name' | 'size' | 'lastModified'>) =>
  `${file.name}\u0000${file.size}\u0000${file.lastModified}`

export function validateInterval(interval: Interval, duration: number, others: Interval[]): string | null {
  const { start_s: start, end_s: end, siren_detected: siren, direction } = interval
  if (!Number.isFinite(duration) || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= end || end > duration) return 'Choose a range inside the recording.'
  if (others.some(item => start < item.end_s && end > item.start_s)) return 'This range overlaps another label.'
  if (siren ? !['approaching', 'receding', 'unknown'].includes(direction ?? '') : direction !== null) return 'Choose a valid siren and direction label.'
  return null
}

export function nextUnlabeledGap(intervals: Interval[], duration: number, after: number): [number, number] | null {
  const gaps: [number, number][] = []
  let cursor = 0
  for (const interval of [...intervals].sort((a, b) => a.start_s - b.start_s)) {
    if (interval.start_s > cursor) gaps.push([cursor, interval.start_s])
    cursor = Math.max(cursor, interval.end_s)
  }
  if (cursor < duration) gaps.push([cursor, duration])
  return gaps.find(([start]) => start >= after) ?? gaps[0] ?? null
}

export function parseAnnotations(text: string): AnnotationFile {
  const data: unknown = JSON.parse(text)
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('files' in data) || !Array.isArray(data.files)) throw new Error('Unsupported annotation file.')
  for (const file of data.files) {
    if (!file || typeof file.name !== 'string' || !Number.isFinite(file.size) || !Number.isFinite(file.lastModified) || !Number.isFinite(file.duration_s) || file.duration_s <= 0 || !Array.isArray(file.intervals)) throw new Error('Invalid recording in annotation file.')
    const accepted: Interval[] = []
    for (const interval of file.intervals) {
      if (!interval || typeof interval.siren_detected !== 'boolean' || validateInterval(interval, file.duration_s, accepted)) throw new Error(`Invalid or overlapping range in ${file.name}.`)
      accepted.push(interval)
    }
  }
  return data as AnnotationFile
}
