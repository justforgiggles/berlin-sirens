import assert from 'node:assert/strict'
import test from 'node:test'
import { isAudioFile } from '../src/audio.ts'

test('accepts audio and rejects video even when the picker filter is bypassed', () => {
  assert.equal(isAudioFile({ name: 'clip.wav', type: 'audio/wav' }), true)
  assert.equal(isAudioFile({ name: 'clip.WAV', type: '' }), true)
  assert.equal(isAudioFile({ name: 'clip.mp4', type: 'video/mp4' }), false)
  assert.equal(isAudioFile({ name: 'clip.MOV', type: '' }), false)
  assert.equal(isAudioFile({ name: 'clip.wav', type: 'video/mp4' }), false)
})
