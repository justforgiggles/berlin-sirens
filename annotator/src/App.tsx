import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Waveform } from './Waveform'
import { isAudioFile } from './audio'
import { nextUnlabeledGap, parseAnnotations, recordingKey, validateInterval } from './annotations'
import type { AnnotationFile, Direction, Interval, Recording } from './annotations'

type FileHandle = { getFile: () => Promise<File>; createWritable: () => Promise<{ write: (value: string) => Promise<void>; close: () => Promise<void> }> }
type PickerWindow = Window & { showOpenFilePicker: (options: object) => Promise<FileHandle[]>; showSaveFilePicker: (options: object) => Promise<FileHandle> }
type Label = 'no_siren' | 'approaching' | 'receding' | 'unknown'
const labels: Label[] = ['no_siren', 'approaching', 'receding', 'unknown']
const title = { no_siren: 'No siren', approaching: 'Siren approaching', receding: 'Siren receding', unknown: 'Siren, direction unknown' }
const format = (time: number) => `${Math.floor(time / 60)}:${(time % 60).toFixed(2).padStart(5, '0')}`

function peaksFromAudio(buffer: AudioBuffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
  const length = buffer.length
  const count = Math.min(1600, Math.max(1, Math.ceil(buffer.duration * 30)))
  const peaks: number[] = []
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * length / count)
    const end = Math.floor((i + 1) * length / count)
    let peak = 0
    for (let j = start; j < end; j++) for (const samples of channels) peak = Math.max(peak, Math.abs(samples[j]))
    peaks.push(peak)
  }
  return peaks
}

