export function isAudioFile(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type.startsWith('audio/') || (!file.type && /\.(wav|mp3|m4a|flac|ogg|aac)$/i.test(file.name))
}
