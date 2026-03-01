import { Mistral } from '@mistralai/mistralai';

// ---------------------------------------------------------------------------
// Recording constants
// ---------------------------------------------------------------------------

const MAX_RECORD_MS = 5000;   // stop after 5 s
const SILENCE_MS    = 1500;   // stop after 1.5 s of silence below threshold
const SILENCE_DB    = -50;    // dBFS threshold — below this = silence

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute dBFS from an analyser's float frequency data (returned by getFloatTimeDomainData). */
function getDbfs(analyser: AnalyserNode): number {
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return rms === 0 ? -Infinity : 20 * Math.log10(rms);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Record from the microphone, detect silence to stop, then transcribe
 * using the Mistral (Voxtral) audio transcription API.
 *
 * Returns the first word of the transcript (or '' on failure/silence).
 *
 * @param apiKey   Mistral API key
 * @param onStart  Optional callback fired when recording begins
 */
export async function transcribeOneWord(
  apiKey: string,
  onStart?: () => void,
): Promise<string> {
  // ── 1. Open microphone ───────────────────────────────────────────────────
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

  // ── 2. Set up silence detection with Web Audio API ───────────────────────
  const audioCtx = new AudioContext();
  const source   = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  onStart?.();

  // ── 3. Record via MediaRecorder ──────────────────────────────────────────
  // Prefer webm/opus; fall back to whatever the browser supports
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  // ── 4. Silence + max-duration detection loop ─────────────────────────────
  let silenceStart: number | null = null;
  const recordStart = Date.now();

  const stopRecording = (): Promise<Blob> => new Promise(resolve => {
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      audioCtx.close().catch(() => {});
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      resolve(blob);
    };
    if (recorder.state === 'recording') recorder.stop();
    else resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
  });

  recorder.start(100); // collect in 100 ms chunks

  const audioBlob = await new Promise<Blob>(resolve => {
    const interval = setInterval(() => {
      const db  = getDbfs(analyser);
      const now = Date.now();

      // Silence detection
      if (db < SILENCE_DB) {
        if (silenceStart === null) silenceStart = now;
        else if (now - silenceStart > SILENCE_MS) {
          clearInterval(interval);
          stopRecording().then(resolve);
          return;
        }
      } else {
        silenceStart = null;
      }

      // Max duration
      if (now - recordStart > MAX_RECORD_MS) {
        clearInterval(interval);
        stopRecording().then(resolve);
      }
    }, 100);
  });

  // ── 5. Send to Mistral transcription API ─────────────────────────────────
  const client = new Mistral({ apiKey });

  try {
    const result = await client.audio.transcriptions.complete({
      model: 'voxtral-mini-2507',
      file:  audioBlob,
    });

    const text = (result.text ?? '').trim();
    // Return just the first word
    return text.split(/\s+/)[0] ?? '';
  } catch (e) {
    console.warn('[voxtral] transcription failed:', e);
    return '';
  }
}
