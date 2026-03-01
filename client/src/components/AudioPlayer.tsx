import { useEffect, useRef, useState } from 'react';

interface Props {
  audioBlob: Blob | null;
  isLoading: boolean;
  onNarrateClick: () => void;
  disabled: boolean;
}

export default function AudioPlayer({ audioBlob, isLoading, onNarrateClick, disabled }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress,  setProgress ] = useState(0);
  const [audioUrl,  setAudioUrl ] = useState<string | null>(null);

  useEffect(() => {
    if (!audioBlob) return;
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
    setIsPlaying(false);
    setProgress(0);
  }, [audioBlob]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, []);

  const handleMain = () => {
    if (!audioUrl) { onNarrateClick(); return; }
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) { a.pause(); setIsPlaying(false); }
    else           { a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false)); }
  };

  const handleStop = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause(); a.currentTime = 0;
    setIsPlaying(false); setProgress(0);
  };

  const off = disabled || isLoading;

  return (
    <div
      className="flex items-center gap-3 flex-shrink-0"
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'rgba(175,138,80,0.08)',
        border: '1px solid rgba(175,138,80,0.2)',
      }}
    >
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => { setIsPlaying(false); setProgress(0); }}
          onTimeUpdate={e => {
            const el = e.currentTarget;
            setProgress(el.duration ? (el.currentTime / el.duration) * 100 : 0);
          }}
          onError={() => setIsPlaying(false)}
        />
      )}

      {/* Main button */}
      <button
        onClick={handleMain}
        disabled={off}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 16px',
          borderRadius: '6px',
          fontFamily: '"Nunito",sans-serif',
          fontSize: '12px',
          fontWeight: 800,
          border: 'none',
          cursor: off ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          background: off
            ? 'rgba(0,0,0,0.07)'
            : isPlaying
            ? 'linear-gradient(135deg, #b45309, #92400e)'
            : 'linear-gradient(135deg, #92400e, #78350f)',
          color: off ? 'rgba(0,0,0,0.3)' : '#fde68a',
          boxShadow: off ? 'none' : '0 3px 12px rgba(120,53,15,0.35)',
        }}
        aria-label={isLoading ? 'Generating' : isPlaying ? 'Pause' : 'Narrate'}
      >
        {isLoading ? (
          <><span className="animate-spin">🎙️</span> Generating…</>
        ) : isPlaying ? (
          <>⏸ Pause</>
        ) : audioUrl ? (
          <>▶ Play</>
        ) : (
          <>🎧 Narrate</>
        )}
      </button>

      {isPlaying && (
        <button
          onClick={handleStop}
          style={{
            padding: '8px 10px',
            borderRadius: '6px',
            fontFamily: '"Nunito",sans-serif',
            fontSize: '11px',
            fontWeight: 700,
            border: '1px solid rgba(175,138,80,0.3)',
            background: 'rgba(175,138,80,0.1)',
            color: 'rgba(100,65,15,0.7)',
            cursor: 'pointer',
          }}
        >
          ⏹
        </button>
      )}

      {/* Progress bar */}
      {audioUrl && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ height: '3px', background: 'rgba(175,138,80,0.2)', borderRadius: '99px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #92400e, #d97706)',
                borderRadius: '99px',
                transition: 'width 0.3s',
              }}
            />
          </div>
          <p style={{ fontSize: '10px', color: 'rgba(100,65,15,0.5)', fontFamily:'"Nunito",sans-serif', fontWeight:600, marginTop:'3px' }}>
            {isPlaying ? '♪ playing…' : '♪ ready'}
          </p>
        </div>
      )}

      {!audioUrl && !isLoading && !disabled && (
        <p style={{ fontSize: '10px', fontStyle:'italic', color:'rgba(100,65,15,0.45)', fontFamily:'"Lora",serif' }}>
          click to narrate
        </p>
      )}
    </div>
  );
}
