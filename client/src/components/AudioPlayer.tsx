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
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Revoke old URL and create new one whenever the blob changes
  useEffect(() => {
    if (!audioBlob) return;

    const url = URL.createObjectURL(audioBlob);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setIsPlaying(false);
    setProgress(0);
  }, [audioBlob]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMainClick = () => {
    if (!audioUrl) {
      // No audio yet — trigger generation
      onNarrateClick();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setProgress(0);
  };

  const buttonDisabled = disabled || isLoading;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 shadow-sm">
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => {
            setIsPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            setProgress(el.duration ? (el.currentTime / el.duration) * 100 : 0);
          }}
          onError={() => setIsPlaying(false)}
        />
      )}

      {/* Main button */}
      <button
        onClick={handleMainClick}
        disabled={buttonDisabled}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md ${
          buttonDisabled
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
            : isPlaying
            ? 'bg-gradient-to-r from-orange-400 to-pink-400 text-white hover:opacity-90 active:scale-95'
            : 'bg-gradient-to-r from-amber-400 to-orange-400 text-white hover:opacity-90 active:scale-95'
        }`}
        aria-label={isLoading ? 'Generating narration' : isPlaying ? 'Pause narration' : 'Narrate story'}
      >
        {isLoading ? (
          <>
            <span className="animate-spin inline-block">🎙️</span> Generating…
          </>
        ) : isPlaying ? (
          <>⏸ Pause</>
        ) : audioUrl ? (
          <>▶ Play</>
        ) : (
          <>🎧 Narrate</>
        )}
      </button>

      {/* Stop button (only while playing) */}
      {isPlaying && (
        <button
          onClick={handleStop}
          className="px-3 py-2.5 rounded-xl bg-red-100 text-red-500 hover:bg-red-200 text-sm font-semibold active:scale-95 transition-all"
          aria-label="Stop narration"
        >
          ⏹ Stop
        </button>
      )}

      {/* Progress bar */}
      {audioUrl && (
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-amber-700 font-medium">
            {isPlaying ? '🎵 Playing…' : '🎵 Ready to play'}
          </span>
        </div>
      )}

      {!audioUrl && !isLoading && !disabled && (
        <span className="text-xs text-amber-700 italic">
          Click to generate & play narration
        </span>
      )}
    </div>
  );
}