export default function App() {
  const [files, setFiles] = useState<File[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<AnnotationFile>({ version: 1, files: [] })
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [selection, setSelection] = useState<[number, number]>([0, 0])
  const [label, setLabel] = useState<Label>('no_siren')
  const [editing, setEditing] = useState<number | null>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const [waveError, setWaveError] = useState('')
  const [message, setMessage] = useState('')
  const [unsaved, setUnsaved] = useState(false)
  const [url, setUrl] = useState('')
  const media = useRef<HTMLMediaElement>(null)
  const saveHandle = useRef<FileHandle | null>(null)
  const file = files.find(item => recordingKey(item) === selected)
  const record = annotations.files.find(item => recordingKey(item) === selected)
  const intervals = record?.intervals ?? []

  useEffect(() => {
    if (!file) { setUrl(''); return }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    setPeaks([])
    setWaveError('')
    setCurrentTime(0)
    setDuration(0)
    setSelection([0, 0])
    setEditing(null)
    let cancelled = false
    const context = new AudioContext()
    file.arrayBuffer().then(data => context.decodeAudioData(data)).then(buffer => {
      if (!cancelled) setPeaks(peaksFromAudio(buffer))
    }).catch(() => {
      if (!cancelled) setWaveError('Could not decode a waveform from this file. Select converted WAV or MP3 audio to review it.')
    }).finally(() => context.close())
    return () => { cancelled = true; URL.revokeObjectURL(objectUrl) }
  }, [file])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (unsaved) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [unsaved])

  function setMetadata(seconds: number) {
    if (!file || !Number.isFinite(seconds) || seconds <= 0) return
    setDuration(seconds)
    setSelection(nextUnlabeledGap(intervals, seconds, 0) ?? [seconds, seconds])
  }

  function updateIntervals(next: Interval[]) {
    if (!file || !duration) return
    setAnnotations(previous => {
      const found = previous.files.some(item => recordingKey(item) === recordingKey(file))
      const added: Recording = { name: file.name, size: file.size, lastModified: file.lastModified, duration_s: duration, intervals: next }
      return { ...previous, files: found ? previous.files.map(item => recordingKey(item) === recordingKey(file) ? { ...item, intervals: next } : item) : [...previous.files, added] }
    })
    setUnsaved(true)
  }

  function saveRange() {
    const interval: Interval = { start_s: selection[0], end_s: selection[1], siren_detected: label !== 'no_siren', direction: label === 'no_siren' ? null : label as Direction }
    const others = intervals.filter((_, index) => index !== editing)
    const error = validateInterval(interval, duration, others)
    if (error) { setMessage(error); return }
    const updated = [...others, interval].sort((a, b) => a.start_s - b.start_s)
    updateIntervals(updated)
    setEditing(null)
    const gap = nextUnlabeledGap(updated, duration, interval.end_s)
    setSelection(gap ?? [duration, duration])
    setMessage(gap ? 'Range saved. The next unlabeled gap is selected; save JSON to write it to disk.' : 'All time is labeled. Edit or remove a range to make room; save JSON to write changes to disk.')
  }

  function editRange(index: number) {
    const item = intervals[index]
    setSelection([item.start_s, item.end_s])
    setLabel(item.siren_detected ? item.direction as Label : 'no_siren')
    setEditing(index)
    setMessage('')
  }

  async function openAnnotations() {
    try {
      const [handle] = await (window as unknown as PickerWindow).showOpenFilePicker({ types: [{ description: 'JSON annotations', accept: { 'application/json': ['.json'] } }] })
      const parsed = parseAnnotations(await (await handle.getFile()).text())
      if (unsaved && !window.confirm('Discard unsaved annotations and open another JSON file?')) return
      setAnnotations(parsed)
      const saved = parsed.files.find(item => recordingKey(item) === selected)
      if (duration) setSelection(nextUnlabeledGap(saved?.intervals ?? [], duration, 0) ?? [duration, duration])
      setEditing(null)
      saveHandle.current = handle
      setUnsaved(false)
      setMessage('Annotation file opened.')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage(`Open failed: ${String(error)}`)
    }
  }

  async function saveAnnotations(saveAs = false) {
    try {
      let handle = saveAs ? null : saveHandle.current
      if (!handle) handle = await (window as unknown as PickerWindow).showSaveFilePicker({ suggestedName: 'siren-annotations.json', types: [{ description: 'JSON annotations', accept: { 'application/json': ['.json'] } }] })
      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(annotations, null, 2) + '\n')
      await writable.close()
      saveHandle.current = handle
      setUnsaved(false)
      setMessage('Annotations saved to JSON.')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage(`Save failed: ${String(error)}`)
    }
  }

  const mediaProps = { src: url, controls: true, className: 'w-full rounded-md bg-slate-950',
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => setMetadata(event.currentTarget.duration),
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => setCurrentTime(event.currentTarget.currentTime),
    onError: () => setMessage('This browser cannot play this file. Try converted WAV or MP3 audio.') }

  return <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-semibold">Siren annotation</h1><p className="text-muted-foreground">Review local audio and mark the audible siren by time range.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={openAnnotations}>Open JSON</Button><Button variant="outline" onClick={() => saveAnnotations(true)}>Save As</Button><Button onClick={() => saveAnnotations()}>{unsaved ? 'Save JSON •' : 'Save JSON'}</Button></div>
    </header>
    {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <Card><CardHeader><CardTitle>Recordings</CardTitle></CardHeader><CardContent className="space-y-3">
        <label className="block cursor-pointer rounded-md border border-dashed p-4 text-center text-sm hover:bg-accent">Select audio files<input className="sr-only" type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.aac" onChange={event => {
          const chosen = Array.from(event.target.files ?? [])
          const next = chosen.filter(isAudioFile)
          if (next.length !== chosen.length) setMessage('Video and other non-audio files were skipped. Select audio files from data/audio.')
          setFiles(previous => [...previous, ...next.filter(item => !previous.some(old => recordingKey(old) === recordingKey(item)))])
          if (!selected && next[0]) setSelected(recordingKey(next[0]))
          event.target.value = ''
        }} /></label>
        <div className="space-y-1">{files.map(item => {
          const count = annotations.files.find(saved => recordingKey(saved) === recordingKey(item))?.intervals.length ?? 0
          return <button key={recordingKey(item)} type="button" onClick={() => setSelected(recordingKey(item))} className={`flex w-full items-center justify-between gap-2 rounded-md p-2 text-left text-sm ${selected === recordingKey(item) ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}><span className="min-w-0 truncate">{item.name}</span><Badge variant="secondary">{count}</Badge></button>
        })}</div>
      </CardContent></Card>
      <div className="space-y-6">{file ? <>
        <Card><CardHeader><CardTitle className="break-all">{file.name}</CardTitle></CardHeader><CardContent className="space-y-4">
          {url && <audio {...mediaProps} ref={element => { media.current = element }} />}
          {waveError && <p role="alert" className="text-sm text-destructive">{waveError}</p>}
          <Waveform peaks={peaks} duration={duration} currentTime={currentTime} intervals={intervals} selection={selection} onSeek={time => { if (media.current) media.current.currentTime = time; setCurrentTime(time) }} />
          <div className="flex justify-between text-sm text-muted-foreground"><span>Playhead {format(currentTime)}</span><span>Duration {format(duration)}</span></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{editing === null ? 'Add a range' : 'Edit a range'}</CardTitle></CardHeader><CardContent className="space-y-5">
          <div className="flex justify-between text-sm"><span>Start {format(selection[0])}</span><span>End {format(selection[1])}</span></div>
          <Slider min={0} max={duration || 1} step={0.01} value={selection} onValueChange={values => setSelection([values[0], values[1]])} disabled={!duration} aria-label="Selected time range" />
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setSelection([Math.min(currentTime, selection[1]), selection[1]])}>Start at playhead</Button><Button variant="outline" size="sm" onClick={() => setSelection([selection[0], Math.max(currentTime, selection[0])])}>End at playhead</Button></div>
          <label className="block text-sm font-medium">Label<select value={label} onChange={event => setLabel(event.target.value as Label)} className="mt-2 block w-full rounded-md border bg-background p-2">{labels.map(item => <option key={item} value={item}>{title[item]}</option>)}</select></label>
          <div className="flex gap-2"><Button onClick={saveRange} disabled={!duration || (editing === null && !nextUnlabeledGap(intervals, duration, 0))}>{editing === null ? 'Add range' : 'Update range'}</Button>{editing !== null && <Button variant="outline" onClick={() => { setEditing(null); setSelection(nextUnlabeledGap(intervals, duration, 0) ?? [duration, duration]) }}>Cancel edit</Button>}</div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Saved ranges</CardTitle></CardHeader><CardContent className="space-y-2">{intervals.length === 0 ? <p className="text-sm text-muted-foreground">No ranges yet. Unmarked time remains unlabeled.</p> : intervals.map((item, index) => <div key={`${item.start_s}-${item.end_s}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"><span>{format(item.start_s)}–{format(item.end_s)} · {title[item.siren_detected ? item.direction as Label : 'no_siren']}</span><span className="flex gap-1"><Button variant="outline" size="sm" onClick={() => editRange(index)}>Edit</Button><Button variant="outline" size="sm" onClick={() => { updateIntervals(intervals.filter((_, i) => i !== index)); setSelection([item.start_s, item.end_s]); setEditing(null); setMessage('Range removed. Its time is selected for a new label.') }}>Remove</Button></span></div>)}</CardContent></Card>
      </> : <Card><CardContent className="py-16 text-center text-muted-foreground">Select one or more local audio files to begin.</CardContent></Card>}</div>
    </div>
  </main>
}
