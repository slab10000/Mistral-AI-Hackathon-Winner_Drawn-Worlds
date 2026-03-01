import { useEffect, useState } from 'react';

interface Props {
  prompt: string;       // shown to the child
  onWord: (word: string) => void;
  onSkip: () => void;
  busy: boolean;
}

type RecordingState = 'idle' | 'recording' | 'done';

/**
 * Voice-capture prompt shown during an "ask_user_to_speak" interaction.
 * Shows a pulsing mic button; on tap, starts Voxtral recording.
 */
export default function SpeakPrompt({ prompt, onWord, onSkip, busy }: Props) {
  const [state, setState] = useState<RecordingState>('idle');
  const [dots,  setDots ] = useState('');

  // Animate "Listening..." dots
  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(t);
  }, [state]);

  const handleRecord = async () => {
    if (state !== 'idle' || busy) return;
    setState('recording');
    try {
      // Dynamically import so we don't load the Mistral SDK until needed
      const { transcribeOneWord } = await import('../lib/voxtral');
      const apiKey = (import.meta.env as Record<string, string | undefined>)['VITE_MISTRAL_API_KEY'] ?? '';
      const word = await transcribeOneWord(apiKey);
      setState('done');
      onWord(word || '(silence)');
    } catch (e) {
      console.warn('[SpeakPrompt] transcription failed:', e);
      setState('idle');
    }
  };

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-6 p-8"
      style={{ background: '#fdf8ef' }}
    >
      {/* Prompt */}
      <div className="text-center">
        <p style={{ fontSize: '11px', fontFamily: '"Nunito",sans-serif', fontWeight: 700, color: 'rgba(120,80,30,0.55)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          🎙️ Say it out loud!
        </p>
        <p style={{ fontFamily: '"Lora",serif', fontSize: '20px', fontWeight: 700, color: '#5b3712', lineHeight: 1.4, maxWidth: '320px' }}>
          {prompt}
        </p>
      </div>

      {/* Big mic button */}
      <button
        onClick={handleRecord}
        disabled={state !== 'idle' || busy}
        style={{
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          border: 'none',
          cursor: state !== 'idle' || busy ? 'default' : 'pointer',
          fontSize: '40px',
          background: state === 'recording'
            ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
            : 'linear-gradient(135deg, #7c3aed, #db2777)',
          boxShadow: state === 'recording'
            ? '0 0 0 12px rgba(239,68,68,0.2), 0 8px 30px rgba(239,68,68,0.4)'
            : '0 8px 30px rgba(124,58,237,0.4)',
          transition: 'all 0.3s',
          animation: state === 'recording' ? 'micPulse 1s ease-in-out infinite' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        🎙️
      </button>

      {/* Status */}
      <p style={{ fontFamily: '"Nunito",sans-serif', fontSize: '14px', fontWeight: 700, color: 'rgba(100,65,15,0.6)', minHeight: '20px' }}>
        {state === 'idle'      ? 'Tap the mic and speak!' : ''}
        {state === 'recording' ? `Listening${dots}` : ''}
        {state === 'done'      ? '✅ Got it!' : ''}
      </p>

      {/* Skip */}
      <button
        onClick={onSkip}
        disabled={busy || state === 'recording'}
        style={{
          fontFamily: '"Nunito",sans-serif',
          fontSize: '12px',
          fontWeight: 700,
          padding: '8px 16px',
          borderRadius: '10px',
          border: '1px solid rgba(175,138,80,0.3)',
          background: 'transparent',
          color: 'rgba(100,65,15,0.45)',
          cursor: busy || state === 'recording' ? 'not-allowed' : 'pointer',
        }}
      >
        Skip
      </button>

      <style>{`
        @keyframes micPulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.07); }
        }
      `}</style>
    </div>
  );
}
