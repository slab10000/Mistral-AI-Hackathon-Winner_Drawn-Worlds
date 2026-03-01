import { getCachedAudio, setCachedAudio } from './cache';

const API_BASE = 'https://api.elevenlabs.io/v1';
const MIME     = 'audio/mpeg';

// ---------------------------------------------------------------------------
// Streaming TTS
// ---------------------------------------------------------------------------

/**
 * Step 6 — ElevenLabs streaming TTS.
 *
 * Calls `/text-to-speech/{voiceId}/stream`, fires `onUrl` with a playable URL
 * as soon as possible (either a cached blob URL or a MediaSource URL), then
 * streams remaining audio in the background.
 *
 * Cache: first full download is stored; subsequent calls return instantly.
 *
 * @param text     Story text to narrate
 * @param voiceId  ElevenLabs voice ID
 * @param apiKey   ElevenLabs API key
 * @param onUrl    Called with a playable URL before the full download finishes
 */
export async function streamSpeech(
  text: string,
  voiceId: string,
  apiKey: string,
  onUrl: (url: string) => void,
): Promise<void> {
  // ── Cache hit → instant playback ─────────────────────────────────────────
  const cached = getCachedAudio(text);
  if (cached) {
    onUrl(URL.createObjectURL(cached));
    return;
  }

  // ── Fetch the streaming endpoint ─────────────────────────────────────────
  const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',   // fastest ElevenLabs model
      voice_settings: {
        stability: 0.1,
        similarity_boost: 0.75,
        style: 1,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs ${res.status}: ${err}`);
  }

  // ── MSE path — play before full download ─────────────────────────────────
  if (
    typeof MediaSource !== 'undefined' &&
    MediaSource.isTypeSupported(MIME) &&
    res.body
  ) {
    const ms    = new MediaSource();
    const msUrl = URL.createObjectURL(ms);

    // Hand the URL to the caller immediately — audio element can start buffering
    onUrl(msUrl);

    const allChunks: ArrayBuffer[] = [];
    const queue: ArrayBuffer[]     = [];
    let   sb: SourceBuffer;
    let   streamDone = false;

    // Push next queued chunk into the SourceBuffer when it's idle
    const flush = () => {
      if (!sb || sb.updating || queue.length === 0) return;
      sb.appendBuffer(queue.shift()!);
    };

    ms.addEventListener('sourceopen', () => {
      sb = ms.addSourceBuffer(MIME);

      sb.addEventListener('updateend', () => {
        if (queue.length > 0) {
          flush();
        } else if (streamDone) {
          // All chunks appended — signal end and cache
          try { ms.endOfStream(); } catch { /* already closed */ }
          const blob = new Blob(allChunks, { type: MIME });
          setCachedAudio(text, blob);
        }
      });

      // Start draining the fetch ReadableStream
      const reader = res.body!.getReader();

      const pump = (): void => {
        reader.read().then(({ value, done }) => {
          if (done) {
            streamDone = true;
            if (!sb.updating && queue.length === 0) {
              try { ms.endOfStream(); } catch { /* already closed */ }
              const blob = new Blob(allChunks, { type: MIME });
              setCachedAudio(text, blob);
            }
            return;
          }
          // Extract a plain ArrayBuffer (satisfies BufferSource + BlobPart)
          const buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
          allChunks.push(buf);
          queue.push(buf);
          flush();
          pump();
        }).catch(err => console.error('[ElevenLabs] stream read error', err));
      };

      pump();
    }, { once: true });

    return; // resolves immediately after onUrl — streaming continues in background
  }

  // ── Fallback: collect full blob (still uses /stream for lower TTFB) ──────
  const blob = await res.blob();
  setCachedAudio(text, blob);
  onUrl(URL.createObjectURL(blob));
}

// ---------------------------------------------------------------------------
// TTS as a plain Blob (for parallel pre-generation)
// ---------------------------------------------------------------------------

/**
 * Generate TTS and return a Blob (fully downloaded).
 * Used by storyPlayer to pre-generate all audio in parallel before playback.
 */
export async function generateSpeechBlob(
  text: string,
  voiceId: string,
  apiKey: string,
): Promise<Blob> {
  const cached = getCachedAudio(text);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.1, similarity_boost: 0.75, style: 1, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs TTS ${res.status}: ${err}`);
  }
  const blob = await res.blob();
  setCachedAudio(text, blob);
  return blob;
}

// ---------------------------------------------------------------------------
// Sound Effects
// ---------------------------------------------------------------------------

const sfxCache = new Map<string, Blob>();

/**
 * Generate a sound effect using ElevenLabs /v1/sound-generation.
 * Returns an audio Blob (audio/mpeg). Cached in-memory by description.
 */
export async function generateSoundEffect(
  description: string,
  apiKey: string,
): Promise<Blob> {
  const cached = sfxCache.get(description);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/sound-generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: description,
      duration_seconds: 8,
      prompt_influence: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs SFX ${res.status}: ${err}`);
  }
  const blob = await res.blob();
  sfxCache.set(description, blob);
  return blob;
}

// ---------------------------------------------------------------------------
// Music Generation
// ---------------------------------------------------------------------------

const musicCache = new Map<string, Blob>();

/**
 * Generate background music using ElevenLabs /v1/music.
 * Returns an audio Blob. 60 seconds, instrumental, cached by description.
 */
export async function generateMusic(
  description: string,
  apiKey: string,
): Promise<Blob> {
  const cached = musicCache.get(description);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/music`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      prompt: description,
      music_length_ms: 60000,
      model_id: 'music_v1',
      force_instrumental: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs Music ${res.status}: ${err}`);
  }
  const blob = await res.blob();
  musicCache.set(description, blob);
  return blob;
}
