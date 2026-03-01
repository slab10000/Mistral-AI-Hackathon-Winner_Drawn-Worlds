import { generateSpeechBlob, generateSoundEffect, generateMusic } from './elevenlabs';
import { generateImagenImage } from './imagen';
import type {
  StoryEvent,
  ParagraphEvent,
  SoundEffectEvent,
  MusicEvent,
} from './agentTypes';

// ---------------------------------------------------------------------------
// Parallel audio generation
// ---------------------------------------------------------------------------

/**
 * For each paragraph + sound_effect + music event in the segment,
 * generate audio in parallel and attach audioUrl to each event.
 * Uses Promise.allSettled so one failure doesn't abort the rest.
 *
 * @param events   The agent's event array (mutated in-place with audioUrl)
 * @param voiceId  ElevenLabs voice ID
 * @param elKey    ElevenLabs API key
 */
export async function generateAudioForEvents(
  events: StoryEvent[],
  voiceId: string,
  elKey: string,
): Promise<void> {
  const tasks: Promise<void>[] = [];

  for (const ev of events) {
    if (ev.type === 'paragraph') {
      const e = ev as ParagraphEvent;
      tasks.push(
        generateSpeechBlob(e.text, voiceId, elKey)
          .then(blob => { e.audioUrl = URL.createObjectURL(blob); })
          .catch(err => console.warn('[storyPlayer] TTS failed:', err)),
      );
    } else if (ev.type === 'sound_effect') {
      const e = ev as SoundEffectEvent;
      tasks.push(
        generateSoundEffect(e.description, elKey)
          .then(blob => { e.audioUrl = URL.createObjectURL(blob); })
          .catch(err => console.warn('[storyPlayer] SFX failed:', err)),
      );
    } else if (ev.type === 'music') {
      const e = ev as MusicEvent;
      tasks.push(
        generateMusic(e.description, elKey)
          .then(blob => { e.audioUrl = URL.createObjectURL(blob); })
          .catch(err => console.warn('[storyPlayer] Music failed:', err)),
      );
    }
  }

  await Promise.allSettled(tasks);
}

// ---------------------------------------------------------------------------
// Parallel image generation (Imagen 3)
// ---------------------------------------------------------------------------

/**
 * For each paragraph event in the segment, generate an Imagen 3 illustration
 * in parallel and attach imageDataUrl to the event.
 * Uses Promise.allSettled so one failure doesn't abort the rest.
 *
 * @param events       The agent's event array (mutated in-place with imageDataUrl)
 * @param googleApiKey VITE_GOOGLE_API_KEY
 */
export async function generateImagesForEvents(
  events: StoryEvent[],
  googleApiKey: string,
): Promise<void> {
  const tasks: Promise<void>[] = [];

  for (const ev of events) {
    if (ev.type === 'paragraph') {
      const e = ev as ParagraphEvent;
      const prompt = e.imagePrompt ?? e.text;
      tasks.push(
        generateImagenImage(prompt, googleApiKey)
          .then(dataUrl => { if (dataUrl) e.imageDataUrl = dataUrl; })
          .catch(err => console.warn('[storyPlayer] Imagen failed:', err)),
      );
    }
  }

  await Promise.allSettled(tasks);
}

// ---------------------------------------------------------------------------
// Sequential playback
// ---------------------------------------------------------------------------

/** Play a single audio URL and resolve when it ends (or errors). */
function playUrl(url: string): Promise<void> {
  return new Promise(resolve => {
    const audio = new Audio(url);
    audio.onended  = () => resolve();
    audio.onerror  = () => resolve(); // don't block story on a broken asset
    audio.play().catch(() => resolve());
  });
}

/**
 * Play the audio-bearing events (paragraph + sound_effect) sequentially.
 * `onEventStart` fires before each event's audio starts — use for UI highlighting.
 * `isCancelled` is polled before each event; if true, stops playback early.
 */
export async function playSegmentAudio(
  events: StoryEvent[],
  onEventStart: (ev: StoryEvent) => void,
  isCancelled: () => boolean,
): Promise<void> {
  for (const ev of events) {
    if (isCancelled()) break;

    if (ev.type === 'paragraph' || ev.type === 'sound_effect') {
      onEventStart(ev);
      if (ev.audioUrl) {
        await playUrl(ev.audioUrl);
      }
      // Small gap between events
      await new Promise(r => setTimeout(r, 120));
    }

    // skip music, ask_user_to_draw, ask_user_to_speak, finish — handled elsewhere
    if (isCancelled()) break;
  }
}

// ---------------------------------------------------------------------------
// Music player (background, looped)
// ---------------------------------------------------------------------------

/**
 * Create a background music player from an event's audioUrl.
 * Returns a cleanup function (call to stop/remove).
 */
export function startBackgroundMusic(url: string, volume = 0.15): () => void {
  const audio = new Audio(url);
  audio.loop   = true;
  audio.volume = volume;
  audio.play().catch(() => {});
  return () => { audio.pause(); audio.src = ''; };
}
