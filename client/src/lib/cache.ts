/**
 * In-memory audio blob cache keyed by exact story text.
 * Prevents regenerating the same narration on repeated plays.
 */
const audioCache = new Map<string, Blob>();

export function getCachedAudio(text: string): Blob | undefined {
  return audioCache.get(text);
}

export function setCachedAudio(text: string, blob: Blob): void {
  audioCache.set(text, blob);
}

export function clearAudioCache(): void {
  audioCache.clear();
}

export function getAudioCacheSize(): number {
  return audioCache.size;
}
