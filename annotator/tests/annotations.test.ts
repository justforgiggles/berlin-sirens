import assert from 'node:assert/strict'
import test from 'node:test'
import { nextUnlabeledGap, parseAnnotations, validateInterval } from '../src/annotations.ts'

test('ranges stay valid, disjoint, and preserve unknown direction', () => {
  const first = { start_s: 0, end_s: 2, siren_detected: true, direction: 'unknown' as const }
  assert.equal(validateInterval(first, 5, []), null)
  assert.match(validateInterval({ ...first, start_s: 1 }, 5, [first]) ?? '', /overlap/)
  assert.equal(validateInterval({ start_s: 2, end_s: 5, siren_detected: false, direction: null }, 5, [first]), null)
  const json = JSON.stringify({ version: 1, files: [{ name: 'a.wav', size: 12, lastModified: 1, duration_s: 5, intervals: [first] }] })
  assert.deepEqual(parseAnnotations(json).files[0].intervals[0], first)
})

test('adding a range selects the next gap and preserves the exact file end', () => {
  const duration = 4.7986875
  const first = { start_s: 0, end_s: 2, siren_detected: true, direction: 'approaching' as const }
  const second = { start_s: 2, end_s: duration, siren_detected: true, direction: 'receding' as const }
  assert.deepEqual(nextUnlabeledGap([first], duration, first.end_s), [2, duration])
  assert.equal(validateInterval(second, duration, [first]), null)
  assert.equal(nextUnlabeledGap([first, second], duration, second.end_s), null)
  const middle = { ...first, start_s: 1, end_s: 2 }
  assert.deepEqual(nextUnlabeledGap([middle], duration, middle.end_s), [2, duration])
  assert.deepEqual(nextUnlabeledGap([middle, second], duration, duration), [0, 1])
})
