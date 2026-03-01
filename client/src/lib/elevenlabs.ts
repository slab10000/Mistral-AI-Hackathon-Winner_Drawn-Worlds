import { getCachedAudio, setCachedAudio } from './cache';

const API_BASE = 'https://api.elevenlabs.io/v1';

// ---------------------------------------------------------------------------
// TTS generation
// ---------------------------------------------------------------------------

/**
 * Step 6 — ElevenLabs TTS.
 * Sends story text to ElevenLabs, returns an audio Blob.
 * Results are cached in-memory by exact text to avoid redundant API calls.
 *
 * @param text     The story text to narrate
 * @param voiceId  ElevenLabs voice ID
 * @param apiKey   ElevenLabs API key
 */
export async function generateSpeech(
  text: string,
  voiceId: string,
  apiKey: string,
): Promise<Blob> {
  const cached = getCachedAudio(text);
  if (cached) return cached;

  const response = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      // TODO: update model_id to 'eleven_turbo_v2_5' for faster generation if available on your plan
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs ${response.status}: ${err}`);
  }

  const blob = await response.blob();
  setCachedAudio(text, blob);
  return blob;
}
